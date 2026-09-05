-- "A human said this is a transfer" is different information from "we found its other side".
-- The pairing pass clears and recomputes `transfer` from scratch, which is right for alerts but
-- destroys a declaration it can never re-derive (a payin to one's own deposit has no counterpart
-- in the ledger). Keeping the declaration separately lets the pass stay deterministic and simply
-- OR the declarations back in afterwards.
ALTER TABLE transaction ADD COLUMN transfer_declared BOOLEAN NOT NULL DEFAULT FALSE;

-- The rows already declared by hand during the statement import.
UPDATE transaction SET transfer_declared = TRUE WHERE transfer = TRUE AND source = 'MANUAL';
