# RoadAid Device Tests

Record the date, device/OS, build identifier and PASS/FAIL evidence for every run. Use Abuja test locations and non-production accounts.

## Phase 3 dispatch gate

Required devices: one customer phone, two approved provider phones, and the admin dashboard. Provider testing must use an EAS development build for background push; Expo Go may be used only for foreground polling checks.

1. Start PostgreSQL, Redis, API and admin. Confirm `/health`, Redis connectivity and all three devices can reach the API.
2. On both provider phones, grant notification and precise-location permission, publish fresh GPS and go online for the same approved service.
3. On the customer phone, create a request within the configured radius. Confirm status changes to `SEARCHING`.
4. Confirm only the best-ranked provider receives the first offer. Verify pickup, service, distance, ETA and server expiry time.
5. Lock/background provider phone 1. Confirm the MAX-importance offer notification opens the offer screen. Decline it.
6. Confirm provider 1 returns online and provider phone 2 receives the next sequential offer. Provider 1 must not receive the same request again in that round.
7. Accept on provider 2. Confirm exactly one assignment, provider 2 becomes busy, and the customer sees provider identity and phone.
8. Progress the provider through `EN_ROUTE`, `ARRIVED`, `IN_PROGRESS`, and `COMPLETED`. Confirm the customer status follows and provider 2 returns online after completion.
9. Repeat with provider 1 allowing the offer to expire. Confirm provider 2 receives the fallback offer after server expiry even if push is disabled.
10. Cancel a customer request while an offer is pending. Confirm the offer becomes cancelled and the reserved provider returns online.
11. Accept then cancel from the provider. Confirm the request returns to `SEARCHING` and that provider is excluded for the current round.
12. Exhaust all providers. Confirm `ESCALATED`, admin alert, re-dispatch with a new round, manual assignment and admin cancellation.

## Network and recovery matrix

- Disable provider data during an offer, then restore it: polling/resync must recover current server state.
- Kill and reopen each app: pending offer, active job and customer status must resync.
- Deny location: provider must not go online and must receive a recovery instruction.
- Stop provider GPS for more than the configured stale threshold: provider must be excluded from new candidates.
- Leave an idle provider stale for 15 minutes: sweeper must set `OFFLINE`.
- Enable battery saver and lock the provider phone: record whether push opens and document any OEM restriction.

## Evidence

Attach screenshots for offer 1, fallback offer 2, customer assignment, admin timeline and final completion. Save API event rows and the SQL uniqueness assertions with the test report.
