# RoadAid card-free test deployment

This deploys the `test` branch for controlled UAT. It is not production: free services sleep, quotas are finite, backups are limited and signup verification rules can change. Never accept real roadside requests on it.

## 1. Create client-owned accounts

Create GitHub, Mapbox, Supabase, Upstash, Render, Expo/EAS and Paystack accounts. In Mapbox choose **Start without a card** and copy the trial public token. Use Paystack test mode only. Render may still request verification under its abuse-prevention rules.

The free topology is:

```text
GitHub test branch
  ├─ Render: Nest API + BullMQ + Socket.IO
  ├─ Render: Next admin
  ├─ Supabase: PostgreSQL/PostGIS + private documents
  ├─ Upstash: Redis
  ├─ Mapbox: search, routes and tiles through MapLibre
  └─ Expo EAS: Android UAT APK
```

## 2. Push the branch

```powershell
git switch test
git status
git push -u origin test
```

Confirm GitHub contains no `.env`, service-role key, Redis URL, JWT secret or payment secret.

## 3. Provision Supabase

1. Create a Free project in the closest available region.
2. In SQL Editor run:

```sql
create extension if not exists postgis;
create extension if not exists pgcrypto;
```

3. Create a **private** Storage bucket named `provider-documents`.
4. Copy the project URL and service-role key. The service-role key is API-only; never put it in `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*`.
5. Copy the direct PostgreSQL URI and ensure it uses `sslmode=require`. Save it as `DATABASE_URL`.

The API runs `prisma migrate deploy` before startup. After the first deploy, verify the mandatory invariants:

```sql
select indexname from pg_indexes where indexname in (
  'uq_provider_one_active_request',
  'uq_request_one_pending_offer',
  'uq_provider_one_pending_offer'
);
```

All three rows must exist before testing.

## 4. Provision Upstash

Create one Free Redis database and copy its TLS `rediss://` URL as `REDIS_URL`. BullMQ delayed offers are durable work, not disposable cache; monitor the free command quota and do not enable eviction.

## 5. Configure Mapbox

Use the cardless trial public token for all three test variables:

- API: `MAPBOX_ACCESS_TOKEN`
- Admin: `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- Mobile: `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`

The API selects it with `MAPS_PROVIDER=mapbox`. Never expose a secret Mapbox token. Restrict the browser token to the test admin hostname when that hostname is available. The test branch uses MapLibre, so it does not require Google native map keys.

## 6. Deploy the Render Blueprint

1. Choose **New → Blueprint**, select this repository and branch `test`. Render reads `render.yaml`.
2. Deploy `roadaid-test-api` first and enter each value marked `sync: false`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL URI |
| `REDIS_URL` | Upstash TLS URI |
| `MAPBOX_ACCESS_TOKEN` | Mapbox trial public token |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key |
| `PAYSTACK_SECRET_KEY` | Paystack test secret |
| `PAYSTACK_WEBHOOK_SECRET` | Paystack test secret used for HMAC |
| `OTP_DEV_FIXED_CODE` | Private six-digit UAT code |
| `ADMIN_BOOTSTRAP_EMAIL` | Test admin email |
| `ADMIN_BOOTSTRAP_PASSWORD` | Unique 16+ character password |

3. Once the API hostname exists, set `PUBLIC_API_URL=https://roadaid-test-api.onrender.com`.
4. For the admin set:

```text
NEXT_PUBLIC_API_URL=https://roadaid-test-api.onrender.com/v1
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=<public token>
```

5. Once the admin hostname exists, set API `CORS_ORIGINS=https://roadaid-test-admin.onrender.com` and redeploy the API.
6. Confirm both endpoints succeed (the first request after sleep can take about one minute):

```text
GET https://roadaid-test-api.onrender.com/health
GET https://roadaid-test-api.onrender.com/ready
```

7. Inspect the API deploy log and confirm every Prisma migration completed. Do not continue on a migration error.

## 7. Configure Paystack test webhooks

Set the Paystack test webhook URL to:

```text
https://roadaid-test-api.onrender.com/v1/webhooks/paystack
```

Use only test cards. Replay one event and confirm it does not create a second payment or ledger entry.

## 8. Build the Android UAT app

From `apps/provider-mobile`:

```powershell
npx eas-cli login
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://roadaid-test-api.onrender.com/v1 --visibility plaintext
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN --value <public-token> --visibility sensitive
npx eas-cli build --platform android --profile preview
```

Install the APK on two Android 10+ phones. Address search, GPS and Mapbox-backed maps should work. In the location picker, long-press the map to move the test pin.

## 9. Prepare actors

1. Sign in to admin with the bootstrap credentials.
2. Register one customer and at least two providers using the private fixed UAT OTP.
3. Give both providers the same service, upload documents, then approve both profiles and that service.
4. Put both providers near the Abuja pickup and online.
5. Confirm neither has an active request or pending offer.

The fixed OTP and console SMS provider are allowed only under `NODE_ENV=test`. Never promote this configuration to production.

## 10. Start the real-time test

Use a customer phone, provider phone and admin browser:

1. Create a FUEL request and confirm the locked integer-kobo quote.
2. Provider A must receive the only pending offer; Provider B must receive none.
3. Provider A declines; only then should Provider B receive an offer.
4. Provider B accepts. Customer and admin must update over Socket.IO.
5. Try assigning another request to Provider B. It must fail because one provider can have only one active job.
6. Move Provider B and confirm customer/admin locations, last-update time and stale states.
7. Complete arrival, pickup PIN, Paystack test or cash confirmation, service start and completion.
8. Reconcile payment, commission and earnings exactly in kobo.
9. Repeat for TOWING and LOCKOUT.
10. Let an offer expire with the app backgrounded. BullMQ/the sweeper must advance dispatch without depending on push.
11. Kill and reopen both apps; active state must restore from REST.
12. Record timestamped evidence in `docs/DEVICE_TESTS.md`.

## 11. Cleanup

After UAT, remove test identity documents, delete or suspend the Render services, Upstash database and Supabase project when no longer needed, revoke the Mapbox token and rotate any shared test secret. Keep `master` production-oriented; free sleeping infrastructure must never be promoted for live roadside operations.
