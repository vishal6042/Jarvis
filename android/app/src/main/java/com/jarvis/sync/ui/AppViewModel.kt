package com.jarvis.sync.ui

import android.app.Application
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jarvis.sync.data.AccountDto
import com.jarvis.sync.data.AccountRefDto
import com.jarvis.sync.data.AiFilterDto
import com.jarvis.sync.data.ApiException
import com.jarvis.sync.data.ChatSummaryDto
import com.jarvis.sync.data.CreateReminderDto
import com.jarvis.sync.data.CreateTransactionDto
import com.jarvis.sync.data.DevicePrefs
import com.jarvis.sync.data.EnrichRequestDto
import com.jarvis.sync.data.FilterRequestDto
import com.jarvis.sync.data.GoalPayloadDto
import com.jarvis.sync.data.NotificationDto
import com.jarvis.sync.data.ReceiptDto
import com.jarvis.sync.data.ReceiptRequestDto
import com.jarvis.sync.data.ReviewStore
import com.jarvis.sync.data.SyncRepository
import com.jarvis.sync.data.TransactionDto
import com.jarvis.sync.data.VisualDto
import com.jarvis.sync.data.db.SessionEntity
import com.jarvis.sync.finance.CATEGORIES
import com.jarvis.sync.finance.FundedPlan
import com.jarvis.sync.finance.GoalRead
import com.jarvis.sync.finance.MoneyModel
import com.jarvis.sync.finance.Verdict
import com.jarvis.sync.finance.day
import com.jarvis.sync.finance.setAsideDay
import com.jarvis.sync.notify.AlertNotifier
import com.jarvis.sync.sms.InboxSms
import com.jarvis.sync.work.BriefScheduler
import com.jarvis.sync.work.SyncScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.time.LocalDate
import java.time.YearMonth

sealed interface SessionUi {
    data object Loading : SessionUi
    data object LoggedOut : SessionUi
    data class LoggedIn(val session: SessionEntity) : SessionUi
}

class AppViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = SyncRepository.get(app)

    /** Device-level settings: the remembered server address, the app lock, the reserve, the brief. */
    private val devicePrefs = DevicePrefs(app)
    private val reviewStore = ReviewStore(app)

    val session = repo.sessionFlow()
        .map { if (it == null) SessionUi.LoggedOut else SessionUi.LoggedIn(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SessionUi.Loading)

    val dashboard = repo.dashboardFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** Bumped whenever a suggestion arrives or one is waved away, so the model is rebuilt. */
    private val reviewTick = MutableStateFlow(0)
    private val reserveFlow = MutableStateFlow(devicePrefs.reserve)

    /** Everything the tabs show, rebuilt off the main thread whenever the cache changes. */
    val model = combine(repo.dashboardFlow(), reviewTick, reserveFlow) { cache, _, reserve ->
        val x = cache?.let { repo.parseExtras(it) } ?: return@combine null
        MoneyModel(cache, x, reserve, reviewStore.suggestions(), reviewStore.dismissed())
    }.flowOn(Dispatchers.Default).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** The server to offer on the sign-in screen — the last one used, else just the scheme. */
    val rememberedBaseUrl: String get() = devicePrefs.baseUrl

    init {
        if (!devicePrefs.hasBaseUrl) {
            viewModelScope.launch {
                repo.sessionFlow().firstOrNull()?.baseUrl?.takeIf { it.isNotBlank() }?.let { devicePrefs.baseUrl = it }
            }
        }
    }

    // ---- settings ----

    var lockEnabled by mutableStateOf(devicePrefs.lockEnabled)
        private set

    fun setAppLock(enabled: Boolean) {
        devicePrefs.lockEnabled = enabled
        lockEnabled = enabled
    }

    var morningBrief by mutableStateOf(devicePrefs.morningBrief)
        private set

    fun switchMorningBrief(on: Boolean) {
        BriefScheduler.set(getApplication(), on)
        morningBrief = on
    }

    val reserve: Double get() = reserveFlow.value

    fun setReserve(v: Double) {
        devicePrefs.reserve = v
        reserveFlow.value = v
    }

    val isAdmin = session
        .map { it !is SessionUi.LoggedIn || it.session.admin }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), true)

    val pendingCount = repo.pendingCount()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val log = repo.syncLog()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    // ---- sign-in ----

    var loginBusy by mutableStateOf(false)
        private set
    var loginError by mutableStateOf<String?>(null)
        private set

    /** null while checking or not yet asked; true when a Jarvis answers at the typed address. */
    var serverFound by mutableStateOf<Boolean?>(null)
        private set
    private var probe: Job? = null

    fun checkServer(baseUrl: String) {
        probe?.cancel()
        serverFound = null
        if (baseUrl.length < 12) return
        probe = viewModelScope.launch {
            delay(500) // wait for the typing to settle
            serverFound = repo.reachable(baseUrl)
        }
    }

    fun login(baseUrl: String, username: String, password: String) {
        viewModelScope.launch {
            loginBusy = true
            loginError = null
            try {
                repo.login(baseUrl, username, password)
                refreshDashboard()
            } catch (e: Exception) {
                loginError = friendly(e)
            } finally {
                loginBusy = false
            }
        }
    }

    fun logout() = viewModelScope.launch { repo.logout(); reviewTick.value++ }

    fun setForwarding(enabled: Boolean) = viewModelScope.launch { repo.setForwarding(enabled) }

    // ---- refresh ----

    var refreshing by mutableStateOf(false)
        private set
    var offline by mutableStateOf(false)
        private set

    fun syncNow() {
        SyncScheduler.syncNow(getApplication())
        refreshDashboard()
    }

    fun refreshDashboard() {
        if (refreshing) return
        viewModelScope.launch {
            refreshing = true
            try {
                repo.refreshDashboard()
                offline = false
                repo.heartbeat()
            } catch (e: Exception) {
                offline = true
            } finally {
                refreshing = false
            }
        }
    }

    // ---- alerts ----

    var alerts by mutableStateOf<List<NotificationDto>>(emptyList())
        private set
    val unreadAlerts: Int get() = alerts.count { !it.read }
    private var alertStream: Job? = null

    fun loadAlerts() {
        viewModelScope.launch { runCatching { alerts = repo.notifications() } }
    }

    /** Keep the SSE stream open while the app is alive; reconnect after a drop. */
    fun startAlertStream() {
        if (alertStream?.isActive == true) return
        alertStream = viewModelScope.launch {
            while (isActive) {
                runCatching {
                    repo.streamNotifications { n ->
                        alerts = listOf(n) + alerts.filter { it.id != n.id }
                        AlertNotifier.notifyNew(getApplication(), listOf(n))
                    }
                }
                delay(15_000)
            }
        }
    }

    fun markAllAlertsRead() {
        alerts = alerts.map { it.copy(read = true) }
        viewModelScope.launch { runCatching { repo.markAllNotificationsRead() } }
    }

    // ---- quick add ----

    var accounts by mutableStateOf<List<AccountDto>>(emptyList())
        private set
    var addBusy by mutableStateOf(false)
        private set
    var addError by mutableStateOf<String?>(null)
        private set

    fun loadAccounts() {
        viewModelScope.launch { runCatching { accounts = repo.accounts() } }
    }

    fun addTransaction(req: CreateTransactionDto, onDone: () -> Unit) {
        viewModelScope.launch {
            addBusy = true
            addError = null
            try {
                repo.createManualTransaction(req)
                onDone()
                refreshDashboard()
            } catch (e: Exception) {
                addError = friendly(e)
            } finally {
                addBusy = false
            }
        }
    }

    fun clearAddError() {
        addError = null
    }

    // ---- reading a screenshot or receipt ----

    var scanBusy by mutableStateOf(false)
        private set
    var scanError by mutableStateOf<String?>(null)
        private set

    /**
     * Read a picked image on the PC's vision model. The image is shrunk first: a phone screenshot
     * is several megabytes, the model reads a 1,600-pixel one just as well, and the upload over
     * Wi-Fi is the slow part.
     */
    fun scanImage(uri: Uri, onRead: (ReceiptDto, Bitmap?) -> Unit) {
        viewModelScope.launch {
            scanBusy = true
            scanError = null
            try {
                val (b64, preview) = withContext(Dispatchers.IO) { encodeImage(uri) }
                val read = repo.aiReceipt(ReceiptRequestDto(b64, "image/jpeg", CATEGORIES))
                if (read.amount == null && read.merchant == null) {
                    scanError = "Jarvis could not find a payment in that image."
                } else {
                    onRead(read, preview)
                }
            } catch (e: Exception) {
                scanError = "Could not read it: " + friendly(e)
            } finally {
                scanBusy = false
            }
        }
    }

    private fun encodeImage(uri: Uri): Pair<String, Bitmap?> {
        val resolver = getApplication<Application>().contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 1600) sample *= 2
        val bmp = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: throw IOException("Could not open the image")
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 85, out)
        val thumb = Bitmap.createScaledBitmap(bmp, 260, (260f * bmp.height / bmp.width).toInt().coerceAtLeast(1), true)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP) to thumb
    }

    // ---- Money: filters ----

    var month by mutableStateOf(YearMonth.now())
    var query by mutableStateOf("")

    /** Filters Jarvis understood from a typed question; null when the search is plain text. */
    var aiFilter by mutableStateOf<AiFilterDto?>(null)
        private set
    var aiFilterQuery by mutableStateOf<String?>(null)
        private set
    var filterBusy by mutableStateOf(false)
        private set
    var categoryFilter by mutableStateOf<String?>(null)

    fun clearAiFilter() {
        aiFilter = null
        aiFilterQuery = null
    }

    /** Hand a typed question to the model: "food over ₹500 last week" becomes filters. */
    fun askFilter(text: String) {
        val q = text.trim()
        if (q.isEmpty() || filterBusy) return
        val m = model.value
        viewModelScope.launch {
            filterBusy = true
            try {
                val seen = m?.ledger?.mapNotNull { it.category }.orEmpty()
                val f = repo.aiFilter(
                    FilterRequestDto(
                        query = q,
                        today = LocalDate.now().toString(),
                        categories = (CATEGORIES + seen).distinct(),
                        accounts = m?.accounts.orEmpty().map { AccountRefDto(it.id, it.displayName ?: (it.bank + " " + it.last4)) },
                    )
                )
                aiFilter = f
                aiFilterQuery = q
                query = ""
                // A question about another month moves the list there.
                f.from?.let { runCatching { month = YearMonth.from(LocalDate.parse(it)) } }
            } catch (e: Exception) {
                aiFilter = null
            } finally {
                filterBusy = false
            }
        }
    }

    /** The month's rows through every filter in force, newest first. */
    fun visibleRows(m: MoneyModel): List<TransactionDto> {
        val f = aiFilter
        val needle = query.trim().lowercase()
        val from = f?.from?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val to = f?.to?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val base = if (from != null || to != null) m.ledger else m.rowsIn(month)
        return base.filter { t ->
            val d = t.day()
            (from == null || !d.isBefore(from)) && (to == null || !d.isAfter(to)) &&
                (f?.category == null || t.category.equals(f.category, true)) &&
                (f?.direction == null || t.direction == f.direction) &&
                (f?.minAmount == null || t.amount >= f.minAmount) &&
                (f?.maxAmount == null || t.amount <= f.maxAmount) &&
                (f?.accountId == null || t.accountId == f.accountId) &&
                (f?.text.isNullOrBlank() || listOfNotNull(t.merchant, t.merchantNorm, t.note).any { it.contains(f!!.text!!, true) }) &&
                (categoryFilter == null || t.category == categoryFilter) &&
                (needle.isEmpty() || listOfNotNull(t.merchant, t.merchantNorm, t.category, t.accountName, t.note)
                    .any { it.lowercase().contains(needle) })
        }.sortedByDescending { it.occurredAt }
    }

    // ---- Money: edits ----

    /** Move rows to a category; with [always], a rule so the merchant is filed there from now on. */
    fun recategorise(ids: List<Long>, category: String, rulePattern: String? = null, dismissKey: String? = null) {
        viewModelScope.launch {
            val saved = ids.mapNotNull { id -> runCatching { repo.setCategory(id, category) }.getOrNull() }
            if (rulePattern != null) runCatching { repo.createRule(rulePattern, category) }
            if (dismissKey != null) dismiss(listOf(dismissKey))
            repo.replaceInLedger(saved)
        }
    }

    fun acceptAllConfident(m: MoneyModel) {
        val fixes = m.queue.confident
        viewModelScope.launch {
            val saved = fixes.flatMap { (ids, cat) -> ids.mapNotNull { runCatching { repo.setCategory(it, cat) }.getOrNull() } }
            repo.replaceInLedger(saved)
        }
    }

    fun dismiss(keys: List<String>) {
        reviewStore.dismiss(keys)
        reviewTick.value++
    }

    /** Asking the model about merchants: done / total while it runs, null otherwise. */
    var suggestProgress by mutableStateOf<Pair<Int, Int>?>(null)
        private set
    var suggestNote by mutableStateOf<String?>(null)
        private set

    /** Ask the model about every merchant in the queue it has not read yet, fifteen at a time. */
    fun readMerchants(m: MoneyModel) {
        if (suggestProgress != null) return
        val known = reviewStore.suggestions()
        val todo = m.queue.merchants.filter { com.jarvis.sync.finance.merchantKey(it) !in known }
        if (todo.isEmpty()) {
            suggestNote = "Jarvis has already read every merchant here."
            return
        }
        suggestNote = null
        viewModelScope.launch {
            val examples = m.ledger.filter { it.merchant != null && it.merchantNorm != null && !it.category.isNullOrBlank() && it.category != "Uncategorized" }
                .distinctBy { it.merchant }.take(12).map { "${it.merchant} => ${it.category}" }
            var failed = 0
            suggestProgress = 0 to todo.size
            for ((i, batch) in todo.chunked(15).withIndex()) {
                try {
                    val answers = repo.aiMerchants(EnrichRequestDto(batch, CATEGORIES, examples))
                    reviewStore.addSuggestions(answers, batch)
                    reviewTick.value++
                } catch (e: Exception) {
                    failed += batch.size
                }
                suggestProgress = minOf(todo.size, (i + 1) * 15) to todo.size
            }
            suggestProgress = null
            if (failed > 0) suggestNote = "Jarvis could not read $failed of ${todo.size}. Try again for the rest."
        }
    }

    // ---- card bills ----

    /** The hand-marked payment just made, per statement account, so it can be taken back. */
    var paidJustNow by mutableStateOf<Map<Long, Long>>(emptyMap())
        private set
    var cardBusy by mutableStateOf(false)
        private set

    fun markCardPaid(accountId: Long, amount: Double) {
        viewModelScope.launch {
            cardBusy = true
            runCatching { repo.markCardPaid(accountId, amount) }.onSuccess { t ->
                paidJustNow = paidJustNow + (accountId to t.id)
                refreshDashboard()
            }
            cardBusy = false
        }
    }

    fun undoCardPaid(accountId: Long) {
        val id = paidJustNow[accountId] ?: return
        viewModelScope.launch {
            cardBusy = true
            runCatching { repo.undoCardPaid(id) }.onSuccess {
                paidJustNow = paidJustNow - accountId
                refreshDashboard()
            }
            cardBusy = false
        }
    }

    fun markPaid(reminderId: Long, occurredOn: String, amount: Double?) {
        viewModelScope.launch {
            runCatching { repo.markReminderPaid(reminderId, occurredOn, amount) }.onSuccess { refreshDashboard() }
        }
    }

    // ---- goals ----

    var planBusy by mutableStateOf<Long?>(null)
        private set

    /**
     * Take the recommended plan: move the date if the plan needs to, note the deposits on the
     * goal, and add the monthly set-aside reminder -- what the web planner's "Use this plan" does.
     */
    fun usePlan(read: GoalRead, plan: FundedPlan, m: MoneyModel) {
        val g = read.goal
        viewModelScope.launch {
            planBusy = g.id
            runCatching {
                repo.updateGoal(
                    g.id,
                    GoalPayloadDto(
                        name = g.name,
                        targetAmount = g.targetAmount,
                        savedAmount = g.savedAmount,
                        targetDate = if (plan.keepsDate) g.targetDate else plan.by.toString(),
                        color = g.color,
                        notes = listOfNotNull(g.notes?.takeIf { it.isNotBlank() && !it.startsWith("Funded by") }, plan.note).joinToString("\n"),
                    ),
                )
                if (plan.monthly > 0) {
                    val day = setAsideDay(m.forecast.salary)
                    val today = LocalDate.now()
                    val first = YearMonth.from(today).atDay(day).let { if (it.isAfter(today)) it else it.plusMonths(1) }
                    repo.createReminder(
                        CreateReminderDto(
                            title = "Set aside for " + g.name,
                            date = first.toString(),
                            type = "OTHER",
                            amount = plan.monthly,
                            notes = plan.note,
                            repeat = "monthly",
                        )
                    )
                }
            }
            refreshDashboard()
            planBusy = null
        }
    }

    // ---- Ask ----

    enum class Period(val label: String) { THIS_MONTH("This month"), LAST_MONTH("Last month"), THIS_YEAR("This year") }

    data class ChatMessage(
        val fromUser: Boolean,
        val text: String,
        val visuals: List<VisualDto> = emptyList(),
        val followUps: List<String> = emptyList(),
        /** A screenshot the person attached, shown as their turn. */
        val image: Bitmap? = null,
        /** What Jarvis read off that screenshot, awaiting "Add it". */
        val receipt: ReceiptDto? = null,
        val receiptAdded: Boolean = false,
    )

    var chat by mutableStateOf<List<ChatMessage>>(emptyList())
        private set
    var chatBusy by mutableStateOf(false)
        private set
    var period by mutableStateOf<Period?>(Period.THIS_MONTH)
    var scopeMember by mutableStateOf(true)
    private var chatId: Long? = null
    var chatList by mutableStateOf<List<ChatSummaryDto>>(emptyList())
        private set

    fun ask(question: String) {
        val q = question.trim()
        if (q.isEmpty() || chatBusy) return
        chat = chat + ChatMessage(true, q)
        chatBusy = true
        val m = model.value
        val scope = listOfNotNull(
            period?.let { "About " + it.label.lowercase() },
            if (scopeMember) memberScopeName()?.let { "for $it" } else null,
        ).joinToString(", ").let { if (it.isEmpty()) "" else "($it) " }
        viewModelScope.launch {
            val reply = runCatching { repo.ask(scope + q, m?.context(), m?.snapshot()) }
            val msg = reply.fold(
                onSuccess = { r -> ChatMessage(false, r.answer, r.visuals, followUpsFor(q, r.visuals)) },
                onFailure = { ChatMessage(false, "I could not reach Jarvis just now. " + friendly(it as? Exception ?: Exception(it))) },
            )
            chat = chat + msg
            chatBusy = false
            if (reply.isSuccess) record(q, msg)
        }
    }

    /** Keep the conversation on the server with the web app's, so it can be picked up on either. */
    private fun record(question: String, answer: ChatMessage) {
        viewModelScope.launch {
            runCatching {
                val id = chatId ?: repo.startChat().id.also { chatId = it }
                repo.appendTurn(id, "user", question, emptyList())
                repo.appendTurn(id, "assistant", answer.text, answer.visuals)
            }
        }
    }

    fun newChat() {
        chat = emptyList()
        chatId = null
    }

    fun loadChatList() {
        viewModelScope.launch { runCatching { chatList = repo.chats() } }
    }

    fun openChat(id: Long) {
        viewModelScope.launch {
            runCatching { repo.chatTranscript(id) }.onSuccess { t ->
                chatId = t.id
                chat = t.messages.map { turn ->
                    ChatMessage(turn.role == "user", turn.body, repo.parseVisuals(turn.visualsJson))
                }
            }
        }
    }

    /** The name the member chip shows: whose money this sign-in sees. */
    fun memberScopeName(): String? {
        val s = (session.value as? SessionUi.LoggedIn)?.session ?: return null
        if (s.admin) return null
        return model.value?.x?.members?.firstOrNull { it.id == s.memberId }?.name
    }

    /** A screenshot attached in Ask: shown as the person's turn, then read. */
    fun askAboutImage(uri: Uri) {
        if (chatBusy) return
        chatBusy = true
        viewModelScope.launch {
            val pending = ChatMessage(true, "", image = null)
            chat = chat + pending
            try {
                val (b64, preview) = withContext(Dispatchers.IO) { encodeImage(uri) }
                chat = chat.dropLast(1) + pending.copy(image = preview)
                val read = repo.aiReceipt(ReceiptRequestDto(b64, "image/jpeg", CATEGORIES))
                chat = chat + if (read.amount == null) {
                    ChatMessage(false, "I could not find a payment in that image.")
                } else {
                    ChatMessage(false, "", receipt = read)
                }
            } catch (e: Exception) {
                chat = chat + ChatMessage(false, "I could not read that image. " + friendly(e))
            } finally {
                chatBusy = false
            }
        }
    }

    /** "Add it": the transaction read off a screenshot, saved as-is. */
    fun addReceipt(index: Int, r: ReceiptDto, accountId: Long?) {
        viewModelScope.launch {
            runCatching {
                repo.createManualTransaction(
                    CreateTransactionDto(
                        accountId = accountId,
                        amount = r.amount ?: return@runCatching,
                        direction = r.direction,
                        merchant = r.merchant,
                        category = r.category,
                        occurredAt = r.occurredOn?.let { LocalDate.parse(it).atTime(12, 0).atZone(java.time.ZoneId.systemDefault()).toInstant().toString() },
                        note = listOfNotNull("From a screenshot", r.reference?.let { "ref $it" }).joinToString(" · "),
                    )
                )
            }.onSuccess {
                chat = chat.mapIndexed { i, msg -> if (i == index) msg.copy(receiptAdded = true) else msg }
                refreshDashboard()
            }
        }
    }

    // ---- Inbox ----

    var inbox by mutableStateOf<List<InboxSms>>(emptyList())
        private set
    var inboxBusy by mutableStateOf(false)
        private set
    var inboxError by mutableStateOf<String?>(null)
        private set
    var retryBusy by mutableStateOf(false)
        private set
    var retryNote by mutableStateOf<String?>(null)
        private set

    val importedSmsIds = repo.importedSmsIds().map { it.toHashSet() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), hashSetOf<Long>())
    val queuedSmsIds = repo.queuedSmsIds().map { it.toHashSet() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), hashSetOf<Long>())

    /** Every server verdict per inbox message, oldest first. */
    val verdicts = repo.smsVerdicts()
        .map { list -> list.groupBy({ it.smsId }, { Verdict(it.status, it.detail, it.rawMessageId, it.transactionId) }) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    fun loadInbox() {
        viewModelScope.launch {
            inboxBusy = true
            inboxError = null
            try {
                inbox = repo.scanInbox()
            } catch (e: SecurityException) {
                inboxError = "SMS permission is needed to read the inbox."
            } catch (e: Exception) {
                inboxError = e.message ?: "Couldn't read the inbox."
            } finally {
                inboxBusy = false
            }
        }
    }

    /** Queue the given inbox messages (those not already sent) and kick the sync worker. */
    fun syncInbox(messages: List<InboxSms>) {
        val done = importedSmsIds.value
        val fresh = messages.filter { it.id !in done }
        if (fresh.isEmpty()) return
        viewModelScope.launch {
            inboxBusy = true
            try {
                repo.syncInbox(fresh)
                SyncScheduler.syncNow(getApplication())
            } catch (e: Exception) {
                inboxError = e.message ?: "Sync failed."
            } finally {
                inboxBusy = false
            }
        }
    }

    fun retryFailed(smsIds: Collection<Long>) {
        if (retryBusy || smsIds.isEmpty()) return
        viewModelScope.launch {
            retryBusy = true
            retryNote = null
            try {
                val fixed = repo.retryFailed(smsIds, inbox)
                retryNote = when (fixed) {
                    0 -> "Jarvis still could not read them. Add them by hand if they matter."
                    smsIds.size -> "All ${smsIds.size} read this time."
                    else -> "$fixed of ${smsIds.size} read this time."
                }
                refreshDashboard()
            } catch (e: Exception) {
                retryNote = "Could not retry: " + friendly(e)
            } finally {
                retryBusy = false
            }
        }
    }

    private fun friendly(e: Exception): String = when {
        e is ApiException.Http && e.code == 401 -> "Invalid username or password."
        e is ApiException.Unauthorized -> "Invalid username or password."
        e is ApiException.Http -> "Server error (HTTP ${e.code})."
        e is IOException -> "Can't reach the server. Check the address and that the phone is on the same Wi-Fi."
        else -> e.message ?: "Something went wrong."
    }
}

