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

## Phase 4 tracking and payment gate

Required build: provider EAS development APK (Expo Go is not valid for background-location evidence), customer app, and an API reachable by both devices.

Record: date/time in `Africa/Lagos`, provider device model/Android or iOS version, build identifier, request code, and a screen recording or timestamped screenshots.

1. Sign in as an approved provider, grant precise foreground location and “Allow all the time” background location, then go online. Confirm the persistent “RoadAid: You’re online” notification appears on Android.
2. Create and accept a request. Start driving so the request is `EN_ROUTE`; confirm the provider app reports “Live job tracking” and the customer shows a fresh location plus ETA.
3. Lock the provider phone for at least 90 seconds while moving safely. Confirm customer updates continue at approximately five-second intervals and never display stale coordinates as live.
4. Disable provider mobile data/Wi-Fi for 30–60 seconds while moving. Confirm the customer changes to “Location update delayed” after 30 seconds and retains the last known position.
5. Restore connectivity before five minutes have elapsed. Confirm buffered points flush oldest-first, the customer returns to “Provider location live”, and the latest marker/coordinates do not jump backward to an older buffered point.
6. Disable connectivity for more than 120 seconds. Confirm the customer shows “Provider connection lost”, the last-seen Lagos time, and keeps the provider call action available.
7. Complete payment and progress through `ARRIVED` → `IN_PROGRESS` → `COMPLETED`. Confirm the customer receipt shows the exact locked total, gateway/reference and Lagos completion time.
8. Confirm the provider wallet increases by exactly `price_kobo - floor(price_kobo × commission_bps / 10000)` and no second earning appears after app restart or webhook replay.
9. Request a payout, approve it as FINANCE/SUPER_ADMIN, record a manual bank transfer and confirm the wallet receives one exact negative payout ledger entry.
10. Repeat the locked-phone tracking test with battery saver enabled. Record any OEM restriction and verify the app’s settings guidance leads to the appropriate system screen.

### Phase 4 evidence table

| Check | Request code | Device/build | Evidence | Result |
|---|---|---|---|---|
| Locked phone updates |  |  |  | PASS / FAIL |
| 30-second delayed state |  |  |  | PASS / FAIL |
| 120-second lost state |  |  |  | PASS / FAIL |
| Offline buffer recovery |  |  |  | PASS / FAIL |
| Exact receipt and ledger |  |  |  | PASS / FAIL |
| Wallet and payout |  |  |  | PASS / FAIL |

## Evidence

Attach screenshots for offer 1, fallback offer 2, customer assignment, admin timeline and final completion. Save API event rows and the SQL uniqueness assertions with the test report.
