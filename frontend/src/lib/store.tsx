import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { isAuthed } from "@/api";
import {
  createInvestment,
  createLoan,
  createMember,
  createReminder,
  deleteInvestmentApi,
  deleteLoanApi,
  deleteMemberApi,
  deleteReminderApi,
  getInvestments,
  getLoans,
  getMembers,
  getReminders,
  getThresholds,
  saveThresholdsApi,
  updateInvestmentApi,
  updateLoanApi,
  updateMemberApi,
  updateReminderApi,
  type ApiInvestment,
  type ApiLoan,
  type ApiReminder,
} from "@/lib/api/finance";
import {
  hashId,
  type Investment,
  type InvestmentKind,
  type Loan,
  type LoanKind,
  type Reminder,
  type ReminderType,
} from "./sample";

// ---------- Family members + active member ----------
export interface FamilyMember {
  id: string; // String(backend member id)
  name: string;
  relation: string;
  email?: string;
}

export const ALL_MEMBER: FamilyMember = { id: "all", name: "All members", relation: "All" };

// ---------- mappers (backend ⇄ FE shapes; FE ids are stringified backend ids) ----------
const toInv = (a: ApiInvestment): Investment => ({
  id: String(a.id),
  kind: a.kind as InvestmentKind,
  name: a.name,
  principal: a.principal,
  current: a.current,
  rate: a.rate ?? undefined,
  sip: a.sip ?? undefined,
  openingDate: a.openingDate ?? undefined,
  commencementDate: a.commencementDate ?? undefined,
  maturityDate: a.maturityDate ?? undefined,
  notes: a.notes ?? undefined,
});
const toLoan = (a: ApiLoan): Loan => ({
  id: String(a.id),
  kind: a.kind as LoanKind,
  lender: a.lender,
  sanctioned: a.sanctioned,
  outstanding: a.outstanding,
  emi: a.emi,
  rate: a.rate ?? 0,
  tenureMonths: a.tenureMonths ?? 0,
  startDate: a.startDate ?? undefined,
  endDate: a.endDate ?? undefined,
  notes: a.notes ?? undefined,
});
const toRem = (a: ApiReminder): Reminder => ({
  id: String(a.id),
  title: a.title,
  date: a.date,
  type: a.type as ReminderType,
  amount: a.amount ?? undefined,
  notes: a.notes ?? undefined,
  repeat: (a.repeat as "none" | "monthly") ?? "none",
});

interface FinanceCtx {
  loaded: boolean;
  reload: () => void;
  // family
  members: FamilyMember[];
  activeId: string;
  activeMember: FamilyMember;
  setActiveId: (id: string) => void;
  seed: number;
  addMember: (m: Omit<FamilyMember, "id">) => Promise<void>;
  updateMember: (id: string, patch: Partial<FamilyMember>) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  // raw data
  rawInvestments: ApiInvestment[];
  rawLoans: ApiLoan[];
  rawReminders: ApiReminder[];
  thresholds: Record<string, number>;
  // mutations
  addInvestment: (memberId: string, inv: Omit<Investment, "id">) => Promise<void>;
  updateInvestment: (id: string, patch: Partial<Investment>) => Promise<void>;
  removeInvestment: (id: string) => Promise<void>;
  addLoan: (memberId: string, loan: Omit<Loan, "id">) => Promise<void>;
  updateLoan: (id: string, patch: Partial<Loan>) => Promise<void>;
  removeLoan: (id: string) => Promise<void>;
  addReminder: (r: Omit<Reminder, "id">) => Promise<void>;
  updateReminder: (id: string, patch: Partial<Reminder>) => Promise<void>;
  removeReminder: (id: string) => Promise<void>;
  setThresholdsState: (map: Record<string, number>) => void;
  saveThresholds: (map: Record<string, number>) => Promise<void>;
}

const Ctx = createContext<FinanceCtx | null>(null);

