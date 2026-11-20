# RoadAid Operations Runbook

## Service checks

1. Check process/container health: `docker compose -f infrastructure/docker-compose.prod.yml ps`.
2. Check liveness: `GET /health`.
3. Check readiness: `GET /ready`.
4. Confirm PostgreSQL accepts queries and Redis returns `PONG`.
5. Check structured API logs, queue failures, error rate and Sentry before restarting anything.

## Production deployment

1. Tag the known-good release and record its image digests.
2. Back up PostgreSQL and verify the resulting gzip file is non-empty.
3. Confirm `.env.production` contains unique secrets, production Termii/Paystack values, `CORS_ORIGINS`, and no development OTP code.
4. Build immutable API/admin images.
5. Run `pnpm --filter api db:migrate` once against the production database.
6. Start PostgreSQL/Redis, then API, then admin.
7. Verify `/health`, `/ready`, admin login, one OTP request, one quote and a non-charging smoke request.
8. Monitor API errors, BullMQ failures, Redis memory and PostgreSQL connections for at least 15 minutes.

## Rollback

1. Stop new deployments; do not reverse a database migration blindly.
2. Select the last known-good image tag recorded before deployment.
3. If the migration is backward-compatible, redeploy the previous API/admin images.
4. If data restoration is required, place RoadAid in maintenance, take a forensic backup, then follow the restore procedure below.
5. Verify health, authentication, dispatch, payment status and ledger totals.
6. Record the incident, release tag, timestamps and affected request codes.

## Backup and restore

Run nightly backups with `infrastructure/scripts/backup.sh`; retain 14 days and copy backups to client-owned S3-compatible storage. Override `POSTGRES_CONTAINER`, `POSTGRES_USER` and `POSTGRES_DB` when the deployment names differ. Test a restore monthly.

Restore drill:

1. Create an isolated PostgreSQL database/container.
2. Verify the target variables, then run `CONFIRM_RESTORE=RESTORE infrastructure/scripts/restore.sh <backup.sql.gz>` against the isolated target.
3. Apply no new writes to production during an actual recovery.
4. Confirm row counts, mandatory partial indexes, recent request events, payments and ledger totals.
5. Point a staging API at the restored database and run health plus journey smoke tests.
6. Promote only after Operations and Finance reconcile the restore point.

## Dispatch stuck

1. Locate the request in admin and read its event timeline.
2. Confirm Redis is reachable and both `dispatch-next` and `offer-expire` workers are running.
3. Check for a pending offer and compare `expires_at` with server time.
4. Check the provider profile's availability and `current_request_id`.
5. Confirm the three mandatory partial unique indexes exist.
6. Allow the 15-second sweeper to recover expired/orphaned state.
7. If the request is `ESCALATED`, use audited re-dispatch or manual assignment; never edit request/provider rows directly.
8. If recovery fails, capture request code, request events, offer rows, provider IDs and queue logs before restarting the API.

## Payment incident

1. Never mark a request paid from a customer screenshot alone.
2. Verify the Paystack reference server-side and confirm NGN plus exact kobo amount.
3. Check `webhook_events` before replaying; duplicate event IDs must not write another ledger entry.
4. Use the audited Finance manual-payment/refund controls only after independent confirmation.
5. Reconcile `CUSTOMER_PAYMENT`, `PLATFORM_COMMISSION`, `PROVIDER_EARNING`, `REFUND` and `PAYOUT` entries.

## Secret rotation

- JWT secrets: deploy new secrets during a planned forced-sign-in window; existing access tokens will become invalid.
- Paystack/Termii/S3/FCM: rotate in the provider console, update the secret store, redeploy, verify, then revoke the old credential.
- Admin bootstrap password: use it only for initial provisioning, then replace it and restrict access.
- Never place secrets in Git, screenshots, issue trackers or mobile `EXPO_PUBLIC_*` variables.

## Redis or database outage

- Redis outage: new dispatch timers cannot be trusted. Keep requests visible, restore Redis/AOF, then let the sweeper reconcile. Do not simulate acceptance manually in SQL.
- PostgreSQL outage: stop mutations, restore connectivity, verify readiness, then inspect requests created immediately before the outage.
- Notify users only of confirmed state; do not present stale provider coordinates as live.
