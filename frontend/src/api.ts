import axios from "axios";
import type {
  Account,
  AccountRequest,
  ApiNotification,
  CategorySpend,
  ChatReply,
  ConfirmStatementRequest,
  CreateTransactionRequest,
  FinanceMetrics,
  FinanceScoreResult,
  LoginResponse,
  NetWorthPoint,
  RecurringPayment,
  PeriodSummary,
  PreviewTransaction,
  Profile,
  StatementImportResult,
  StatementPreview,
  Transaction,
  UpdateProfileRequest,
} from "./types";

/**
 * Where the backend gateway lives. If VITE_API_BASE is set it wins; otherwise we derive it from the
 * host the page was opened on — so the desktop (localhost) and a phone on the LAN (192.168.x.x) each
 * hit the right machine on :8080 without any per-device config.
 */
function resolveApiBase(): string {
  const env = import.meta.env.VITE_API_BASE;
  if (env) return env;
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }
  return "http://localhost:8080";
}

const API_BASE = resolveApiBase();

const TOKEN_KEY = "jarvis_token";

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401 && getToken()) {
      clearToken();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
    }
    return Promise.reject(err);
  }
);

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
export function isAuthed(): boolean {
  return !!getToken();
}

// ---- Auth ----
export interface RegisterPayload {
  username: string;
  password: string;
  securityQuestion: string;
  securityAnswer: string;
  fullName?: string;
  email?: string;
  phone?: string;
  baseCurrency?: string;
  city?: string;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/api/auth/login", { username, password });
  setToken(data.token);
  return data;
}
/** First-run signup. Creates the account + profile; the user signs in afterwards (no token here). */
export async function register(payload: RegisterPayload): Promise<void> {
  await api.post("/api/auth/register", payload);
}
/** Whether an account already exists (drives signup-first on a fresh install). */
export async function authExists(): Promise<boolean> {
  return (await api.get<{ exists: boolean }>("/api/auth/exists")).data.exists;
}
/** The security question to show on the "forgot password" screen (null if none set). */
export async function getSecurityQuestion(): Promise<string | null> {
  return (await api.get<{ question: string | null }>("/api/auth/security-question")).data.question;
}
/** Recover access: answer the security question and set a new password. */
export async function resetPassword(answer: string, newPassword: string): Promise<void> {
  await api.post("/api/auth/reset-password", { answer, newPassword });
}
/** Change the password while signed in (current password required). */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post("/api/auth/change-password", { currentPassword, newPassword });
}
export function logout(): void {
  clearToken();
}

/**
 * GDPR-style wipe: delete all financial data (accounts, transactions, investments, loans, reminders,
 * thresholds, and imported statements). The profile + login are kept.
 */
export async function deleteAllData(): Promise<void> {
  await Promise.all([
    api.delete("/api/transactions/purge-all"),
    api.delete("/api/investments/purge-all"),
    api.delete("/api/ingest/purge-all"),
    api.delete("/api/notifications/purge-all").catch(() => {}), // service may be offline
  ]);
}

// ---- Connected devices (ingestion-service; the Android app heartbeats here) ----
export interface ConnectedDevice {
  id: string;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  osVersion: string | null;
  appVersion: string | null;
  forwardingEnabled: boolean;
  pendingCount: number;
  forwardedTotal: number;
  lastSyncAt: string | null;
  lastSeenAt: string;
  firstSeenAt: string;
}
export async function listDevices(): Promise<ConnectedDevice[]> {
  return (await api.get<ConnectedDevice[]>("/api/devices")).data;
}
export async function forgetDevice(id: string): Promise<void> {
  await api.delete(`/api/devices/${id}`);
}

// ---- Categorisation: rules, inline category, duplicates (expense-service) ----
export interface CategoryRule {
  id: number;
  pattern: string;
  category: string;
  createdAt: string;
}
export async function listRules(): Promise<CategoryRule[]> {
  return (await api.get<CategoryRule[]>("/api/rules")).data;
}
export async function createRule(pattern: string, category: string): Promise<CategoryRule> {
  return (await api.post<CategoryRule>("/api/rules", { pattern, category })).data;
}
export async function deleteRule(id: number): Promise<void> {
  await api.delete(`/api/rules/${id}`);
}
/** Re-categorise stored transactions with the rules; returns how many rows changed. */
export async function applyRules(onlyUncategorized = true): Promise<number> {
  const { data } = await api.post<{ changed: number }>(`/api/rules/apply?onlyUncategorized=${onlyUncategorized}`);
  return data.changed;
}
export async function setTransactionCategory(id: number, category: string): Promise<Transaction> {
  return (await api.patch<Transaction>(`/api/transactions/${id}/category`, { category })).data;
}
/** Probable duplicates: pairs of [first, second] on the same day / amount / direction. */
export async function listDuplicates(): Promise<Transaction[][]> {
  return (await api.get<Transaction[][]>("/api/transactions/duplicates")).data;
}

