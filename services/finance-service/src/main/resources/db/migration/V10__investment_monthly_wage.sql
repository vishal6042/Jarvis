-- Gratuity is not saved up; it is worked out from the last wage (basic + DA) and years of service:
-- wage x 15/26 x years, capped by law. Storing the wage lets Jarvis keep the figure current
-- instead of relying on a number typed in once.
ALTER TABLE investment ADD COLUMN monthly_wage NUMERIC(16, 2);
