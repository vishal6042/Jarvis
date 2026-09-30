-- Salon, haircut, facial, spa and grooming had nowhere to go: they landed in Shopping, Health or
-- Miscellaneous depending on the day. Give them their own category so they can be budgeted and
-- seen on their own. Idempotent: the category may already exist if someone typed it by hand.
INSERT INTO category (name)
SELECT 'Personal care'
WHERE NOT EXISTS (SELECT 1 FROM category WHERE lower(name) = 'personal care');
