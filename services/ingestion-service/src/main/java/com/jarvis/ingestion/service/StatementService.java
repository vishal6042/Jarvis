package com.jarvis.ingestion.service;

import com.jarvis.ingestion.client.AiClient;
import com.jarvis.ingestion.client.ExpenseClient;
import com.jarvis.ingestion.client.NotificationClient;
import com.jarvis.ingestion.domain.MessageSource;
import com.jarvis.ingestion.domain.ParseStatus;
import com.jarvis.ingestion.domain.RawMessage;
import com.jarvis.ingestion.repo.RawMessageRepository;
import com.jarvis.ingestion.web.dto.ConfirmStatementRequest;
import com.jarvis.ingestion.web.dto.PreviewTransaction;
import com.jarvis.ingestion.web.dto.StatementImportResult;
import com.jarvis.ingestion.web.dto.StatementPreview;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Statement import in two phases:
 *  - {@link #preview(MultipartFile)} extracts text (PDF / Excel / CSV), has the AI identify the
 *    account + transactions, and returns a summary for the user to review — <b>no DB writes</b>.
 *  - {@link #confirm(ConfirmStatementRequest)} persists the reviewed rows (deduped), creating the
 *    account if it's new.
 * Bank-agnostic — no per-bank parsing.
 */
@Service
public class StatementService {

    private static final Logger log = LoggerFactory.getLogger(StatementService.class);
    // Non-streaming preview() sends statements up to this size in ONE call; larger falls back to chunk().
    private static final int SINGLE_CALL_MAX = 20000;
    // Per-chunk size for the streaming scan (and the non-stream fallback). A small statement fits in
    // one chunk; a large one streams in ~this-sized batches so the UI updates frequently.
    private static final int CHUNK_CHARS = 8000;

    private final AiClient ai;
    private final ExpenseClient expense;
    private final RawMessageRepository rawMessages;
    private final ObjectMapper json;
    private final NotificationClient notifications;

    public StatementService(
        AiClient ai,
        ExpenseClient expense,
        RawMessageRepository rawMessages,
        ObjectMapper json,
        NotificationClient notifications) {
        this.ai = ai;
        this.expense = expense;
        this.rawMessages = rawMessages;
        this.json = json;
        this.notifications = notifications;
    }

    /**
     * Streaming variant of {@link #preview}: scans the statement chunk-by-chunk and writes an NDJSON
     * line per event (account first, then each batch of transactions, then a done summary) — flushing
     * after each so the frontend appends rows live and the request never blocks long enough to time
     * out. Writes nothing to the DB.
     */
    public void previewStreaming(MultipartFile file, OutputStream out) throws IOException {
        String fileName = file.getOriginalFilename() == null ? "statement" : file.getOriginalFilename();
        String text = extractText(file, fileName);

        Totals t = new Totals();
        List<CardSection> cards = detectCardSections(text);

        // A combined credit-card statement: each card is its own section. Scan per card and tag every
        // row with that card's last-4 deterministically (no reliance on the model tracking sections).
        if (!cards.isEmpty()) {
            String bank = detectBank(text);
            // Send the deterministically-detected card list so the UI shows every card, even one whose
            // rows the model fails to extract (e.g. a card with only a single payment).
            List<String> cardNums = cards.stream().map(CardSection::last4).distinct().toList();
            writeLine(out, Map.of(
                "event", "account",
                "account", new StatementPreview.AccountInfo(
                    bank, null, "CREDIT_CARD", bank == null ? "Credit cards" : bank + " credit cards", true),
                "cards", cardNums));
            for (CardSection cs : cards) {
                AiClient.StatementResult r;
                try {
                    r = ai.parseStatement(cs.body());
                } catch (Exception e) {
                    log.warn("Failed to scan card ••{}: {}", cs.last4(), e.toString());
                    writeLine(out, Map.of("event", "warn", "message", "Card ••" + cs.last4() + " couldn't be read."));
                    continue;
                }
                if (r == null || r.transactions() == null) continue;
                List<PreviewTransaction> batch = cleanRows(r.transactions(), cs.last4(), null, t);
                if (!batch.isEmpty()) writeLine(out, Map.of("event", "transactions", "transactions", batch));
            }
            writeDone(out, t);
            log.info("Streamed scan of '{}' → {} cards, {} rows", fileName, cards.size(), t.total);
            return;
        }

        // Single-account statement (savings / one card): account from the header, then a chunked scan.
        AccountGuess guess = detectAccount(text);
        boolean isNew = true;
        String displayName = null;
        if (guess.last4() != null && !guess.last4().isBlank()) {
            ExpenseClient.ResolvedAccount existing = expense.findAccount(guess.bank(), guess.last4());
            if (existing != null) {
                isNew = false;
                displayName = existing.displayName();
            } else {
                displayName = (guess.bank() == null || guess.bank().isBlank() ? "Unknown" : guess.bank().trim())
                    + " •••• " + guess.last4();
            }
        }
        writeLine(out, Map.of("event", "account", "account", new StatementPreview.AccountInfo(
            guess.bank(), guess.last4(), guess.type(), displayName, isNew)));

        // A savings statement: tag debits that pay a credit-card bill (vs the card's own purchases).
        java.util.Set<String> cardLast4s = expense.listCardLast4s();
        List<String> parts = chunk(text);
        for (String part : parts) {
            AiClient.StatementResult r;
            try {
                r = ai.parseStatement(part);
            } catch (Exception e) {
                log.warn("Failed to scan a statement section; skipping it: {}", e.toString());
                writeLine(out, Map.of("event", "warn", "message", "A section couldn't be read and was skipped."));
                continue;
            }
            if (r == null || r.transactions() == null) continue;
            List<PreviewTransaction> batch = cleanRows(r.transactions(), null, cardLast4s, t);
            if (!batch.isEmpty()) writeLine(out, Map.of("event", "transactions", "transactions", batch));
        }
        writeDone(out, t);
        log.info("Streamed scan of '{}' in {} call(s) → {} rows", fileName, parts.size(), t.total);
    }

    private void writeLine(OutputStream out, Object event) throws IOException {
        out.write(json.writeValueAsBytes(event));
        out.write('\n');
        out.flush();
    }

    /** Running totals accumulated as batches stream in. */
    private static final class Totals {
        BigDecimal spending = BigDecimal.ZERO, earning = BigDecimal.ZERO;
        LocalDate from, to;
        int total;
    }

    /**
     * Clean parsed rows. {@code cardLast4} is forced onto each row for combined card statements.
     * {@code billPaymentCards} (non-null only on a SAVINGS import) tags credit-card bill-payment DEBITs
     * with the "Card Payment" category so the spend breakdown can drop them (the card's own debits
     * already represent that money).
     */
    private List<PreviewTransaction> cleanRows(
        List<AiClient.ParsedTransaction> raw, String cardLast4, java.util.Set<String> billPaymentCards, Totals t) {
        List<PreviewTransaction> out = new ArrayList<>();
        for (AiClient.ParsedTransaction p : raw) {
            BigDecimal amount = parseAmount(p.amount());
            String direction = parseDirection(p.direction());
            if (amount == null || amount.signum() <= 0 || direction == null) continue;
            String date = normalizeDate(p.occurredOn());
            if (date != null) {
                LocalDate d = LocalDate.parse(date);
                if (t.from == null || d.isBefore(t.from)) t.from = d;
                if (t.to == null || d.isAfter(t.to)) t.to = d;
            }
            if ("DEBIT".equals(direction)) t.spending = t.spending.add(amount);
            else t.earning = t.earning.add(amount);
            String category = p.category() == null || p.category().isBlank() ? "Uncategorized" : p.category().trim();
            if (billPaymentCards != null && "DEBIT".equals(direction) && isCardBillPayment(p.merchant(), billPaymentCards)) {
                category = "Card Payment";
            }
            out.add(new PreviewTransaction(
                date, p.merchant(), amount, direction, category,
                cardLast4 != null ? cardLast4 : blankToNull(p.last4())));
            t.total++;
        }
        return out;
    }

    /** A savings DEBIT that pays a credit-card bill: narration mentions a card, or a registered last-4. */
    private boolean isCardBillPayment(String merchant, java.util.Set<String> cardLast4s) {
        if (merchant == null) return false;
        String m = merchant.toLowerCase();
        if (m.contains("credit card") || m.contains("creditcard") || m.contains("cc bill")
            || m.contains("card payment") || m.contains("cc payment")) {
            return true;
        }
        for (String last4 : cardLast4s) {
            if (last4 != null && !last4.isBlank() && m.contains(last4)) return true;
        }
        return false;
    }

    private void writeDone(OutputStream out, Totals t) throws IOException {
        Map<String, Object> done = new LinkedHashMap<>();
        done.put("event", "done");
        done.put("total", t.total);
        done.put("spending", t.spending);
        done.put("earning", t.earning);
        done.put("fromDate", t.from == null ? null : t.from.toString());
        done.put("toDate", t.to == null ? null : t.to.toString());
        writeLine(out, done);
    }

    private record CardSection(String last4, String body) {}

    /**
     * Detect the per-card sections of a combined credit-card statement: rows that are just a masked
     * card number (e.g. {@code 5241XXXXXXXX0009}) head a section; the transactions beneath belong to
     * that card. Returns empty for ordinary single-account statements.
     */
    private List<CardSection> detectCardSections(String text) {
        String[] lines = text.split("\\r?\\n");
        // The table's column header, prepended to each section so the model knows the columns.
        String columnHeader = "";
        for (String l : lines) {
            String low = l.toLowerCase();
            if (low.contains("date") && (low.contains("amount") || low.contains("transaction details")
                || low.contains("debit") || low.contains("withdrawal"))) {
                columnHeader = l;
                break;
            }
        }
        Pattern card = Pattern.compile("\\b\\d{4}[Xx*]{4,}(\\d{4})\\b");
        List<CardSection> sections = new ArrayList<>();
        String current = null;
        StringBuilder body = null;
        for (String l : lines) {
            Matcher cm = card.matcher(l);
            boolean isHeader = cm.find() && l.replaceAll("[^0-9A-Za-z]", "").length() <= 20;
            if (isHeader) {
                if (current != null && body != null && body.length() > 0) {
                    sections.add(new CardSection(current, columnHeader + "\n" + body));
                }
                current = cm.group(1);
                body = new StringBuilder();
            } else if (body != null) {
                body.append(l).append('\n');
            }
        }
        if (current != null && body != null && body.length() > 0) {
            sections.add(new CardSection(current, columnHeader + "\n" + body));
        }
        return sections;
    }

    /** Phase 1 — parse and summarise for review. Writes nothing. */
    public StatementPreview preview(MultipartFile file) {
        String fileName = file.getOriginalFilename() == null ? "statement" : file.getOriginalFilename();
        String text = extractText(file, fileName);

        // Prefer ONE call with the whole statement; only split very large statements (each part is
        // then scanned independently, account taken from the first part that has it, rows from all).
        List<String> parts = text.length() <= SINGLE_CALL_MAX ? List.of(text) : chunk(text);
        String bank = null, last4 = null, accountType = null;
        List<AiClient.ParsedTransaction> rows = new ArrayList<>();
        for (String part : parts) {
            AiClient.StatementResult r;
            try {
                r = ai.parseStatement(part);
            } catch (Exception e) {
                // A failed section shouldn't abort the whole scan — skip it and keep going.
                log.warn("Failed to scan a statement section; skipping it: {}", e.toString());
                continue;
            }
            if (r == null) continue;
            if (last4 == null && r.last4() != null && !r.last4().isBlank()) {
                last4 = r.last4().trim();
                bank = r.bank();
                accountType = r.accountType();
            }
            if (r.transactions() != null) rows.addAll(r.transactions());
        }
        log.info("Scanned '{}' in {} call(s) → {} raw rows", fileName, parts.size(), rows.size());

        // The header (account number, bank, type) is regular, so detect it deterministically and
        // fill in whatever the AI left blank — the small model often nails the rows but misses these.
        AccountGuess guess = detectAccount(text);
        if (last4 == null || last4.isBlank()) last4 = guess.last4();
        if (bank == null || bank.isBlank()) bank = guess.bank();
        if (accountType == null || accountType.isBlank()) accountType = guess.type();

        // Clean rows; keep only those with a usable amount + direction.
        List<PreviewTransaction> txns = new ArrayList<>();
        BigDecimal spending = BigDecimal.ZERO, earning = BigDecimal.ZERO;
        LocalDate from = null, to = null;
        for (AiClient.ParsedTransaction p : rows) {
            BigDecimal amount = parseAmount(p.amount());
            String direction = parseDirection(p.direction());
            if (amount == null || amount.signum() <= 0 || direction == null) continue;
            String date = normalizeDate(p.occurredOn());
            if (date != null) {
                LocalDate d = LocalDate.parse(date);
                if (from == null || d.isBefore(from)) from = d;
                if (to == null || d.isAfter(to)) to = d;
            }
            if ("DEBIT".equals(direction)) spending = spending.add(amount);
            else earning = earning.add(amount);
            txns.add(new PreviewTransaction(
                date, p.merchant(), amount, direction,
                p.category() == null || p.category().isBlank() ? "Uncategorized" : p.category().trim(),
                blankToNull(p.last4())));
        }

        // Does this account already exist? (no creation here)
        boolean isNew = true;
        String displayName = null;
        if (last4 != null && !last4.isBlank()) {
            ExpenseClient.ResolvedAccount existing = expense.findAccount(bank, last4);
            if (existing != null) {
                isNew = false;
                displayName = existing.displayName();
            } else {
                displayName = (bank == null || bank.isBlank() ? "Unknown" : bank.trim()) + " •••• " + last4;
            }
        }
        var account = new StatementPreview.AccountInfo(bank, last4, accountType, displayName, isNew);

        log.info("Previewed statement '{}' → {} txns (account {}, isNew={})",
            fileName, txns.size(), displayName, isNew);
        return new StatementPreview(
            fileName, account,
            from == null ? null : from.toString(),
            to == null ? null : to.toString(),
            spending, earning, txns.size(), txns);
    }

    /** Phase 2 — persist the reviewed rows (deduped), creating the account if it's new. */
    public StatementImportResult confirm(ConfirmStatementRequest req) {
        String fileName = req.fileName() == null ? "statement" : req.fileName();

        String bank = req.bank();
        String type = req.accountType();
        String fallbackLast4 = blankToNull(req.last4());

        // Resolve (creating if needed) one account per distinct card last-4 — so a combined statement's
        // cards each get their own account. Cached so each card is resolved at most once.
        Map<String, ExpenseClient.ResolvedAccount> byCard = new HashMap<>();

        List<PreviewTransaction> rows = req.transactions() == null ? List.of() : req.transactions();
        int imported = 0, duplicates = 0, skipped = 0;
        for (PreviewTransaction p : rows) {
            if (p.amount() == null || p.amount().signum() <= 0 || p.direction() == null) {
                skipped++;
                continue;
            }
            String last4 = blankToNull(p.last4());
            if (last4 == null) last4 = fallbackLast4;

            Long accountId = null;
            if (last4 != null) {
                if (!byCard.containsKey(last4)) {
                    ExpenseClient.ResolvedAccount acc = null;
                    try {
                        acc = expense.resolveAccount(bank, last4, type);
                    } catch (Exception e) {
                        log.warn("Couldn't resolve account ••{}: {}", last4, e.toString());
                    }
                    byCard.put(last4, acc);
                }
                ExpenseClient.ResolvedAccount acc = byCard.get(last4);
                if (acc != null) accountId = acc.id();
            }

            var createReq = new ExpenseClient.CreateTransactionRequest(
                accountId,
                last4,
                p.amount(),
                "INR",
                p.direction(),
                p.merchant(),
                p.category() == null || p.category().isBlank() ? "Uncategorized" : p.category().trim(),
                resolveDate(p.occurredOn()),
                MessageSource.STATEMENT.name(),
                "stmt:" + fileName);
            try {
                if (expense.create(createReq).created()) imported++;
                else duplicates++;
            } catch (Exception e) {
                // A single rejected row shouldn't fail the whole import.
                log.warn("Skipped a row on import: {}", e.toString());
                skipped++;
            }
        }

        List<ExpenseClient.ResolvedAccount> created =
            byCard.values().stream().filter(a -> a != null).toList();
        String accountName = created.size() > 1
            ? created.size() + " cards"
            : (created.isEmpty() ? null : created.get(0).displayName());

        RawMessage msg = new RawMessage();
        msg.setSource(MessageSource.STATEMENT);
        msg.setPayload(fileName);
        msg.setSender(accountName);
        msg.setStatus(ParseStatus.PARSED);
        rawMessages.save(msg);

        log.info("Imported statement '{}' → {} : {} new, {} dup, {} skipped",
            fileName, accountName, imported, duplicates, skipped);
        notifications.statementImported(accountName, imported, duplicates, fileName + ":" + msg.getId());
        return new StatementImportResult(
            fileName, accountName, bank, fallbackLast4, rows.size(), imported, duplicates, skipped);
    }

    private record AccountGuess(String bank, String last4, String type) {}

    /** Pull the account's bank / last-4 / type straight from the statement header (regex, no LLM). */
    private AccountGuess detectAccount(String text) {
        // last-4: the first "Account Number / A/C No … <digits>" in the document (the header row).
        String last4 = null;
        Matcher m = Pattern.compile(
            "(?i)(?:account|a/c|acct)\\s*(?:number|no\\.?|#)?\\s*[:,#=.\\s-]*([0-9xX*][0-9xX*\\s-]{4,24})")
            .matcher(text);
        if (m.find()) {
            String digits = m.group(1).replaceAll("[^0-9]", "");
            if (digits.length() >= 4) last4 = digits.substring(digits.length() - 4);
        }

        // type: only strong credit-card markers (txn narrations often mention "credit card" too).
        String lower = text.toLowerCase();
        boolean creditCard = lower.contains("credit card statement")
            || lower.contains("statement of credit card")
            || lower.contains("minimum amount due")
            || lower.contains("available credit limit");
        String type = creditCard ? "CREDIT_CARD" : "SAVINGS";

        return new AccountGuess(detectBank(text), last4, type);
    }

    // Canonical bank name → lowercase needles that identify it (name + IFSC 4-letter prefix).
    private static final java.util.LinkedHashMap<String, String[]> BANKS = new java.util.LinkedHashMap<>();
    static {
        BANKS.put("ICICI", new String[] {"icici", "icic"});
        BANKS.put("HDFC", new String[] {"hdfc"});
        BANKS.put("SBI", new String[] {"state bank", "sbin"});
        BANKS.put("Axis", new String[] {"axis bank", "utib"});
        BANKS.put("Kotak", new String[] {"kotak", "kkbk"});
        BANKS.put("Yes Bank", new String[] {"yes bank", "yesb"});
        BANKS.put("PNB", new String[] {"punjab national", "punb"});
        BANKS.put("Canara", new String[] {"canara", "cnrb"});
        BANKS.put("Bank of Baroda", new String[] {"bank of baroda", "barb"});
        BANKS.put("Union Bank", new String[] {"union bank", "ubin"});
        BANKS.put("IDFC First", new String[] {"idfc", "idfb"});
        BANKS.put("IndusInd", new String[] {"indusind", "indb"});
        BANKS.put("Federal", new String[] {"federal bank", "fdrl"});
        BANKS.put("RBL", new String[] {"rbl bank", "ratn"});
        BANKS.put("HSBC", new String[] {"hsbc"});
        BANKS.put("Citi", new String[] {"citibank", "citi"});
        BANKS.put("Standard Chartered", new String[] {"standard chartered", "scbl"});
    }

    /**
     * Identify the statement's OWN bank — NOT the many counterparty banks that appear in UPI/NEFT
     * narrations. Strong signal: a legend like "… Within ICICI Bank". Otherwise look only at the header
     * (before the first transaction date), including an IFSC code. If unsure, return null (left blank;
     * the user can fill the editable field).
     */
    private String detectBank(String text) {
        // 1) "Within <Bank> Bank" — a legend that names the account's own bank (internal transfers).
        Matcher within = Pattern.compile("(?i)within\\s+([a-z][a-z &]{1,24}?)\\s+bank").matcher(text);
        if (within.find()) {
            String b = matchBank(within.group(1).toLowerCase());
            if (b != null) return b;
        }
        // 2) Header only (before the first transaction date) — narrations can't pollute it.
        int firstDate = firstDateIndex(text);
        int cut = firstDate > 40 ? Math.min(firstDate, 2000) : 600;
        return matchBank((text.length() > cut ? text.substring(0, cut) : text).toLowerCase());
    }

    /** First canonical bank whose name/IFSC-prefix needle appears in the given (lowercased) text. */
    private String matchBank(String s) {
        for (var e : BANKS.entrySet()) {
            for (String needle : e.getValue()) {
                if (s.contains(needle)) return e.getKey();
            }
        }
        return null;
    }

    /** Index of the first transaction-style date (dd/mm/yyyy, dd-mm-yy, yyyy-mm-dd), or -1. */
    private int firstDateIndex(String text) {
        Matcher d = Pattern.compile("\\b(\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})\\b").matcher(text);
        return d.find() ? d.start() : -1;
    }

    private String extractText(MultipartFile file, String fileName) {
        try {
            String lower = fileName.toLowerCase();
            String ct = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
            byte[] bytes = file.getBytes();

            if (lower.endsWith(".pdf") || ct.equals("application/pdf")) {
                try (PDDocument doc = Loader.loadPDF(bytes)) {
                    return new PDFTextStripper().getText(doc);
                }
            }
            if (lower.endsWith(".xls") || lower.endsWith(".xlsx") || ct.contains("excel") || ct.contains("spreadsheet")) {
                try {
                    return extractExcel(bytes);
                } catch (Exception e) {
                    // Many Indian-bank ".xls" exports are actually HTML tables — fall back to text.
                    log.warn("POI couldn't read '{}' as Excel ({}); reading as text", fileName, e.getMessage());
                }
            }
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to read statement file", e);
        }
    }

    /** Render every sheet's rows to CSV-like lines the AI can parse. */
    private String extractExcel(byte[] bytes) throws IOException {
        DataFormatter fmt = new DataFormatter();
        StringBuilder out = new StringBuilder();
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            for (Sheet sheet : wb) {
                for (Row row : sheet) {
                    StringBuilder line = new StringBuilder();
                    int last = row.getLastCellNum();
                    for (int c = 0; c < last; c++) {
                        Cell cell = row.getCell(c, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                        String v = cell == null ? "" : fmt.formatCellValue(cell).replace(",", " ").trim();
                        if (c > 0) line.append(',');
                        line.append(v);
                    }
                    if (!line.toString().replace(",", "").isBlank()) out.append(line).append('\n');
                }
            }
        }
        return out.toString();
    }

    /** Split into ~CHUNK_CHARS chunks on line boundaries so each fits the model's context. */
    private List<String> chunk(String text) {
        List<String> chunks = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        for (String line : text.split("\\r?\\n")) {
            if (cur.length() + line.length() + 1 > CHUNK_CHARS && cur.length() > 0) {
                chunks.add(cur.toString());
                cur.setLength(0);
            }
            cur.append(line).append('\n');
        }
        if (cur.length() > 0) chunks.add(cur.toString());
        return chunks.isEmpty() ? List.of(text) : chunks;
    }

    private String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private BigDecimal parseAmount(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            String cleaned = raw.replaceAll("[^0-9.]", "");
            return cleaned.isEmpty() ? null : new BigDecimal(cleaned);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String parseDirection(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String v = raw.trim().toUpperCase();
        if (v.startsWith("DEBIT") || v.equals("DR") || v.equals("OUT")) return "DEBIT";
        if (v.startsWith("CREDIT") || v.equals("CR") || v.equals("IN")) return "CREDIT";
        return null;
    }

    /** Returns yyyy-MM-dd when parseable, else null. */
    private String normalizeDate(String occurredOn) {
        if (occurredOn == null || occurredOn.isBlank()) return null;
        try {
            return LocalDate.parse(occurredOn.trim()).toString();
        } catch (Exception e) {
            return null;
        }
    }

    private Instant resolveDate(String occurredOn) {
        String d = normalizeDate(occurredOn);
        if (d == null) return Instant.now();
        return LocalDate.parse(d).atStartOfDay(ZoneOffset.UTC).toInstant();
    }
}
