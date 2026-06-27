// TEMPORARY demo data generators (FE-only). Swap to backend endpoints later.
export type Period = "day" | "week" | "month" | "year";

export const PERIODS: Period[] = ["day", "week", "month", "year"];
export const PERIOD_LABEL: Record<Period, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
};

const POINTS: Record<Period, number> = { day: 24, week: 7, month: 30, year: 12 };

const pad2 = (n: number) => String(n).padStart(2, "0");

export function pointLabels(period: Period): string[] {
  const n = POINTS[period];
  if (period === "day") return Array.from({ length: n }, (_, i) => `${pad2(i)}:00`); // 00:00 … 23:00
  if (period === "week") return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // fixed weekdays
  if (period === "year")
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return Array.from({ length: n }, (_, i) => `${i + 1}`); // month → day-of-month
}

function seeded(seed: number): () => number {
  let s = (seed % 233280) + 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** A seeded current balance for a savings account (used for net worth). */
export function accountBalance(seed: number): number {
  const rnd = seeded(seed + 991);
  return Math.round(150000 + rnd() * 850000); // ₹1.5L – ₹10L
}

/** A numeric series for one entity (account/card) across the period. */
export function valueSeries(period: Period, seed: number, base: number): number[] {
  const n = POINTS[period];
  const rnd = seeded(seed + n * 7);
  return Array.from({ length: n }, () => Math.round(base * (0.35 + rnd() * 1.4)));
}

export function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return h;
}

// ---- Category breakdown + per-category history ----
export const categoryBreakdown = [
  { name: "Food", value: 14200 },
  { name: "Shopping", value: 9800 },
  { name: "Bills & Utilities", value: 7600 },
  { name: "Transport", value: 4300 },
  { name: "Entertainment", value: 3100 },
  { name: "Health", value: 2200 },
  { name: "Miscellaneous", value: 3800 }, // catch-all for everything else
];

const MERCHANTS: Record<string, string[]> = {
  Food: ["Swiggy", "Zomato", "BigBasket", "Dominos", "Local Cafe", "Blinkit"],
  Shopping: ["Amazon", "Flipkart", "Myntra", "Croma", "IKEA"],
  "Bills & Utilities": ["Airtel", "BESCOM", "ACT Fibernet", "Gas", "Water Board"],
  Transport: ["Uber", "Ola", "IndianOil", "Metro", "Rapido"],
  Entertainment: ["BookMyShow", "Netflix", "Spotify", "PVR", "Steam"],
  Health: ["Apollo Pharmacy", "PharmEasy", "Cult.fit", "1mg"],
  Miscellaneous: ["ATM Cash", "UPI Transfer", "Donation", "Stationery", "Misc"],
};

export interface Expenditure {
  date: string; // ISO
  merchant: string;
  amount: number;
}

