-- Phones running the Jarvis Sync app. Each app instance sends a heartbeat (on every sync and
-- dashboard refresh) so the web app can show what is connected and whether it is forwarding.
CREATE TABLE device (
    id                 VARCHAR(64)  PRIMARY KEY,      -- app-generated UUID, stable per install
    name               VARCHAR(120),
    manufacturer       VARCHAR(80),
    model              VARCHAR(120),
    os_version         VARCHAR(40),
    app_version        VARCHAR(40),
    forwarding_enabled BOOLEAN      NOT NULL DEFAULT true,
    pending_count      INTEGER      NOT NULL DEFAULT 0,
    forwarded_total    BIGINT       NOT NULL DEFAULT 0,
    last_sync_at       TIMESTAMPTZ,
    last_seen_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    first_seen_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
