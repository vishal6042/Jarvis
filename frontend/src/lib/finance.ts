import { useEffect, useState } from "react";
import type { Account, PeriodSummary } from "@/types";
import { analyticsSummary, listAccounts } from "@/api";
import { type Investment, type Loan } from "./sample";
import { useFamily, useInvestments, useLoans } from "./store";

export interface FinanceSummary {
  accounts: Account[];
  savingsAccounts: Account[];
  loans: Loan[];
  investmentsList: Investment[];
  savings: number; // hard cash across savings accounts (net-worth base)
  earning: number; // last completed month's income (salary lands month-end, so MTD reads 0)
  spend: number; // this month-to-date spending (accrues through the month)
  lastMonthSpend: number; // last completed month's spend — pairs with earning for a fair monthly rate
  outstanding: number; // total loan balance
  emiTotal: number; // monthly EMI
  investments: number; // current value
  savingsRate: number; // %
  memberName: string; // "your" or a member name
  isAll: boolean;
}

/**
 * Single source of truth for the headline finance numbers, shared by Dashboard + Assistant.
 * Every figure comes from the backend — earning/spend from real transactions, investments/loans
 * from finance-service. Nothing is synthesised; a fresh DB reads as ₹0.
 */
export function useFinanceSummary(): FinanceSummary {
  const { activeId, activeMember } = useFamily();
  const isAll = activeId === "all";

  const { items: investmentsList } = useInvestments(isAll ? "all" : activeMember.id);
  const { items: loans } = useLoans(isAll ? "all" : activeMember.id);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [thisMonthSum, setThisMonthSum] = useState<PeriodSummary | null>(null);
  const [lastMonthSum, setLastMonthSum] = useState<PeriodSummary | null>(null);
  useEffect(() => {
    listAccounts().then(setAccounts).catch(() => setAccounts([]));
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // This month-to-date drives live spending; last completed month drives income (salary lands on
    // the last day of the month, so this month's earning is 0 until then).
    analyticsSummary(thisMonthStart.toISOString(), now.toISOString())
      .then(setThisMonthSum)
      .catch(() => setThisMonthSum(null));
    analyticsSummary(lastMonthStart.toISOString(), thisMonthStart.toISOString())
      .then(setLastMonthSum)
      .catch(() => setLastMonthSum(null));
  }, []);
  const savingsAccounts = accounts.filter((a) => a.type === "SAVINGS");

  const earning = lastMonthSum ? Number(lastMonthSum.earning) : 0; // last month's income
  const spend = thisMonthSum ? Number(thisMonthSum.spend) : 0; // this month-to-date spending
  const lastMonthSpend = lastMonthSum ? Number(lastMonthSum.spend) : 0;

  const investments = investmentsList.reduce((sum, i) => sum + i.current, 0);
  const outstanding = loans.reduce((sum, l) => sum + l.outstanding, 0);
  const emiTotal = loans.reduce((sum, l) => sum + l.emi, 0);
  // Net worth = hard cash in savings accounts. Investments are added on the dashboard when toggled on.
  const savings = savingsAccounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);
  // Savings rate compares a full month's income and spend (last completed month) — mixing last
  // month's income with this month's partial spend would read misleadingly high early in the month.
  const savingsRate = earning > 0 ? Math.round(((earning - lastMonthSpend) / earning) * 100) : 0;
  const memberName = isAll || activeMember.relation === "Self" ? "your" : activeMember.name;

  return {
    accounts,
    savingsAccounts,
    loans,
    investmentsList,
    savings,
    earning,
    spend,
    lastMonthSpend,
    outstanding,
    emiTotal,
    investments,
    savingsRate,
    memberName,
    isAll,
  };
}