export function FamilyProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [activeId, setActiveId] = useState<string>("all");
  const [rawInvestments, setRawInvestments] = useState<ApiInvestment[]>([]);
  const [rawLoans, setRawLoans] = useState<ApiLoan[]>([]);
  const [rawReminders, setRawReminders] = useState<ApiReminder[]>([]);
  const [thresholds, setThresholds] = useState<Record<string, number>>({});

  const reload = useCallback(() => {
    if (!isAuthed()) return;
    Promise.allSettled([
      getMembers(),
      getInvestments(),
      getLoans(),
      getReminders(),
      getThresholds(),
    ]).then(([m, i, l, r, t]) => {
      if (m.status === "fulfilled")
        setMembers(m.value.map((x) => ({ id: String(x.id), name: x.name, relation: x.relation, email: x.email ?? undefined })));
      if (i.status === "fulfilled") setRawInvestments(i.value);
      if (l.status === "fulfilled") setRawLoans(l.value);
      if (r.status === "fulfilled") setRawReminders(r.value);
      if (t.status === "fulfilled") setThresholds(t.value);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const activeMember =
    activeId === "all"
      ? ALL_MEMBER
      : members.find((m) => m.id === activeId) ?? members[0] ?? ALL_MEMBER;

  // ----- members -----
  const addMember = async (m: Omit<FamilyMember, "id">) => {
    const saved = await createMember({ name: m.name, relation: m.relation, email: m.email ?? null });
    setMembers((prev) => [...prev, { id: String(saved.id), name: saved.name, relation: saved.relation, email: saved.email ?? undefined }]);
  };
  const updateMember = async (id: string, patch: Partial<FamilyMember>) => {
    const cur = members.find((x) => x.id === id);
    if (!cur) return;
    const saved = await updateMemberApi(Number(id), {
      name: patch.name ?? cur.name,
      relation: patch.relation ?? cur.relation,
      email: (patch.email ?? cur.email) ?? null,
    });
    setMembers((prev) => prev.map((x) => (x.id === id ? { id: String(saved.id), name: saved.name, relation: saved.relation, email: saved.email ?? undefined } : x)));
  };
  const removeMember = async (id: string) => {
    const cur = members.find((x) => x.id === id);
    if (!cur || cur.relation === "Self") return; // never delete the primary member
    await deleteMemberApi(Number(id));
    setMembers((prev) => prev.filter((x) => x.id !== id));
    setRawInvestments((prev) => prev.filter((x) => String(x.memberId) !== id));
    setRawLoans((prev) => prev.filter((x) => String(x.memberId) !== id));
    setActiveId((cur2) => (cur2 === id ? "all" : cur2));
  };

  // ----- investments -----
  const addInvestment = async (memberId: string, inv: Omit<Investment, "id">) => {
    const saved = await createInvestment({
      memberId: Number(memberId),
      kind: inv.kind,
      name: inv.name,
      principal: inv.principal,
      current: inv.current,
      rate: inv.rate ?? null,
      sip: inv.sip ?? null,
      openingDate: inv.openingDate ?? null,
      commencementDate: inv.commencementDate ?? null,
      maturityDate: inv.maturityDate ?? null,
      notes: inv.notes ?? null,
    });
    setRawInvestments((prev) => [saved, ...prev]);
  };
  const updateInvestment = async (id: string, patch: Partial<Investment>) => {
    const raw = rawInvestments.find((x) => String(x.id) === id);
    if (!raw) return;
    const saved = await updateInvestmentApi(raw.id, {
      memberId: raw.memberId,
      kind: patch.kind ?? raw.kind,
      name: patch.name ?? raw.name,
      principal: patch.principal ?? raw.principal,
      current: patch.current ?? raw.current,
      rate: patch.rate ?? raw.rate ?? null,
      sip: patch.sip ?? raw.sip ?? null,
      openingDate: patch.openingDate ?? raw.openingDate ?? null,
      commencementDate: patch.commencementDate ?? raw.commencementDate ?? null,
      maturityDate: patch.maturityDate ?? raw.maturityDate ?? null,
      notes: patch.notes ?? raw.notes ?? null,
    });
    setRawInvestments((prev) => prev.map((x) => (x.id === raw.id ? saved : x)));
  };
  const removeInvestment = async (id: string) => {
    await deleteInvestmentApi(Number(id));
    setRawInvestments((prev) => prev.filter((x) => String(x.id) !== id));
  };

  // ----- loans -----
  const addLoan = async (memberId: string, loan: Omit<Loan, "id">) => {
    const saved = await createLoan({
      memberId: Number(memberId),
      kind: loan.kind,
      lender: loan.lender,
      sanctioned: loan.sanctioned,
      outstanding: loan.outstanding,
      emi: loan.emi,
      rate: loan.rate ?? null,
      tenureMonths: loan.tenureMonths ?? null,
      startDate: loan.startDate ?? null,
      endDate: loan.endDate ?? null,
      notes: loan.notes ?? null,
    });
    setRawLoans((prev) => [saved, ...prev]);
  };
  const updateLoan = async (id: string, patch: Partial<Loan>) => {
    const raw = rawLoans.find((x) => String(x.id) === id);
    if (!raw) return;
    const saved = await updateLoanApi(raw.id, {
      memberId: raw.memberId,
      kind: patch.kind ?? raw.kind,
      lender: patch.lender ?? raw.lender,
      sanctioned: patch.sanctioned ?? raw.sanctioned,
      outstanding: patch.outstanding ?? raw.outstanding,
      emi: patch.emi ?? raw.emi,
      rate: patch.rate ?? raw.rate ?? null,
      tenureMonths: patch.tenureMonths ?? raw.tenureMonths ?? null,
      startDate: patch.startDate ?? raw.startDate ?? null,
      endDate: patch.endDate ?? raw.endDate ?? null,
      notes: patch.notes ?? raw.notes ?? null,
    });
    setRawLoans((prev) => prev.map((x) => (x.id === raw.id ? saved : x)));
  };
  const removeLoan = async (id: string) => {
    await deleteLoanApi(Number(id));
    setRawLoans((prev) => prev.filter((x) => String(x.id) !== id));
  };

  // ----- reminders -----
  const addReminder = async (r: Omit<Reminder, "id">) => {
    const saved = await createReminder({
      title: r.title,
      date: r.date,
      type: r.type,
      amount: r.amount ?? null,
      notes: r.notes ?? null,
      repeat: r.repeat ?? "none",
    });
    setRawReminders((prev) => [...prev, saved]);
  };
  const updateReminder = async (id: string, patch: Partial<Reminder>) => {
    const raw = rawReminders.find((x) => String(x.id) === id);
    if (!raw) return;
    const saved = await updateReminderApi(raw.id, {
      title: patch.title ?? raw.title,
      date: patch.date ?? raw.date,
      type: patch.type ?? raw.type,
      amount: patch.amount ?? raw.amount ?? null,
      notes: patch.notes ?? raw.notes ?? null,
      repeat: patch.repeat ?? raw.repeat ?? "none",
    });
    setRawReminders((prev) => prev.map((x) => (x.id === raw.id ? saved : x)));
  };
  const removeReminder = async (id: string) => {
    await deleteReminderApi(Number(id));
    setRawReminders((prev) => prev.filter((x) => String(x.id) !== id));
  };

  // ----- thresholds -----
  const setThresholdsState = (map: Record<string, number>) => setThresholds(map);
  const saveThresholds = async (map: Record<string, number>) => {
    const saved = await saveThresholdsApi(map);
    setThresholds(saved);
  };

  return (
    <Ctx.Provider
      value={{
        loaded,
        reload,
        members,
        activeId,
        activeMember,
        setActiveId,
        seed: hashId(activeId),
        addMember,
        updateMember,
        removeMember,
        rawInvestments,
        rawLoans,
        rawReminders,
        thresholds,
        addInvestment,
        updateInvestment,
        removeInvestment,
        addLoan,
        updateLoan,
        removeLoan,
        addReminder,
        updateReminder,
        removeReminder,
        setThresholdsState,
        saveThresholds,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

function useFinance(): FinanceCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFinance must be used within FamilyProvider");
  return ctx;
}

// ---------- Public hooks (same surface the pages already use) ----------
export function useFamily() {
  const c = useFinance();
  return {
    members: c.members,
    activeId: c.activeId,
    activeMember: c.activeMember,
    setActiveId: c.setActiveId,
    addMember: c.addMember,
    updateMember: c.updateMember,
    removeMember: c.removeMember,
    seed: c.seed,
    reload: c.reload,
  };
}

/** memberId is a backend member id (as a string) or "all". */
export function useInvestments(memberId: string) {
  const c = useFinance();
  const items: Investment[] = (memberId === "all"
    ? c.rawInvestments
    : c.rawInvestments.filter((x) => String(x.memberId) === memberId)
  ).map(toInv);
  return {
    items,
    add: (inv: Omit<Investment, "id">) => c.addInvestment(memberId, inv),
    update: (id: string, patch: Partial<Investment>) => c.updateInvestment(id, patch),
    remove: (id: string) => c.removeInvestment(id),
  };
}

export function useLoans(memberId: string) {
  const c = useFinance();
  const items: Loan[] = (memberId === "all"
    ? c.rawLoans
    : c.rawLoans.filter((x) => String(x.memberId) === memberId)
  ).map(toLoan);
  return {
    items,
    add: (loan: Omit<Loan, "id">) => c.addLoan(memberId, loan),
    update: (id: string, patch: Partial<Loan>) => c.updateLoan(id, patch),
    remove: (id: string) => c.removeLoan(id),
  };
}

export function useReminders() {
  const c = useFinance();
  return {
    items: c.rawReminders.map(toRem),
    add: c.addReminder,
    update: c.updateReminder,
    remove: c.removeReminder,
  };
}

export function useThresholds() {
  const c = useFinance();
  return {
    items: c.thresholds,
    setThreshold: (category: string, value: number) =>
      c.setThresholdsState({ ...c.thresholds, [category]: value }),
    saveAll: c.saveThresholds,
  };
}
