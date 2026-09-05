-- Some banks bill several cards on one consolidated statement (e.g. the ICICI AMEX, Mastercard
-- and RuPay cards on one account): one bill, one due date, one payment. Cards sharing a name here
-- are aggregated into a single bill in the card summaries.
ALTER TABLE account ADD COLUMN billing_group VARCHAR(60);
