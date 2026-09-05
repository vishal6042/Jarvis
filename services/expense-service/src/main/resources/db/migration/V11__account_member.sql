-- Investments and loans already say whose they are; accounts did not, so a household with more
-- than one person had no way to answer "show me only hers". The id refers to a member in
-- finance-service, so there is no foreign key across the two schemas.
ALTER TABLE account ADD COLUMN member_id BIGINT;
