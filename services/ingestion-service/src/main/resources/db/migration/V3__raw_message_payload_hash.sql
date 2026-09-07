-- The same alert can reach us twice: the phone forwards it live as it arrives, and the Inbox
-- backfill can send it again. Each arrival is parsed from scratch, and the parse is not
-- deterministic -- an LLM names the merchant and reads the date -- so the dedup hash computed
-- downstream in expense-service can differ between the two runs, and a second transaction is
-- created. Key the raw alert on its own text, which does not change, and stop the repeat before
-- it ever reaches the parser.
ALTER TABLE raw_message ADD COLUMN payload_hash VARCHAR(64);

-- Backfill with exactly the key the application computes (see PayloadHasher): source, sender,
-- payload, and the day it was received -- so two identical alerts on different days stay distinct.
-- Statement imports are skipped: their payload is a filename, not alert text, and they are not
-- part of the forwarded-alert path this key exists to protect.
UPDATE raw_message
   SET payload_hash = encode(
           sha256(convert_to(
               source || '|' || coalesce(sender, '') || '|' || payload || '|'
               || to_char(received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), 'UTF8')),
           'hex')
 WHERE source <> 'STATEMENT';

-- Deliberately not unique: a repeat is still recorded as its own DUPLICATE row for the audit log.
CREATE INDEX idx_raw_message_payload_hash ON raw_message (payload_hash);
