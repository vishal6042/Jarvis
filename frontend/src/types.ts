export type AccountType = "SAVINGS" | "CREDIT_CARD" | "DEBIT_CARD";

export interface Account {
  id: number;
  bank: string;
  type: AccountType;
  last4: string;
  displayName: string;
  currency: string;
  network?: string | null;
  cardHolderName?: string | null;
  creditLimit?: number | null;
  billingCycleDay?: number | null;
  paymentDueDay?: number | null;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  ifsc?: string | null;
  branch?: string | null;
}

export type AccountRequest = Omit<Account, "id">;

export interface Profile {
  username: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  baseCurrency: string | null;
  city: string | null;
}

export interface UpdateProfileRequest {
  fullName?: string;
  email?: string;
  phone?: string;
  baseCurrency?: string;
  city?: string;
}

export interface LoginResponse {
  token: string;
  tokenType: string;
  expiresInMinutes: number;
  username: string;
}
