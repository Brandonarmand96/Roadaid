-- Client-approved commercial policy, 26 Nov 2026.
-- Stop rather than deleting provider capability data if an existing provider has multiple services.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM provider_services GROUP BY provider_id HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Provider service cleanup required: one or more providers have multiple service rows';
  END IF;
END $$;

CREATE UNIQUE INDEX "uq_provider_one_service" ON "provider_services" ("provider_id");

-- Replace only the original seeded placeholders; preserve operator-edited rules.
UPDATE pricing_rules
SET base_kobo = 600000, per_litre_kobo = 135000, min_kobo = 600000, updated_at = now()
WHERE service_type = 'FUEL' AND base_kobo = 300000 AND per_litre_kobo = 150000 AND min_kobo = 300000;

UPDATE pricing_rules
SET base_kobo = 2750000, per_km_kobo = 150000, min_kobo = 2750000, towing_free_km = 5, updated_at = now()
WHERE service_type = 'TOWING' AND base_kobo = 1500000 AND per_km_kobo = 50000 AND min_kobo = 1500000;

UPDATE pricing_rules
SET base_kobo = 1200000, min_kobo = 1200000, updated_at = now()
WHERE service_type = 'LOCKOUT' AND base_kobo = 800000 AND min_kobo = 800000;
