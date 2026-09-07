-- Which member's phone this is. Without it every sign-in could list every phone in the household,
-- with its model, app version, forwarding counters and last-sync time -- the same detail the
-- rest of the app is careful to scope. Nullable: a device is attributed on its next heartbeat,
-- and until then only the administrator sees it.
ALTER TABLE device ADD COLUMN member_id BIGINT;

CREATE INDEX idx_device_member ON device (member_id);
