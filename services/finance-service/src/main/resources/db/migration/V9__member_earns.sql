-- Not everyone in a household has an income of their own. Scoring a homemaker on income ratios
-- rates them badly for a situation that is not a financial problem: savings rate is
-- (income - spend) / income, debt burden is EMI / income, and with no income both collapse.
-- This says whose money should be judged that way, so the rest can be judged on what they do
-- control -- the buffer they keep, what they spend, and what is invested.
ALTER TABLE member ADD COLUMN earns BOOLEAN NOT NULL DEFAULT true;
