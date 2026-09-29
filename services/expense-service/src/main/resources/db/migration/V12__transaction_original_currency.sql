-- An alert in a foreign currency ("USD 118.00 spent using ICICI Bank Card") used to land with its
-- number as-is, so every total read it as rupees. The ledger's amount is now always what the card
-- is billed in INR; the figure the merchant charged is kept beside it for display.
ALTER TABLE transaction ADD COLUMN original_amount NUMERIC(14,2);
ALTER TABLE transaction ADD COLUMN original_currency VARCHAR(3);
