-- The figures behind an assistant turn, exactly as the web app drew them, so a reopened chat shows
-- the same cards and charts rather than dropping back to the paragraph underneath them.
--
-- Kept as JSON alongside action_json for the same reason that one is: rebuilding the visual would
-- mean re-running the query against data that has since moved on, and the answer would quietly
-- stop matching what was said at the time.
ALTER TABLE chat_message ADD COLUMN visuals_json TEXT;
