import AiLine from "@/components/page/AiLine";
import { amortise } from "@/lib/amortisation";
import { formatINR } from "@/lib/format";
import { LOAN_META, type Investment, type Loan } from "@/lib/sample";

const pct = (r: number) => `${+r.toFixed(2)}%`;
const monthYear = (d: Date) => d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });

/** Rate gap (loan − FD, in points) above which prepaying clearly beats parking the cash in an FD. */
const PREPAY_GAP = 1.5;
/** Within this many points either way the two rates are "about the same". */
const SAME_GAP = 0.5;
/** Interest left under this share of the balance is "only" that much: the loan is nearly done. */
const SMALL_INTEREST_SHARE = 0.15;

export interface PrepayAdvice {
  loan: Loan;
  fdRate: number;
  interestLeft: number;
  debtFreeOn: Date;
  text: string;
  detail: string;
}

/**
 * Prepay or keep the cash, for the dearest loan: a rupee prepaid earns the loan's rate for sure,
 * a rupee left in an FD earns the FD's, so the gap between the two — and how much interest is
 * still ahead — is the whole decision. Null when there is no loan that amortises or no FD with a
 * rate to compare against, so the line never guesses.
 */
export function prepayAdvice(loans: Loan[], investments: Investment[]): PrepayAdvice | null {
  const fdRates = investments.filter((i) => i.kind === "FD" && i.rate != null && i.rate > 0).map((i) => i.rate as number);
  if (fdRates.length === 0) return null;
  const fdRate = Math.max(...fdRates);

  const candidates = loans
    .filter((l) => l.outstanding > 0 && l.rate > 0 && l.emi > 0)
    .map((l) => ({ loan: l, plan: amortise(l.outstanding, l.rate, l.emi) }))
    .filter((c): c is { loan: Loan; plan: NonNullable<ReturnType<typeof amortise>> } => c.plan != null)
    .sort((a, b) => b.loan.rate - a.loan.rate);
  const top = candidates[0];
  if (!top) return null;

  const { loan, plan } = top;
  const gap = loan.rate - fdRate;
  const interestLeft = Math.round(plan.totalInterest);
  const small = interestLeft < loan.outstanding * SMALL_INTEREST_SHARE;
  const name = LOAN_META[loan.kind].label.toLowerCase();
  const relation = gap > SAME_GAP ? "more than" : gap < -SAME_GAP ? "less than" : "about what";
  const interest = small ? `only ${formatINR(interestLeft)} of interest is left` : `${formatINR(interestLeft)} of interest is still ahead`;
  const verdict =
    gap > PREPAY_GAP
      ? "prepaying spare cash is a better return than a new FD."
      : gap < -SAME_GAP
        ? "an FD earns more than prepaying would save, so keep the cash."
        : "prepaying saves little, so keeping the cash liquid is fine.";

  const others = candidates.filter((c) => c.loan.rate < loan.rate).length;
  return {
    loan,
    fdRate,
    interestLeft,
    debtFreeOn: plan.debtFreeOn,
    text: `At ${pct(loan.rate)}, the ${name} costs ${relation} your best FD earns (${pct(fdRate)}), and ${interest} — ${verdict}`,
    detail: `Debt-free ${monthYear(plan.debtFreeOn)} on the current EMI.${
      others > 0
        ? ` ${others} other loan${others === 1 ? " has" : "s have"} a lower rate${gap > PREPAY_GAP ? ", so prepay this one first" : ", so the same goes for them"}.`
        : ""
    } Try an amount in its payoff plan below.`,
  };
}

/** Jarvis's prepay-or-keep read under the Loans header; renders nothing when it cannot compare. */
export default function PrepayLine({ loans, investments, onOpen }: { loans: Loan[]; investments: Investment[]; onOpen: (loan: Loan) => void }) {
  const advice = prepayAdvice(loans, investments);
  if (!advice) return null;
  return (
    <AiLine
      text={advice.text}
      detail={advice.detail}
      action={
        <button type="button" className="text-primary hover:underline" onClick={() => onOpen(advice.loan)}>
          Payoff plan →
        </button>
      }
    />
  );
}
