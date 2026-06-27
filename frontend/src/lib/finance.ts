import { useEffect, useState } from "react";
import type { Account } from "@/types";
import { listAccounts } from "@/api";
import { accountBalance, hashId, valueSeries, type Investment, type Loan } from "./sample";
import { readInvestments, readLoans, useFamily, useInvestments, useLoans } from "./store";

export interface FinanceSummary {
  accounts: Account[];
  savingsAccounts: Account[];
  loans: Loan[];
  investmentsList: Investment[];
  savings: number; // net worth from savings balances
  earning: number; // this month
  spend: number; // this month
  outstanding: number; // total loan balance
  emiTotal: number; // monthly EMI
  investments: number; // current value
  savingsRate: number; // %
  memberName: string; // "your" or a member name
  isAll: boolean;
}

/** Single source of truth for the headline finance numbers, shared by Dashboard + Assistant. */
export function useFinanceSummary(): FinanceSummary {
  const { seed, activeId, activeMember, members } = useFamily();
  const isAll = activeId === "all";

  const { items: ownInv } = useInvestments(isAll ? "self" : activeMember.id);
  const investmentsList = isAll ? members.flatMap((m) => readInvestments(m.id)) : ownInv;

  const { items: ownLoans } = useLoans(isAll ? "self" : activeMember.id);
  const loans = isAll ? members.flatMap((m) => readLoans(m.id)) : ownLoans;

  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => {
    listAccounts().then(setAccounts);
  }, []);
  const savingsAccounts = accounts.filter((a) => a.type === "SAVINGS");

  const seeds = isAll ? members.map((m) => hashId(m.id)) : [seed];
  let earning = 0;
  let spend = 0;
  let savings = 0;
  for (const s of seeds) {
    earning += valueSeries("month", s + 1, 3200).reduce((a, b) => a + b, 0);
    spend += valueSeries("month", s + 2, 1800).reduce((a, b) => a + b, 0);
    savings += savingsAccounts.reduce((sum, a) => sum + accountBalance(s + hashId(String(a.id))), 0);
  }

  const investments = investmentsList.reduce((sum, i) => sum + i.current, 0);
  const outstanding = loans.reduce((sum, l) => sum + l.outstanding, 0);
  const emiTotal = loans.reduce((sum, l) => sum + l.emi, 0);
  const savingsRate = earning > 0 ? Math.round(((earning - spend) / earning) * 100) : 0;
  const memberName = isAll || activeMember.relation === "Self" ? "your" : activeMember.name;

  return {
    accounts,
    savingsAccounts,
    loans,
    investmentsList,
    savings,
    earning,
    spend,
    outstanding,
    emiTotal,
    investments,
    savingsRate,
    memberName,
    isAll,
  };
}
