-- Investments and loans already say whose they are. Goals and reminders did not, so a household
-- account scoped to one person had no way to answer "show me only hers".
ALTER TABLE goal ADD COLUMN member_id BIGINT;
ALTER TABLE reminder ADD COLUMN member_id BIGINT;

-- Everything recorded so far belongs to the person who set the system up.
UPDATE goal SET member_id = (SELECT min(id) FROM member) WHERE member_id IS NULL;
UPDATE reminder SET member_id = (SELECT min(id) FROM member) WHERE member_id IS NULL;
