import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  hashId,
  seedInvestments,
  seedLoans,
  seedReminders,
  type Investment,
  type InvestmentKind,
  type Loan,
  type Reminder,
} from "./sample";

// ---------- localStorage helpers ----------
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---------- Family members + active member ----------
export interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  email?: string;
}

const SELF: FamilyMember = { id: "self", name: "You", relation: "Self" };
export const ALL_MEMBER: FamilyMember = { id: "all", name: "All members", relation: "All" };

interface FamilyCtx {
  members: FamilyMember[];
  activeId: string;
  activeMember: FamilyMember;
  setActiveId: (id: string) => void;
  addMember: (m: Omit<FamilyMember, "id">) => void;
  updateMember: (id: string, m: Partial<FamilyMember>) => void;
  removeMember: (id: string) => void;
  /** numeric seed for sample data, derived from the active member */
  seed: number;
}

const FamilyContext = createContext<FamilyCtx | null>(null);

export function FamilyProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<FamilyMember[]>(() =>
    load("jarvis_family", [SELF])
  );
  const [activeId, setActiveIdState] = useState<string>(() =>
    load("jarvis_active_member", "all")
  );

  useEffect(() => save("jarvis_family", members), [members]);
  useEffect(() => save("jarvis_active_member", activeId), [activeId]);

  const setActiveId = (id: string) => setActiveIdState(id);

  const addMember = (m: Omit<FamilyMember, "id">) =>
    setMembers((prev) => [...prev, { ...m, id: `m${Date.now()}` }]);

  const updateMember = (id: string, patch: Partial<FamilyMember>) =>
    setMembers((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const removeMember = (id: string) => {
    if (id === "self") return; // can't remove yourself
    setMembers((prev) => prev.filter((x) => x.id !== id));
    setActiveIdState((cur) => (cur === id ? "self" : cur));
  };

  const activeMember =
    activeId === "all" ? ALL_MEMBER : members.find((m) => m.id === activeId) ?? SELF;

  return (
    <FamilyContext.Provider
      value={{
        members,
        activeId,
        activeMember,
        setActiveId,
        addMember,
        updateMember,
        removeMember,
        seed: hashId(activeId),
      }}
    >
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamily(): FamilyCtx {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error("useFamily must be used within FamilyProvider");
  return ctx;
}

// ---------- Per-member investments ----------
function seedFor(memberId: string): Investment[] {
  if (memberId === "self") return seedInvestments();
  // Other members start with a small generated set so monitoring shows something.
  const h = hashId(memberId);
  const kinds: InvestmentKind[] = ["FD", "PPF", "MF"];
  return kinds.map((kind, i) => {
    const principal = 50000 + ((h + i * 37) % 9) * 25000;
    return {
      id: `${memberId}-${kind}-${i}`,
      kind,
      name: kind === "MF" ? "Nifty 50 Index" : kind === "PPF" ? "SBI" : "HDFC Bank",
      principal,
      current: Math.round(principal * (1.05 + ((h + i) % 20) / 100)),
      rate: kind === "MF" ? undefined : 7.1,
      sip: kind === "MF" ? 5000 : undefined,
      openingDate: "2023-04-01",
      commencementDate: "2023-04-01",
      maturityDate: kind === "MF" ? undefined : "2028-04-01",
    };
  });
}

/** Read a member's investments without subscribing (used to merge the "All" view). */
export function readInvestments(memberId: string): Investment[] {
  return load(`jarvis_investments_${memberId}`, seedFor(memberId));
}

export function useInvestments(memberId: string) {
  const key = `jarvis_investments_${memberId}`;
  const [items, setItems] = useState<Investment[]>(() => load(key, seedFor(memberId)));

  // reload when the member changes
  useEffect(() => {
    setItems(load(key, seedFor(memberId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  useEffect(() => save(key, items), [key, items]);

  const add = (inv: Omit<Investment, "id">) =>
    setItems((prev) => [{ ...inv, id: `inv${Date.now()}` }, ...prev]);
  const update = (id: string, patch: Partial<Investment>) =>
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => setItems((prev) => prev.filter((x) => x.id !== id));

  return { items, add, update, remove };
}

// ---------- Per-member loans ----------
function seedLoansFor(memberId: string): Loan[] {
  if (memberId === "self") return seedLoans();
  const h = hashId(memberId);
  // Other members get a single representative loan.
  const outstanding = 200000 + (h % 12) * 50000;
  return [
    {
      id: `${memberId}-PERSONAL`,
      kind: "PERSONAL",
      lender: "Bajaj Finserv",
      sanctioned: Math.round(outstanding * 1.4),
      outstanding,
      emi: Math.round(outstanding / 24),
      rate: 11.5,
      tenureMonths: 36,
      startDate: "2024-01-01",
      endDate: "2027-01-01",
    },
  ];
}

export function readLoans(memberId: string): Loan[] {
  return load(`jarvis_loans_${memberId}`, seedLoansFor(memberId));
}

export function useLoans(memberId: string) {
  const key = `jarvis_loans_${memberId}`;
  const [items, setItems] = useState<Loan[]>(() => load(key, seedLoansFor(memberId)));

  useEffect(() => {
    setItems(load(key, seedLoansFor(memberId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  useEffect(() => save(key, items), [key, items]);

  const add = (loan: Omit<Loan, "id">) =>
    setItems((prev) => [{ ...loan, id: `loan${Date.now()}` }, ...prev]);
  const update = (id: string, patch: Partial<Loan>) =>
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => setItems((prev) => prev.filter((x) => x.id !== id));

  return { items, add, update, remove };
}

// ---------- Category spend thresholds (settings) ----------
const THRESHOLDS_KEY = "jarvis_thresholds";
// Food default sits below its sample monthly spend so an "over budget" alert shows by default.
const DEFAULT_THRESHOLDS: Record<string, number> = {
  Food: 12000,
  Shopping: 15000,
  "Bills & Utilities": 10000,
  Transport: 6000,
  Entertainment: 5000,
  Health: 5000,
  Miscellaneous: 6000,
};

export function readThresholds(): Record<string, number> {
  return { ...DEFAULT_THRESHOLDS, ...load(THRESHOLDS_KEY, {}) };
}

export function useThresholds() {
  const [items, setItems] = useState<Record<string, number>>(() => readThresholds());
  const setThreshold = (category: string, value: number) =>
    setItems((prev) => ({ ...prev, [category]: value }));
  // Persist explicitly (Settings has a Save button; later this POSTs to the backend).
  const saveAll = (next: Record<string, number>) => {
    setItems(next);
    save(THRESHOLDS_KEY, next);
  };
  return { items, setThreshold, saveAll };
}

// ---------- Calendar reminders (household-wide) ----------
export function useReminders() {
  const key = "jarvis_reminders";
  const [items, setItems] = useState<Reminder[]>(() => load(key, seedReminders()));
  useEffect(() => save(key, items), [items]);

  const add = (r: Omit<Reminder, "id">) =>
    setItems((prev) => [...prev, { ...r, id: `rem${Date.now()}` }]);
  const update = (id: string, patch: Partial<Reminder>) =>
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => setItems((prev) => prev.filter((x) => x.id !== id));

  return { items, add, update, remove };
}
