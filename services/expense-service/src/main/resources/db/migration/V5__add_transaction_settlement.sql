-- Both sides of a credit-card bill payment (savings debit + card credit), so analytics can skip them
-- and count the card's purchases instead.
ALTER TABLE transaction ADD COLUMN settlement BOOLEAN NOT NULL DEFAULT false;
