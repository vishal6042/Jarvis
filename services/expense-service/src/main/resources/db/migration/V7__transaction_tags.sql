-- Free-form tags on a transaction ("trip-goa", "reimbursable", "gift"), stored comma-separated.
-- Categories stay the single classification used by analytics; tags are for the user's own slicing.
ALTER TABLE transaction ADD COLUMN tags VARCHAR(512);
