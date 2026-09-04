-- Marks both sides of a transfer between the user's own accounts so analytics can exclude them.
ALTER TABLE transaction ADD COLUMN transfer BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_transaction_transfer_pairing ON transaction (amount, direction, occurred_at) WHERE transfer = false;
