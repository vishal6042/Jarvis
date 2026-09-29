-- A card bill a person marked paid by hand, before (or without) the bank's alert. The pairing
-- pass clears and recomputes `settlement` from scratch, which would turn such a payment back
-- into a refund on the card; the declaration carries it through, as transfer_declared does
-- for transfers.
ALTER TABLE transaction ADD COLUMN settlement_declared BOOLEAN NOT NULL DEFAULT FALSE;
