-- Buffered location batches can be retried after an uncertain network response.
-- Keep active-job history idempotent without weakening the one-active-job invariant.
DELETE FROM "provider_location_history" older
USING "provider_location_history" newer
WHERE older."provider_id" = newer."provider_id"
  AND older."recorded_at" = newer."recorded_at"
  AND (older."created_at", older."id") > (newer."created_at", newer."id");

CREATE UNIQUE INDEX "provider_location_history_provider_id_recorded_at_key"
  ON "provider_location_history"("provider_id", "recorded_at");
