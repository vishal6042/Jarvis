-- Investments can be linked to a bank/post-office account number so alerts for that account
-- (e.g. "Account No. XXXXXXXX1507 CREDIT with amount Rs. 5000.00 ... Balance: Rs.90000.00")
-- record the contribution and refresh the current value automatically.
ALTER TABLE investment ADD COLUMN account_last4 VARCHAR(4);
ALTER TABLE investment ADD COLUMN value_as_of DATE;
ALTER TABLE investment ADD COLUMN last_contribution_on DATE;
CREATE INDEX idx_investment_account_last4 ON investment (account_last4);
