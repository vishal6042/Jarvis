import axios from "axios";
import type {
  Account,
  AccountRequest,
  LoginResponse,
  Profile,
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
export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/api/auth/login", { username, password });
  setToken(data.token);
  return data;
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

export default api;
