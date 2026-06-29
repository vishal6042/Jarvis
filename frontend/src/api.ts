import axios from "axios";
import type {
  Account,
  AccountRequest,
  CategorySpend,
  ChatReply,
  CreateTransactionRequest,
  LoginResponse,
  PeriodSummary,
  Profile,
  StatementImportResult,
  Transaction,
  UpdateProfileRequest,
} from "./types";

const TOKEN_KEY = "jarvis_token";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "http://localhost:8080",
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

// ---- Analytics (expense-service) ----
export async function analyticsSummary(from?: string, to?: string): Promise<PeriodSummary> {
  return (await api.get<PeriodSummary>("/api/analytics/summary", { params: { from, to } })).data;
}
export async function analyticsByCategory(from?: string, to?: string): Promise<CategorySpend[]> {
  return (await api.get<CategorySpend[]>("/api/analytics/by-category", { params: { from, to } })).data;
}

// ---- AI orchestrator ----
export async function aiChat(message: string): Promise<string> {
  return (await api.post<ChatReply>("/api/ai/chat", { message })).data.answer;
}

// ---- Statement import (ingestion-service) ----
export async function importStatement(file: File): Promise<StatementImportResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<StatementImportResult>("/api/ingest/statement", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000, // statement parsing can take a while on a local model
  });
  return data;
}

export default api;