/** Sample dated expenditures for a category within the selected period. */
export function categoryTxns(category: string, period: Period, seed = 0): Expenditure[] {
  const merchants = MERCHANTS[category] ?? ["Misc"];
  const rnd = seeded(hashId(category) + seed + POINTS[period]);
  const count = period === "day" ? 3 : period === "week" ? 8 : period === "month" ? 16 : 24;
  const spanDays = period === "day" ? 1 : period === "week" ? 7 : period === "month" ? 30 : 365;
  const baseAmt = category === "Food" ? 480 : category === "Shopping" ? 1600 : 700;
  const out: Expenditure[] = Array.from({ length: count }, () => {
    const back = Math.floor(rnd() * spanDays);
    const dt = new Date();
    dt.setDate(dt.getDate() - back);
    return {
      date: dt.toISOString(),
      merchant: merchants[Math.floor(rnd() * merchants.length)],
      amount: Math.round(baseAmt * (0.3 + rnd() * 1.8)),
    };
  });
  return out.sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

// ---- Investments (FD/RD/PF/PPF/Post Office + Mutual Funds) ----
export type InvestmentKind = "FD" | "RD" | "PPF" | "PF" | "NSC" | "KVP" | "SSY" | "MF";

export const KIND_META: Record<InvestmentKind, { label: string; color: string }> = {
  FD: { label: "Fixed Deposit", color: "#10b981" },
  RD: { label: "Recurring Deposit", color: "#14b8a6" },
  PPF: { label: "Public Provident Fund", color: "#8b5cf6" },
  PF: { label: "Provident Fund (EPF)", color: "#3b82f6" },
  NSC: { label: "National Savings Certificate", color: "#f59e0b" },
  KVP: { label: "Kisan Vikas Patra", color: "#f97316" },
  SSY: { label: "Sukanya Samriddhi", color: "#ec4899" },
  MF: { label: "Mutual Fund / SIP", color: "#6366f1" },
};

export interface Investment {
  id: string;
  kind: InvestmentKind;
  name: string; // institution or fund name
  principal: number; // invested
  current: number;
  rate?: number; // interest % (fixed income)
  sip?: number; // monthly SIP (MF/RD)
  openingDate?: string; // yyyy-MM-dd
  commencementDate?: string;
  maturityDate?: string;
  notes?: string;
}

export function seedInvestments(): Investment[] {
  return [
    { id: "i1", kind: "FD", name: "HDFC Bank", principal: 200000, current: 214000, rate: 7.1, openingDate: "2024-03-15", commencementDate: "2024-03-15", maturityDate: "2027-03-15" },
    { id: "i2", kind: "RD", name: "ICICI Bank", principal: 60000, current: 63200, rate: 6.8, sip: 5000, openingDate: "2025-01-01", commencementDate: "2025-01-01", maturityDate: "2026-12-01" },
    { id: "i3", kind: "PPF", name: "SBI", principal: 450000, current: 512000, rate: 7.1, openingDate: "2016-04-01", commencementDate: "2016-04-01", maturityDate: "2031-04-01" },
    { id: "i4", kind: "PF", name: "EPFO", principal: 380000, current: 421000, rate: 8.25, openingDate: "2018-07-01", commencementDate: "2018-07-01" },
    { id: "i5", kind: "NSC", name: "Post Office", principal: 100000, current: 108000, rate: 7.7, openingDate: "2024-06-10", commencementDate: "2024-06-10", maturityDate: "2029-06-10" },
    { id: "i6", kind: "SSY", name: "Post Office", principal: 150000, current: 168000, rate: 8.2, openingDate: "2023-01-20", commencementDate: "2023-01-20", maturityDate: "2038-01-20" },
    { id: "i7", kind: "MF", name: "Parag Parikh Flexi Cap", principal: 120000, current: 158400, sip: 10000, openingDate: "2022-05-01", commencementDate: "2022-05-01" },
    { id: "i8", kind: "MF", name: "UTI Nifty 50 Index", principal: 90000, current: 104200, sip: 5000, openingDate: "2023-02-01", commencementDate: "2023-02-01" },
  ];
}

export interface HistoryPoint {
  date: string;
  contributed: number;
  value: number;
}

/** Sample contribution/value history for an investment's detail view. */
export function investmentHistory(inv: Investment): HistoryPoint[] {
  const rnd = seeded(hashId(inv.id) + 11);
  const months = 12;
  const monthly = inv.sip ?? Math.round(inv.principal / 24);
  let contributed = Math.max(0, inv.principal - monthly * months);
  let value = contributed;
  const out: HistoryPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date();
    dt.setMonth(dt.getMonth() - i);
    contributed += monthly;
    value = Math.round((value + monthly) * (1 + (0.002 + rnd() * 0.01)));
    out.push({ date: dt.toISOString().slice(0, 10), contributed: Math.round(contributed), value });
  }
  if (out.length) out[out.length - 1].value = inv.current;
  return out;
}

// ---- Loans ----
export type LoanKind = "HOME" | "CAR" | "PERSONAL" | "EDUCATION" | "GOLD" | "BUSINESS";

export const LOAN_META: Record<LoanKind, { label: string; color: string }> = {
  HOME: { label: "Home Loan", color: "#0ea5e9" },
  CAR: { label: "Car Loan", color: "#f59e0b" },
  PERSONAL: { label: "Personal Loan", color: "#ef4444" },
  EDUCATION: { label: "Education Loan", color: "#22c55e" },
  GOLD: { label: "Gold Loan", color: "#eab308" },
  BUSINESS: { label: "Business Loan", color: "#a855f7" },
};

export interface Loan {
  id: string;
  kind: LoanKind;
  lender: string;
  sanctioned: number; // original principal
  outstanding: number; // current balance
  emi: number;
  rate: number; // interest %
  tenureMonths: number;
  startDate?: string; // yyyy-MM-dd
  endDate?: string;
  notes?: string;
}

export function seedLoans(): Loan[] {
  return [
    { id: "l1", kind: "HOME", lender: "HDFC Ltd", sanctioned: 5000000, outstanding: 3820000, emi: 42000, rate: 8.6, tenureMonths: 240, startDate: "2021-06-01", endDate: "2041-06-01" },
    { id: "l2", kind: "CAR", lender: "ICICI Bank", sanctioned: 900000, outstanding: 412000, emi: 16500, rate: 9.2, tenureMonths: 60, startDate: "2023-03-01", endDate: "2028-03-01" },
  ];
}

