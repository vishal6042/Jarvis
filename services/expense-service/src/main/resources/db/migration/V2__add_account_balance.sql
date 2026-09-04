-- Current cash balance per account (mainly savings) — feeds net worth. Nullable.
ALTER TABLE account ADD COLUMN balance NUMERIC(16, 2);
