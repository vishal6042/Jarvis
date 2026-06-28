import api from "@/api";

// Raw shapes as returned by finance-service (ids/memberIds are numeric).
export interface ApiMember {
  id: number;
  name: string;
  relation: string;
  email?: string | null;
}
export interface ApiInvestment {
  id: number;
  memberId: number;
  kind: string;
  name: string;
  principal: number;
  current: number;
  rate?: number | null;
  sip?: number | null;
  openingDate?: string | null;
  commencementDate?: string | null;
  maturityDate?: string | null;
  notes?: string | null;
}
export interface ApiLoan {
  id: number;
  memberId: number;
  kind: string;
  lender: string;
  sanctioned: number;
  outstanding: number;
  emi: number;
  rate?: number | null;
  tenureMonths?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
}
export interface ApiReminder {
  id: number;
  title: string;
  date: string;
  type: string;
  amount?: number | null;
  notes?: string | null;
  repeat?: string | null;
}

// ---- Members ----
export const getMembers = async () => (await api.get<ApiMember[]>("/api/members")).data;
export const createMember = async (m: Omit<ApiMember, "id">) =>
  (await api.post<ApiMember>("/api/members", m)).data;
export const updateMemberApi = async (id: number, m: Omit<ApiMember, "id">) =>
  (await api.put<ApiMember>(`/api/members/${id}`, m)).data;
export const deleteMemberApi = async (id: number) => {
  await api.delete(`/api/members/${id}`);
};

// ---- Investments ----
export const getInvestments = async () => (await api.get<ApiInvestment[]>("/api/investments")).data;
export const createInvestment = async (i: Omit<ApiInvestment, "id">) =>
  (await api.post<ApiInvestment>("/api/investments", i)).data;
export const updateInvestmentApi = async (id: number, i: Omit<ApiInvestment, "id">) =>
  (await api.put<ApiInvestment>(`/api/investments/${id}`, i)).data;
export const deleteInvestmentApi = async (id: number) => {
  await api.delete(`/api/investments/${id}`);
};

// ---- Loans ----
export const getLoans = async () => (await api.get<ApiLoan[]>("/api/loans")).data;
export const createLoan = async (l: Omit<ApiLoan, "id">) =>
  (await api.post<ApiLoan>("/api/loans", l)).data;
export const updateLoanApi = async (id: number, l: Omit<ApiLoan, "id">) =>
  (await api.put<ApiLoan>(`/api/loans/${id}`, l)).data;
export const deleteLoanApi = async (id: number) => {
  await api.delete(`/api/loans/${id}`);
};

// ---- Reminders ----
export const getReminders = async () => (await api.get<ApiReminder[]>("/api/reminders")).data;
export const createReminder = async (r: Omit<ApiReminder, "id">) =>
  (await api.post<ApiReminder>("/api/reminders", r)).data;
export const updateReminderApi = async (id: number, r: Omit<ApiReminder, "id">) =>
  (await api.put<ApiReminder>(`/api/reminders/${id}`, r)).data;
export const deleteReminderApi = async (id: number) => {
  await api.delete(`/api/reminders/${id}`);
};

// ---- Thresholds ----
export const getThresholds = async () =>
  (await api.get<Record<string, number>>("/api/thresholds")).data;
export const saveThresholdsApi = async (map: Record<string, number>) =>
  (await api.put<Record<string, number>>("/api/thresholds", map)).data;