/**
 * The next question, one tap away. Drawn from what was asked and the figures the answer showed —
 * never from the prose — so they are always about something on screen. Mirrors the web app's
 * components/assistant/FollowUps.tsx.
 */
fun followUpsFor(question: String, visuals: List<VisualDto>): List<String> {
    val q = question.lowercase()
    fun topOf(title: Regex): String? = visuals
        .firstOrNull { it.kind == "breakdown" && title.containsMatchIn(it.title) && it.points.isNotEmpty() }
        ?.points?.maxByOrNull { it.value ?: 0.0 }?.label?.trim()?.ifEmpty { null }
    val topCategory = topOf(Regex("by category", RegexOption.IGNORE_CASE))
    val topMerchant = topOf(Regex("merchant", RegexOption.IGNORE_CASE))
    val spendy = Regex("\\b(spen[dt]|spending|expens|cost|paid|bought|shop|food|categor|merchant|bills?|where did)").containsMatchIn(q) ||
        visuals.any { Regex("^spend|spent|merchant", RegexOption.IGNORE_CASE).containsMatchIn(it.title) }
    val out = mutableListOf<String>()
    topCategory?.let { out += "What was in $it?" }
    topMerchant?.let { out += "What did I buy at $it?" }
    if (spendy) out += if ("last month" in q) "Compare with the month before" else "Compare with last month"
    if ("sav" in q) out += "How can I save more this month?"
    if (Regex("loan|emi|debt").containsMatchIn(q)) out += "When will I be debt-free?"
    if (Regex("invest|sip|\\bfd\\b|mutual|portfolio").containsMatchIn(q)) out += "What matures next?"
    if (Regex("safe to spend|afford|left to spend").containsMatchIn(q)) out += "What's due before salary?"
    for (f in listOf("What's due this week?", "Give me a summary")) if (out.size < 2) out += f
    val asked = q.trimEnd('?', '.', '!', ' ')
    return out.distinct().filter { it.lowercase().trimEnd('?', '.', '!', ' ') != asked }.take(3)
}
