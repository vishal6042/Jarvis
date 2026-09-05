-- Until now every recurring contribution was assumed monthly (RD, SIP, EPF). LIC endowment
-- policies are paid once a year, so the instalment needs a frequency or a yearly premium would be
-- charged twelve times over in the calendar and the monthly commitment.
ALTER TABLE investment ADD COLUMN contribution_frequency VARCHAR(10) NOT NULL DEFAULT 'monthly';