// ---- Card cycles (expense-service) ----
export interface CardSummary {
  accountId: number;
  displayName: string;
  bank: string;
  last4: string;
  network: string | null;
  creditLimit: number | null;
  lastStatementOn: string | null;
  nextStatementOn: string | null;
  dueOn: string | null;
  unbilled: number;
  billed: number;
  paid: number;
  billDue: number;
  lastPaidOn: string | null;
  lastPaidAmount: number | null;
  utilisationPct: number | null;
  /** Set when this card shares one consolidated statement with others: the figures are the group's. */
  billingGroup: string | null;
}
export async function cardSummaries(): Promise<CardSummary[]> {
  return (await api.get<CardSummary[]>("/api/analytics/cards")).data;
}

// ---- Notifications (notification-service) ----
export async function listNotifications(): Promise<ApiNotification[]> {
  return (await api.get<ApiNotification[]>("/api/notifications")).data;
}
export async function markAllNotificationsRead(): Promise<void> {
  await api.post("/api/notifications/read-all");
}
export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`/api/notifications/${id}/read`);
}

/**
 * Live notification stream over SSE (raw fetch so we can send the Bearer header, which native
 * EventSource can't). Parses `event:`/`data:` frames and invokes onNotification per push.
 */
export async function subscribeNotifications(
  onNotification: (n: ApiNotification) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/notifications/stream`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Stream failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const handleFrame = (frame: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (event !== "notification" || dataLines.length === 0) return;
    try {
      onNotification(JSON.parse(dataLines.join("\n")) as ApiNotification);
    } catch {
      /* ignore malformed frame */
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      handleFrame(buf.slice(0, sep));
      buf = buf.slice(sep + 2);
    }
  }
}

// ---- Profile ----
export async function getProfile(): Promise<Profile> {
  return (await api.get<Profile>("/api/profile")).data;
}
export async function updateProfile(req: UpdateProfileRequest): Promise<Profile> {
  return (await api.put<Profile>("/api/profile", req)).data;
}

// ---- Accounts ----
export async function listAccounts(): Promise<Account[]> {
  return (await api.get<Account[]>("/api/accounts")).data;
}
export async function createAccount(req: AccountRequest): Promise<Account> {
  return (await api.post<Account>("/api/accounts", req)).data;
}
export async function updateAccount(id: number, req: AccountRequest): Promise<Account> {
  return (await api.put<Account>(`/api/accounts/${id}`, req)).data;
}
export async function deleteAccount(id: number): Promise<void> {
  await api.delete(`/api/accounts/${id}`);
}

// ---- Transactions (expense-service) ----
export async function listTransactions(page = 0, size = 50): Promise<Transaction[]> {
  return (await api.get<Transaction[]>("/api/transactions", { params: { page, size } })).data;
}
export async function createTransaction(req: CreateTransactionRequest): Promise<Transaction> {
  return (await api.post<Transaction>("/api/transactions", req)).data;
}
export async function updateTransaction(
  id: number,
  req: CreateTransactionRequest
): Promise<Transaction> {
  return (await api.put<Transaction>(`/api/transactions/${id}`, req)).data;
}
export async function deleteTransaction(id: number): Promise<void> {
  await api.delete(`/api/transactions/${id}`);
}

// ---- Analytics (expense-service) ----
export async function analyticsSummary(from?: string, to?: string): Promise<PeriodSummary> {
  return (await api.get<PeriodSummary>("/api/analytics/summary", { params: { from, to } })).data;
}
export async function analyticsByCategory(from?: string, to?: string): Promise<CategorySpend[]> {
  return (await api.get<CategorySpend[]>("/api/analytics/by-category", { params: { from, to } })).data;
}
export async function analyticsIncomeBySource(from?: string, to?: string): Promise<CategorySpend[]> {
  return (await api.get<CategorySpend[]>("/api/analytics/income-by-source", { params: { from, to } })).data;
}
export async function netWorthTrend(months = 12): Promise<NetWorthPoint[]> {
  return (await api.get<NetWorthPoint[]>("/api/analytics/net-worth-trend", { params: { months } })).data;
}
export async function listRecurring(): Promise<RecurringPayment[]> {
  return (await api.get<RecurringPayment[]>("/api/recurring")).data;
}

// ---- AI orchestrator ----
/** Ask the agent; `context` is a plain-text snapshot of figures the app already computed. */
/** Extract one confirmable action from an imperative message ({type:"none"} for questions). */
export async function aiPlan(message: string): Promise<import("@/lib/actions").PlannedAction> {
  return (await api.post<import("@/lib/actions").PlannedAction>("/api/ai/plan", { message }, { timeout: 120000 })).data;
}

export async function aiChat(message: string, context?: string): Promise<string> {
  return (await api.post<ChatReply>("/api/ai/chat", { message, context }, { timeout: 120000 })).data.answer;
}

/** LLM-assessed financial-health score (1–100) + tips, from the user's monthly metrics. */
export async function financeScore(metrics: FinanceMetrics): Promise<FinanceScoreResult> {
  const { data } = await api.post<FinanceScoreResult>("/api/ai/finance-score", metrics, {
    timeout: 120000, // local model scoring can take a few seconds
  });
  return data;
}

// ---- Statement import (ingestion-service) ----
/** Phase 1: upload a statement → AI parses it for review. Nothing is saved yet. */
export async function previewStatement(file: File): Promise<StatementPreview> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<StatementPreview>("/api/ingest/statement/preview", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000, // statement parsing can take a while on a local model
  });
  return data;
}
/** Phase 2: persist the reviewed transactions (deduped); creates the account if new. */
export async function confirmStatement(
  payload: ConfirmStatementRequest
): Promise<StatementImportResult> {
  return (await api.post<StatementImportResult>("/api/ingest/statement/confirm", payload)).data;
}

export interface StatementStreamHandlers {
  onAccount?: (account: StatementPreview["account"], cards?: string[]) => void;
  onTransactions?: (rows: PreviewTransaction[]) => void;
  onDone?: (summary: {
    total: number;
    spending: number;
    earning: number;
    fromDate: string | null;
    toDate: string | null;
  }) => void;
  onWarn?: (message: string) => void;
}

/**
 * Streaming scan: the backend sends NDJSON (account, then transaction batches, then done) and we
 * dispatch each line as it arrives so the UI can append rows live. Uses raw fetch (no timeout).
 */
export async function previewStatementStream(
  file: File,
  handlers: StatementStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/ingest/statement/preview-stream`, {
    method: "POST",
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (res.status === 401) {
    clearToken();
    throw new Error("Unauthorized");
  }
  if (!res.ok || !res.body) throw new Error(`Scan failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const dispatch = (line: string) => {
    const t = line.trim();
    if (!t) return;
    let evt: any;
    try {
      evt = JSON.parse(t);
    } catch {
      return;
    }
    if (evt.event === "account") handlers.onAccount?.(evt.account, evt.cards);
    else if (evt.event === "transactions") handlers.onTransactions?.(evt.transactions ?? []);
    else if (evt.event === "done") handlers.onDone?.(evt);
    else if (evt.event === "warn") handlers.onWarn?.(evt.message);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      dispatch(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  dispatch(buf); // trailing line, if any
}

export default api;

// ---- User preferences (server-side; nothing personal lives only in the browser) ----
export async function getPreferences(): Promise<Record<string, unknown>> {
  return (await api.get<Record<string, unknown>>("/api/preferences")).data;
}
/** Body is the raw JSON value (number, string, object …), so stringify explicitly for primitives. */
export async function putPreference(key: string, value: unknown): Promise<void> {
  await api.put(`/api/preferences/${encodeURIComponent(key)}`, JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
}
export async function deletePreference(key: string): Promise<void> {
  await api.delete(`/api/preferences/${encodeURIComponent(key)}`);
}

// ---- Tags + bulk categorise ----
export async function setTransactionTags(id: number, tags: string[]): Promise<Transaction> {
  return (await api.patch<Transaction>(`/api/transactions/${id}/tags`, { tags })).data;
}
export async function bulkSetCategory(ids: number[], category: string): Promise<number> {
  return (await api.post<{ updated: number }>("/api/transactions/bulk-category", { ids, category })).data.updated;
}

// ---- Merchant identity: raw alert text → a clean name (+ the category it belongs in) ----
export interface MerchantSummary {
  raw: string;
  canonical: string | null;
  category: string | null;
  count: number;
  total: number;
  uncategorised: number;
  source: string | null;
}
export interface MerchantAliasRequest {
  raw: string;
  canonical: string;
  category?: string | null;
  source?: string;
}
export interface AliasApplyResult {
  aliases: number;
  renamed: number;
  categorised: number;
}
export async function listMerchants(): Promise<MerchantSummary[]> {
  return (await api.get<MerchantSummary[]>("/api/merchants")).data;
}
export async function saveMerchantAliases(aliases: MerchantAliasRequest[]): Promise<AliasApplyResult> {
  return (await api.post<AliasApplyResult>("/api/merchants/aliases", aliases)).data;
}
export async function applyMerchantAliases(): Promise<AliasApplyResult> {
  return (await api.post<AliasApplyResult>("/api/merchants/aliases/apply")).data;
}
export async function deleteMerchantAlias(raw: string): Promise<void> {
  await api.delete("/api/merchants/aliases", { params: { raw } });
}

export interface EnrichedMerchant {
  raw: string;
  merchant: string;
  category: string | null;
  confidence: number | null;
}
/** Ask the local model to clean a batch of raw merchant strings. Send a handful at a time. */
export async function aiEnrichMerchants(
  merchants: string[],
  categories: string[],
  examples: string[],
): Promise<EnrichedMerchant[]> {
  return (
    await api.post<EnrichedMerchant[]>("/api/ai/merchants", { merchants, categories, examples }, { timeout: 300000 })
  ).data;
}
