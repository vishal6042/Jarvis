-- When the balance was last set from a bank alert, so an older alert can't overwrite a newer balance.
ALTER TABLE account ADD COLUMN balance_as_of TIMESTAMPTZ;