/** Declining outstanding-balance history (12 months) for a loan's detail view. */
export function loanHistory(loan: Loan): { date: string; balance: number }[] {
  const months = 12;
  const out: { date: string; balance: number }[] = [];
  let bal = loan.outstanding + loan.emi * months * 0.8;
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date();
    dt.setMonth(dt.getMonth() - i);
    bal = Math.max(0, bal - loan.emi * 0.8);
    out.push({ date: dt.toISOString().slice(0, 10), balance: Math.round(bal) });
  }
  if (out.length) out[out.length - 1].balance = loan.outstanding;
  return out;
}

// ---- Calendar reminders ----
export type ReminderType = "RENT" | "BILL" | "EMI" | "INVESTMENT" | "SIP" | "OTHER";

export const REMINDER_META: Record<ReminderType, { label: string; color: string }> = {
  RENT: { label: "Rent", color: "#0ea5e9" },
  BILL: { label: "Bill", color: "#f59e0b" },
  EMI: { label: "EMI", color: "#ef4444" },
  INVESTMENT: { label: "Investment", color: "#10b981" },
  SIP: { label: "SIP", color: "#6366f1" },
  OTHER: { label: "Other", color: "#a855f7" },
};

export interface Reminder {
  id: string;
  title: string;
  date: string; // yyyy-MM-dd (the first/base occurrence)
  type: ReminderType;
  amount?: number;
  notes?: string;
  repeat?: "none" | "monthly";
}

/** One concrete dated occurrence after expanding monthly repeats. */
export interface ReminderOccurrence extends Reminder {
  occursOn: string; // yyyy-MM-dd
}

const isoDate = (dt: Date) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

/** Relative due text for a yyyy-MM-dd date: "Due today", "Due tomorrow", "Due in N days". */
export function dueLabel(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  const diff = Math.round((+d - +today) / 86400000);
  if (diff <= 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `Due in ${diff} days`;
}

/** A few seed reminders around today so the calendar isn't empty. */
export function seedReminders(): Reminder[] {
  const d = (offset: number) => {
    const dt = new Date();
    dt.setDate(dt.getDate() + offset);
    return isoDate(dt);
  };
  return [
    { id: "r1", title: "House rent", date: d(2), type: "RENT", amount: 35000, repeat: "monthly" },
    { id: "r2", title: "Home loan EMI", date: d(5), type: "EMI", amount: 42000, repeat: "monthly" },
    { id: "r3", title: "Electricity bill", date: d(7), type: "BILL", amount: 2400, repeat: "none" },
    { id: "r4", title: "Flexi Cap SIP", date: d(9), type: "SIP", amount: 10000, repeat: "monthly" },
    { id: "r5", title: "Credit card bill", date: d(12), type: "BILL", amount: 18600, repeat: "monthly" },
  ];
}

/**
 * Next `count` future occurrences across all reminders, expanding monthly repeats
 * within `horizonDays`. Used by the dashboard clock widget and the Calendar "Upcoming" list.
 */
export function upcomingReminders(items: Reminder[], count = 4, horizonDays = 120): ReminderOccurrence[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const until = new Date(today);
  until.setDate(until.getDate() + horizonDays);
  const out: ReminderOccurrence[] = [];
  for (const r of items) {
    const base = new Date(`${r.date}T00:00:00`);
    if (r.repeat === "monthly") {
      const day = base.getDate();
      let dt = new Date(today.getFullYear(), today.getMonth(), day);
      if (dt < today) dt = new Date(today.getFullYear(), today.getMonth() + 1, day);
      while (dt <= until) {
        if (dt >= base) out.push({ ...r, occursOn: isoDate(dt) });
        dt = new Date(dt.getFullYear(), dt.getMonth() + 1, day);
      }
    } else if (base >= today && base <= until) {
      out.push({ ...r, occursOn: r.date });
    }
  }
  return out
    .sort((a, b) => +new Date(a.occursOn) - +new Date(b.occursOn))
    .slice(0, count);
}

/** Reminder occurrences falling within a given month, keyed by date — for the Calendar grid. */
export function occurrencesInMonth(items: Reminder[], year: number, month: number): Record<string, Reminder[]> {
  const map: Record<string, Reminder[]> = {};
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = new Date(year, month, 1);
  for (const r of items) {
    const base = new Date(`${r.date}T00:00:00`);
    if (r.repeat === "monthly") {
      // only from the month the reminder began onward
      if (monthStart < new Date(base.getFullYear(), base.getMonth(), 1)) continue;
      const day = Math.min(base.getDate(), daysInMonth);
      const ds = `${year}-${pad2(month + 1)}-${pad2(day)}`;
      (map[ds] ??= []).push(r);
    } else if (base.getFullYear() === year && base.getMonth() === month) {
      (map[r.date] ??= []).push(r);
    }
  }
  return map;
}
