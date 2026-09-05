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
  /** Cards billed on one consolidated statement share this name; null = billed on its own. */
  billingGroup?: string | null;
  ifsc?: string | null;
  branch?: string | null;
  balance?: number | null;
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

// ---- Transactions / analytics (expense-service) ----
export type Direction = "DEBIT" | "CREDIT";
export type TxnSource = "SMS" | "EMAIL" | "STATEMENT" | "MANUAL";

export interface Transaction {
  id: number;
  accountId: number | null;
  accountName: string | null;
  amount: number;
  currency: string;
  direction: Direction;
  merchant: string | null;
  /** The clean merchant name once an alias has been accepted for the raw text. */
  merchantNorm?: string | null;
  category: string | null;
  occurredAt: string;
  source: TxnSource;
  note: string | null;
  transfer?: boolean;
  settlement?: boolean;
  tags?: string[];
}

export interface CreateTransactionRequest {
  accountId?: number;
  amount: number;
  currency?: string;
  direction: Direction;
  merchant?: string;
  category?: string;
  occurredAt?: string;
  note?: string;
}

export interface PeriodSummary {
  from: string;
  to: string;
  earning: number;
  spend: number;
}

export interface CategorySpend {
  category: string;
  total: number;
}

export interface NetWorthPoint {
  month: string; // yyyy-MM
  netWorth: number;
}

export interface RecurringPayment {
  merchant: string | null;
  category: string | null;
  amount: number;
  cadence: string; // Weekly | Monthly | Quarterly | Yearly
  lastPaid: string; // yyyy-MM-dd
  nextExpected: string; // yyyy-MM-dd
  occurrences: number;
  monthlyEstimate: number;
}

export interface ChatReply {
  answer: string;
}

export interface ApiNotification {
  id: string;
  type: string; // THRESHOLD | UNUSUAL | FINDING | SYNC | PAYMENT | EXPIRY
  title: string;
  message: string;
  href: string;
  color: string;
  read: boolean;
  createdAt: string; // ISO instant
}

export interface FinanceMetrics {
  monthlyIncome: number;
  monthlySpend: number;
  savingsRate: number;
  cashSavings: number;
  investments: number;
  outstandingLoans: number;
  monthlyEmi: number;
}

export interface FinanceScoreResult {
  score: number;
  rating: string;
  headline: string;
  tips: string[];
}

export interface StatementImportResult {
  fileName: string;
  accountName: string | null;
  bank: string | null;
  last4: string | null;
  total: number;
  imported: number;
  duplicates: number;
  skipped: number;
}

export interface PreviewTransaction {
  occurredOn: string | null;
  merchant: string | null;
  amount: number;
  direction: Direction;
  category: string | null;
  last4: string | null;
}

export interface StatementPreview {
  fileName: string;
  account: {
    bank: string | null;
    last4: string | null;
    accountType: string | null; // SAVINGS | CREDIT_CARD
    displayName: string | null;
    isNew: boolean;
  };
  fromDate: string | null;
  toDate: string | null;
  spending: number;
  earning: number;
  total: number;
  transactions: PreviewTransaction[];
}

export interface ConfirmStatementRequest {
  fileName: string;
  bank: string | null;
  last4: string | null;
  accountType: string | null;
  transactions: PreviewTransaction[];
}
