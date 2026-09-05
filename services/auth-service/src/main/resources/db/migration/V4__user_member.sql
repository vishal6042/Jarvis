-- Until now every sign-in saw the whole household. A second person needs an account that shows
-- only their own money, so a user can name the member they speak for, and the person who set the
-- system up keeps authority over all of it.
ALTER TABLE app_user ADD COLUMN member_id BIGINT;

-- The first account created is the household's administrator.
UPDATE app_user
SET roles = 'USER,ADMIN'
WHERE id = (SELECT min(id) FROM app_user)
  AND roles NOT LIKE '%ADMIN%';

-- Removing an account should take its profile with it; without this the delete fails on the key.
ALTER TABLE user_profile DROP CONSTRAINT user_profile_user_id_fkey;
ALTER TABLE user_profile
    ADD CONSTRAINT user_profile_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE;
