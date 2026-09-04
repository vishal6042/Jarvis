-- Loans can be linked to the alerts that pay them: by the loan account digits in the text, or by
-- an EMI-sized debit from a given savings account. Each payment is recorded once per date.
ALTER TABLE loan ADD COLUMN loan_account_last4 VARCHAR(4);
ALTER TABLE loan ADD COLUMN emi_from_last4 VARCHAR(4);
ALTER TABLE loan ADD COLUMN last_payment_on DATE;
ALTER TABLE loan ADD COLUMN payments_recorded INTEGER NOT NULL DEFAULT 0;
