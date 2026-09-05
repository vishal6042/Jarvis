-- EPF and NPS come out of the payslip, so the salary that reaches the bank is already net of
-- them. They are real contributions but never a payment the user has to make, and counting them
-- as money still owed this month double-counts against income that already excluded them.
ALTER TABLE investment ADD COLUMN salary_deducted BOOLEAN NOT NULL DEFAULT FALSE;
