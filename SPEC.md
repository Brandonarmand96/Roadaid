# ROADAID — BUILD SPECIFICATION FOR AI CODING AGENT

Version 1.0 · 9 Nov 2026 · Companion to "RoadAid Platform — Product Scope, Deliverables & Acceptance Schedule"

> **How to use this file.** Place it in the repo root as `SPEC.md` (and a short `AGENTS.md` / `CLAUDE.md` that says "Read SPEC.md before every task"). Work through the phases in Section 15 in order. Do not start a phase until the previous phase's acceptance gate passes. Never add features that are not in this file.

---

## 0. Agent operating rules (read first)

1. **Scope is frozen.** Build only what this spec describes. If something is ambiguous, pick the default stated here, record it in `docs/DECISIONS.md`, and continue. Do not ask the human unless a blocker is marked `[BLOCKER]`.
2. **Out of scope (never build):** restaurant/food delivery, extra services beyond fuel/towing/lockout, automated bank payouts, surge pricing, promos/referrals, in-app chat or calling, multi-city config, multi-job-per-provider, simultaneous offers to several providers, showing nearby providers on the customer map before a request, web versions of the customer/provider apps, ML dispatch.
3. **Vertical slices.** Each feature must work end to end (DB → API → real-time → app/admin UI) before the next one starts.
4. **Tests are part of "done".** Dispatch, concurrency, payments and authorization MUST have automated tests. A feature without its listed tests is not complete.
5. **Money is integers.** All amounts are stored in **kobo** (integer). Never use floating point for money. Currency is NGN.
6. **All timestamps are UTC** (`timestamptz`). Format in the UI using `Africa/Lagos`.
7. **Server is the source of truth for time and state.** Never trust client clocks for offer expiry, ETA or availability.
8. **Push notifications are best-effort.** Dispatch correctness must rely on backend timers and state, never on push delivery.
9. **Secrets** only via environment variables. Never commit keys. Provide `.env.example`.
10. **Commit discipline.** Small commits, conventional messages, one PR per slice. Run `pnpm lint && pnpm typecheck && pnpm test` before declaring done.
11. After each phase, update `docs/PROGRESS.md` with: what was built, how to run it, what tests pass, known gaps.

---

## 1. Product summary

RoadAid is an Uber/Bolt-style on-demand **roadside assistance** platform for **Abuja, Nigeria**.

- **Services (3):** `FUEL` (emergency fuel delivery), `TOWING`, `LOCKOUT`. Each provider account is verified for exactly one service specialty.
- **Interfaces (3):** One RoadAid mobile app with Customer and Provider modes, the Admin web dashboard, and a public informational website — all served by one backend/web deployment. Provider accounts may use both mobile modes; customer accounts may use Customer mode only.
- **Flow:** Customer selects service → confirms location → sees price → submits. Backend automatically finds the best eligible provider, sends a timed offer, falls through to the next provider on decline/timeout, confirms exactly one provider, and the customer then sees that provider's live location, ETA and phone number. Provider completes the job; platform records payment, commission and provider earnings. Admin intervenes when automation fails.
- **Core principle:** one active job per provider. No overlapping assignments.
- Brand: RoadAid, tagline "BUILT FOR CERTAINTY". Website: https://roadaid.co.

---

## 2. Technology stack (fixed)

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript everywhere (strict mode) |
| Backend | NestJS (Express adapter), REST + Socket.IO |
| ORM / DB | PostgreSQL 16 + PostGIS; **Prisma** for CRUD and migrations; **raw SQL** (`$queryRaw`/`$executeRaw`) for geo queries and row locking |
| Queue / timers | Redis 7 + BullMQ |
| Real-time | Socket.IO (WebSocket with polling fallback) |
| Mobile | React Native + Expo (SDK current stable), **EAS Build / dev client** (not Expo Go — background location needs native modules) |
| Mobile libs | `expo-location`, `expo-task-manager`, `expo-notifications`, `react-native-maps` (Google provider), `expo-secure-store`, `@tanstack/react-query`, `zustand`, `socket.io-client`, `expo-image-picker`, `expo-document-picker`, `react-hook-form` + `zod` |
| Admin | Next.js (App Router) + Tailwind + shadcn/ui + TanStack Query + `@vis.gl/react-google-maps` |
| Maps | Google Maps Platform: Maps SDK, Places Autocomplete, Geocoding, Routes API (ETA/distance) |
| Push | Firebase Cloud Messaging (via Expo push or FCM directly) |
| SMS/OTP | Provider-agnostic `SmsProvider` interface; default implementation for **Termii** (Nigeria); `ConsoleSmsProvider` for dev |
| Payments | Provider-agnostic `PaymentGateway` interface; default **Paystack**; Flutterwave adapter optional |
| File storage | S3-compatible (`StorageService`); local disk adapter for dev |
| Validation | `zod` shared schemas in `packages/shared` + NestJS pipes |
| Tests | Jest, Supertest, Testcontainers (Postgres+PostGIS, Redis); Playwright smoke test for admin |
| Observability | Sentry, pino structured logs, `/health` + `/ready` endpoints |
| CI/CD | GitHub Actions: lint, typecheck, test, build; Docker images |

---

## 3. Repository layout

```
roadaid/
├── apps/
│   ├── api/                  # NestJS
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/       # guards, decorators, filters, interceptors, utils
│   │   │   ├── config/       # typed env config (zod-validated)
│   │   │   ├── prisma/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── providers/    # onboarding, documents, services, availability
│   │   │   ├── customers/
│   │   │   ├── pricing/
│   │   │   ├── requests/     # service request lifecycle
│   │   │   ├── dispatch/     # engine, offers, processors, sweeper
│   │   │   ├── location/
│   │   │   ├── realtime/     # socket gateway
│   │   │   ├── notifications/
│   │   │   ├── payments/
│   │   │   ├── wallet/       # ledger, payouts
│   │   │   ├── admin/
│   │   │   ├── reports/
│   │   │   ├── storage/
│   │   │   └── audit/
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/migrations/   # includes hand-written SQL migration for PostGIS + partial unique indexes
│   │   └── test/
│   ├── admin-web/            # Next.js admin dashboard
│   └── provider-mobile/      # Unified RoadAid Expo app (Customer + Provider modes)
├── packages/
│   ├── shared/               # zod schemas, enums, DTO types, constants, API client
│   └── config/               # eslint, tsconfig, prettier
├── infrastructure/
│   ├── docker/               # Dockerfile.api, Dockerfile.admin
│   ├── docker-compose.yml    # postgres(postgis), redis, api, admin (dev)
│   ├── docker-compose.prod.yml
│   └── scripts/              # backup.sh, restore.sh, seed
├── docs/                     # DECISIONS.md, PROGRESS.md, API.md, RUNBOOK.md, ADMIN_GUIDE.md, HANDOVER.md
├── SPEC.md
└── .github/workflows/ci.yml
```

---

## 4. Environment variables (`.env.example`)

```
NODE_ENV=development
APP_TZ=Africa/Lagos
DATABASE_URL=postgresql://roadaid:roadaid@localhost:5432/roadaid
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
OTP_TTL_SECONDS=300
OTP_DEV_FIXED_CODE=123456          # honoured ONLY when NODE_ENV != production
SMS_PROVIDER=console               # console | termii
TERMII_API_KEY=
TERMII_SENDER_ID=
GOOGLE_MAPS_SERVER_KEY=            # Routes/Geocoding (server)
PAYMENT_GATEWAY=paystack
PAYSTACK_SECRET_KEY=
PAYSTACK_WEBHOOK_SECRET=           # same as secret key for Paystack HMAC
STORAGE_DRIVER=local               # local | s3
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
FCM_SERVICE_ACCOUNT_JSON=          # base64
SENTRY_DSN=
ADMIN_BOOTSTRAP_EMAIL=
ADMIN_BOOTSTRAP_PASSWORD=
PAYMENT_MODE=ONLINE_AFTER_ACCEPT   # retained for reversible Paystack re-enablement
CUSTOMER_ONLINE_PAYMENTS_ENABLED=false # customer pays provider directly by default
CASH_COMMISSION_LIMIT_KOBO=5000000 # default ₦50,000; integer kobo only
```
Mobile: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`, `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY`.
Admin: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.

---

## 5. Domain model

### 5.1 Enums

```
Role:               CUSTOMER | PROVIDER | ADMIN
AdminRole:          SUPER_ADMIN | OPERATIONS | FINANCE
UserStatus:         ACTIVE | SUSPENDED | DELETED
ServiceType:        FUEL | TOWING | LOCKOUT
ApprovalStatus:     PENDING | APPROVED | REJECTED | SUSPENDED
ProviderAvailability (stored): OFFLINE | ONLINE | RESERVED | BUSY | UNAVAILABLE
   - RESERVED = has a PENDING offer (internal; UI shows as "Available")
   - Public states shown to humans: Available (ONLINE/RESERVED), Busy, Unavailable, Offline
RequestStatus:      REQUESTED | SEARCHING | ASSIGNED | EN_ROUTE | ARRIVED | IN_PROGRESS | COMPLETED | CANCELLED | ESCALATED
   (ESCALATED = no provider accepted; needs admin. Admin can re-dispatch/assign/cancel.)
OfferStatus:        PENDING | ACCEPTED | DECLINED | EXPIRED | CANCELLED
PaymentStatus:      NONE | PENDING | PAID | FAILED | REFUNDED
CancelledBy:        CUSTOMER | PROVIDER | ADMIN | SYSTEM
PayoutStatus:       REQUESTED | APPROVED | PAID | REJECTED
LedgerEntryType:    CUSTOMER_PAYMENT | PROVIDER_EARNING | PLATFORM_COMMISSION | PAYOUT | REFUND | ADJUSTMENT
```

### 5.2 Tables (Prisma models; snake_case DB names; UUID primary keys; `created_at`, `updated_at` everywhere)

**users** — id, role, phone (unique, E.164), email (unique nullable), password_hash (admins only), full_name, avatar_url, status, admin_role (nullable), last_login_at.

**otp_codes** — id, phone, code_hash, purpose (LOGIN), expires_at, attempts, consumed_at.

**refresh_tokens** — id, user_id, token_hash, device_info, expires_at, revoked_at.

**device_tokens** — id, user_id, platform (ANDROID|IOS), token (unique), app (CUSTOMER|PROVIDER), last_seen_at.

**customer_vehicles** — id, customer_id, make, model, color, plate_number, vehicle_type (CAR|SUV|VAN|TRUCK|MOTORCYCLE), is_default.

**provider_profiles** — user_id (PK/FK), business_name (nullable), address, availability (enum, default OFFLINE), current_request_id (nullable FK), rating_avg, rating_count, completed_jobs, vehicle_make/model/plate (service vehicle), equipment_notes, onboarding_status (DRAFT | SUBMITTED | APPROVED | REJECTED | SUSPENDED), reviewed_by, reviewed_at, rejection_reason, wallet_balance_kobo (denormalised cache, ledger is truth).

**provider_services** — id, provider_id, service_type, status (ApprovalStatus), details JSON (FUEL: `{containerCapacityLitres, fuelTypes[]}`; TOWING: `{truckType, maxVehicleWeightKg, plate}`; LOCKOUT: `{toolsDescription}`), approved_by, approved_at, rejection_reason. **Unique provider_id: one provider account has exactly one service specialty.**

**provider_documents** — id, provider_id, service_type (nullable = general), doc_type (NATIONAL_ID | DRIVERS_LICENCE | VEHICLE_PAPERS | EQUIPMENT_PHOTO | PROFILE_PHOTO | OTHER), storage_key, mime_type, size_bytes, status (PENDING|ACCEPTED|REJECTED), reviewed_by, note.

**provider_locations** — provider_id (PK), location `geography(Point,4326)`, heading, speed_mps, accuracy_m, recorded_at (device time, sanity-checked), received_at (server time). **Latest location only; upsert.** GiST index on `location`.

**provider_location_history** — id, provider_id, request_id (nullable), location geography, accuracy_m, recorded_at. Insert only while on an active job. Retention job deletes rows older than 30 days.

**pricing_rules** — id, service_type (unique), base_kobo, per_km_kobo, per_litre_kobo, min_kobo, towing_free_km (default 0), active, updated_by.

**dispatch_settings** — id, service_type (unique), offer_timeout_seconds, search_radius_km, max_offers, candidate_shortlist_size (for ETA calls, default 5), stale_location_seconds, max_search_duration_seconds, updated_by.
Defaults: FUEL 30s/15km/5; TOWING 45s/15km/5; LOCKOUT 30s/15km/5; shortlist 5; stale 90s; max_search 600s.

**commission_settings** — id, service_type (unique), commission_bps (basis points; e.g. 1500 = 15%), updated_by.

**service_requests** — id, code (human-friendly e.g. `RA-20261109-0042`), customer_id, service_type, status, provider_id (nullable), vehicle_id (nullable) + vehicle snapshot JSON, details JSON (FUEL: `{fuelType, litres}`; TOWING: `{destination:{lat,lng,address}, vehicleCondition}`; LOCKOUT: `{lockType: KEYS_INSIDE|LOST_KEY|BROKEN_KEY, notes}`), pickup_location geography, pickup_address, pickup_note, distance_km (towing, from Routes API), price_kobo (locked at creation), price_breakdown JSON, commission_bps (snapshot), payment_status, payment_mode (`ONLINE_AFTER_ACCEPT`/`ONLINE_ON_COMPLETION`/`CASH`), current_offer_id, offers_made_count, eta_seconds (latest), accepted_at, arrived_at, started_at, completed_at, cancelled_at, cancelled_by, cancel_reason, cancel_fee_kobo, search_started_at, escalated_at, rating_customer_to_provider (1–5), review_text, dispute_flag, dispute_reason, disputed_at.

**request_events** — id, request_id, type (e.g. CREATED, OFFER_SENT, OFFER_DECLINED, OFFER_EXPIRED, ASSIGNED, STATUS_CHANGED, ESCALATED, ADMIN_ACTION, PAYMENT_UPDATE, CANCELLED, DISPUTE), actor_type (CUSTOMER|PROVIDER|ADMIN|SYSTEM), actor_id, payload JSON, created_at. **Append-only.**

**dispatch_offers** — id, request_id, provider_id, sequence_no, status, offered_at, expires_at, responded_at, distance_m_at_offer, eta_seconds_at_offer, expiry_job_id, decline_reason. **Unique (request_id, provider_id)** so the same provider is never offered the same request twice.

**payments** — id, request_id, customer_id, gateway (PAYSTACK|FLUTTERWAVE|MANUAL), reference (unique), amount_kobo, status, gateway_response JSON, paid_at, idempotency_key.

**webhook_events** — id, gateway, event_id (unique per gateway), payload JSON, processed_at. Used for idempotency.

**ledger_entries** — id, type, request_id (nullable), payment_id (nullable), provider_id (nullable), amount_kobo (signed; positive = credit to the named party), description, created_by (nullable), created_at. **Immutable.** Wallet balance = SUM for provider.

**payout_requests** — id, provider_id, amount_kobo, status, bank_name, account_number, account_name, requested_at, reviewed_by, reviewed_at, paid_reference, note.

**provider_bank_accounts** — id, provider_id, bank_name, account_number, account_name.

**notifications** — id, user_id, title, body, data JSON, read_at.

**audit_logs** — id, actor_id, actor_role, action, entity_type, entity_id, before JSON, after JSON, ip, created_at. Written for every admin mutation.

### 5.3 Mandatory database constraints (write as hand-written SQL migration)

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A provider may have at most ONE active request at any time.
CREATE UNIQUE INDEX uq_provider_one_active_request
  ON service_requests (provider_id)
  WHERE provider_id IS NOT NULL
    AND status IN ('ASSIGNED','EN_ROUTE','ARRIVED','IN_PROGRESS');

-- A request may have at most ONE pending offer at a time.
CREATE UNIQUE INDEX uq_request_one_pending_offer
  ON dispatch_offers (request_id) WHERE status = 'PENDING';

-- A provider may have at most ONE pending offer at a time.
CREATE UNIQUE INDEX uq_provider_one_pending_offer
  ON dispatch_offers (provider_id) WHERE status = 'PENDING';

CREATE INDEX idx_provider_locations_gist ON provider_locations USING GIST (location);
CREATE INDEX idx_requests_status ON service_requests (status, created_at);
CREATE INDEX idx_offers_expiry ON dispatch_offers (expires_at) WHERE status = 'PENDING';
```
These indexes are the last line of defence against double assignment; application logic must also enforce the rules.

---

## 6. State machines

### 6.1 Service request

```
REQUESTED ──(dispatch starts)──▶ SEARCHING ──(offer accepted)──▶ ASSIGNED
SEARCHING ──(exhausted / max duration)──▶ ESCALATED ──(admin re-dispatch)──▶ SEARCHING
ESCALATED ──(admin assigns manually)──▶ ASSIGNED
ASSIGNED ──▶ EN_ROUTE ──▶ ARRIVED ──▶ IN_PROGRESS ──▶ COMPLETED
Any non-terminal ──▶ CANCELLED
```
Allowed transitions are enforced in one function `RequestStateService.transition(requestId, to, actor, payload)` that runs in a DB transaction, validates the transition table, writes a `request_events` row, and emits real-time events after commit. **No other code may update `service_requests.status` directly.**

Cancellation rules:
- Customer cancels in `REQUESTED/SEARCHING/ESCALATED` → free; cancel pending offer; release reserved provider.
- Customer cancels in `ASSIGNED/EN_ROUTE` → allowed; `cancel_fee_kobo` computed from admin-configured policy (default 0; setting `cancel_fee_after_assignment_kobo`); provider freed.
- Customer cancel after `ARRIVED` → blocked in the app; customer must contact admin. Admin can cancel any time.
- Provider cancels after accepting → request returns to `SEARCHING` with that provider excluded; `request_events` logs it; provider's cancellation count increments (visible to admin).
- When a request leaves an active status, the provider returns to `ONLINE` (if they had not gone offline) and `current_request_id = NULL`.

### 6.2 Provider availability

```
OFFLINE ⇄ ONLINE              (provider toggles; ONLINE requires approved service + fresh location + permissions)
ONLINE ──(offer sent)──▶ RESERVED ──(offer declined/expired)──▶ ONLINE
RESERVED ──(offer accepted)──▶ BUSY ──(job completed/cancelled)──▶ ONLINE
ONLINE/RESERVED ⇄ UNAVAILABLE (provider "pause" toggle; excluded from dispatch)
```
A provider who stops sending location for longer than `stale_location_seconds` is excluded from candidate queries (state remains; no mutation needed). After 15 minutes with no location and no active job, a sweeper sets them `OFFLINE`.

---

## 7. Dispatch engine (highest priority)

### 7.1 Trigger
`RequestsService.create()` → persist request with `REQUESTED` → in the same transaction insert event `CREATED` → after commit enqueue BullMQ job `dispatch:next` `{requestId}` with `jobId = "dispatch-next:" + requestId + ":" + offersMadeCount` (idempotent) and transition to `SEARCHING`.

### 7.2 `dispatch:next` processor (pseudocode — implement exactly)

```
async dispatchNext(requestId):
  BEGIN TX
    req = SELECT * FROM service_requests WHERE id=$1 FOR UPDATE
    if req.status != 'SEARCHING': COMMIT; return           # cancelled / already assigned / escalated
    if now() - req.search_started_at > settings.max_search_duration: escalate(req); COMMIT; return
    if offersPending(req): COMMIT; return                  # another offer is active

    settings = dispatch_settings[req.service_type]

    candidates = SQL:
      SELECT pp.user_id, ST_Distance(pl.location, $pickup) AS dist_m
      FROM provider_profiles pp
      JOIN provider_services ps ON ps.provider_id = pp.user_id
           AND ps.service_type = $service AND ps.status = 'APPROVED'
      JOIN users u ON u.id = pp.user_id AND u.status = 'ACTIVE'
      JOIN provider_locations pl ON pl.provider_id = pp.user_id
      WHERE pp.onboarding_status = 'APPROVED'
        AND pp.availability = 'ONLINE'
        AND pp.current_request_id IS NULL
        AND pl.received_at > now() - make_interval(secs => settings.stale_location_seconds)
        AND ST_DWithin(pl.location, $pickup, settings.search_radius_km * 1000)
        AND NOT EXISTS (SELECT 1 FROM dispatch_offers o WHERE o.request_id=$req AND o.provider_id=pp.user_id)
      ORDER BY dist_m ASC
      LIMIT settings.candidate_shortlist_size
      FOR UPDATE OF pp SKIP LOCKED                       # concurrent dispatchers never grab the same provider

    if candidates empty OR req.offers_made_count >= settings.max_offers:
        escalate(req); COMMIT; return

    ranked = rankByEta(candidates, pickup)                 # Routes API; on failure use dist_m / 8.3 m/s (~30 km/h) as ETA
    best = ranked[0]

    INSERT dispatch_offers (status='PENDING', expires_at = now()+timeout, sequence_no = offers_made_count+1, eta_seconds_at_offer, ...)
    UPDATE provider_profiles SET availability='RESERVED' WHERE user_id=best.id AND availability='ONLINE'   # check rowcount == 1 else rollback+retry
    UPDATE service_requests SET current_offer_id, offers_made_count = offers_made_count+1
    INSERT request_events OFFER_SENT
  COMMIT

  AFTER COMMIT:
    enqueue BullMQ delayed job `offer:expire` {offerId} delay=timeout+1s, jobId="offer-expire:"+offerId
    socket emit `offer.new` to room provider:{id}
    push (FCM high priority data message) to provider
    socket emit `request.updated` to customer
```

`rankByEta`: call Routes API `computeRouteMatrix` (traffic-aware optional) for shortlist origins → pickup. Cache by (origin rounded to 3 decimals, destination) for 60 s. Sort by ETA ascending; tie-break by distance, then by provider with fewer completed jobs today (fairness).

### 7.3 `offer:expire` processor
```
BEGIN TX
  offer = SELECT * FROM dispatch_offers WHERE id=$1 FOR UPDATE
  if offer.status != 'PENDING': COMMIT; return
  UPDATE offer SET status='EXPIRED', responded_at=now()
  UPDATE provider_profiles SET availability='ONLINE' WHERE user_id=offer.provider_id AND availability='RESERVED'
  INSERT request_events OFFER_EXPIRED
COMMIT
AFTER: emit offer.expired to provider; enqueue dispatch:next for request
```

### 7.4 Accept offer (provider API)
```
BEGIN TX
  offer = SELECT * FROM dispatch_offers WHERE id=$1 AND provider_id=$me FOR UPDATE
  if !offer or offer.status != 'PENDING' or offer.expires_at < now(): throw 409 OFFER_NO_LONGER_AVAILABLE
  req = SELECT * FROM service_requests WHERE id=offer.request_id FOR UPDATE
  if req.status != 'SEARCHING': throw 409
  prov = SELECT * FROM provider_profiles WHERE user_id=$me FOR UPDATE
  if prov.current_request_id IS NOT NULL: throw 409 PROVIDER_BUSY
  UPDATE offer SET status='ACCEPTED', responded_at=now()
  UPDATE service_requests SET status='ASSIGNED', provider_id=$me, accepted_at=now()   # partial unique index guards double-assign
  UPDATE provider_profiles SET availability='BUSY', current_request_id=req.id
  INSERT request_events ASSIGNED
COMMIT
AFTER: remove BullMQ expiry job; emit request.updated to customer+admin; push customer; return full job payload
```
Decline: set offer `DECLINED`, provider back to `ONLINE`, enqueue `dispatch:next`.

### 7.5 Sweeper (safety net, because Redis jobs can be lost)
Every 15 s (`@Cron`/BullMQ repeatable): find `dispatch_offers` with `status='PENDING' AND expires_at < now() - 3s` → run the expire logic. Also: find `SEARCHING` requests with no pending offer and no queued job older than 20 s → enqueue `dispatch:next`. Also: providers `RESERVED` with no pending offer → set `ONLINE`.

### 7.6 Escalation
`escalate(req)`: transition to `ESCALATED`, event `ESCALATED`, emit `admin.alert` `{type:'NO_PROVIDER', requestId}`, notify customer ("We're still finding you help — our team has been alerted"), keep request visible at the top of admin list. Admin actions: **Re-dispatch** (reset search_started_at/offers, allow re-offering to previously declined providers by creating a new `dispatch_round` counter — implement by deleting the uniqueness conflict via `round` column on offers: unique `(request_id, provider_id, round)`), **Assign manually** (admin picks an eligible provider; creates an ACCEPTED offer on their behalf with an audit event, subject to the same one-active-job rule), **Cancel**.

### 7.7 Dispatch tests (mandatory — see Section 14)

---

## 8. Pricing and payments

### 8.1 Price calculation (`PricingService.quote(service, details, pickup)`)
```
FUEL:    price = base + per_litre * litres
TOWING:  price = base + per_km * max(0, distance_km - towing_free_km)        # distance pickup → destination via Routes API
LOCKOUT: price = base
price = max(price, min_kobo)
```
Return `{priceKobo, breakdown[], distanceKm}`. The quote is recomputed and **locked** in `service_requests.price_kobo` at creation; the app only displays what the server returns. Admin edits pricing in the dashboard (`pricing_rules`). Client-approved defaults: FUEL ₦6,000 delivery plus configured pump price per litre; TOWING ₦27,500 including 5 km then ₦1,500/km; LOCKOUT ₦12,000 for basic non-destructive entry. The locked breakdown also snapshots RoadAid's fee and the provider payout in integer kobo.

### 8.2 Payment flow
Paystack code remains available, but customer online collection is disabled while `CUSTOMER_ONLINE_PAYMENTS_ENABLED=false`. The default live flow is direct payment to the assigned provider after the service is performed, recorded as `CASH`; provider confirmation is required before the job closes and triggers a customer receipt notification. If the client enables online collection later, `PAYMENT_MODE=ONLINE_AFTER_ACCEPT` applies:
1. After `ASSIGNED`, customer app shows "Pay ₦X" screen. Provider may travel (EN_ROUTE) while payment is pending, but cannot move to `IN_PROGRESS` until `payment_status = PAID` (admin can override with MANUAL payment).
2. `POST /payments/initialize {requestId}` → creates `payments` row (unique reference `RA-PAY-<uuid>`), calls Paystack Initialize Transaction (amount in kobo, email = `<phone>@pay.roadaid.co` placeholder if user has no email, metadata `{requestId}`), returns `authorization_url` + `reference`. Customer app opens it in an in-app browser (`expo-web-browser`) or WebView, then polls `GET /payments/:reference/status`.
3. Paystack calls `POST /webhooks/paystack`. Verify `x-paystack-signature` (HMAC SHA512 of raw body with secret key). Use raw body middleware for this route. Insert into `webhook_events` with unique `(gateway, event_id)`; if duplicate → return 200 immediately (idempotent). Re-verify via Paystack `GET /transaction/verify/:reference` and confirm amount and currency match the payment row before marking `PAID`.
4. On `PAID` (single DB transaction): `payments.status=PAID`; `service_requests.payment_status=PAID`; ledger entries: `CUSTOMER_PAYMENT +amount` (platform side), `PLATFORM_COMMISSION` = floor(amount × commission_bps / 10000), `PROVIDER_EARNING` = amount − commission (credited to provider **when the job reaches COMPLETED**, status "pending" until then — implement by recording the earning entry at completion time and keeping `payments` as proof of collection).
5. `PAYMENT_MODE=ONLINE_ON_COMPLETION`: payment prompt appears after `COMPLETED`; same webhook flow; earnings credited on `PAID`.
6. Failed/abandoned payments: customer can retry (new reference). Admin can mark request paid manually (`gateway=MANUAL`, requires reason, audited).
7. **Refunds:** admin-initiated only. Creates `REFUND` ledger entries (negative), `payments.status=REFUNDED`, and records the Paystack refund reference if issued via API; otherwise a manual note.
8. Cancellation after payment: admin decides refund; the dashboard shows "Refund due" flag for paid + cancelled requests.
9. **Cash option:** the customer chooses cash before submitting. After arrival, the provider confirms the exact locked amount was received before starting service. RoadAid records a MANUAL cash payment, a gross customer-payment entry, and a negative provider-scoped `PLATFORM_COMMISSION` entry equal to `floor(amount × commission_bps / 10000)`. No provider earning is credited because the provider already holds the gross cash.
10. **Cash commission settlement:** the provider wallet shows outstanding cash commission per request and in total. The provider can pay an individual commission through Paystack. A verified settlement creates one positive provider-scoped `ADJUSTMENT` entry, reducing the debt exactly; webhook replay must not create a second settlement. Cash commission debt participates in the ledger-derived available balance and can offset online earnings before payout.
11. **Cash commission debt ceiling:** providers may finish an already-active job, but cannot go online, receive an automatic offer or be manually presented as eligible when outstanding cash commission is at or above `CASH_COMMISSION_LIMIT_KOBO` (default 5,000,000 kobo / ₦50,000). The server enforces the limit; the client only explains it. Verified repayment immediately recalculates eligibility. Providers receive a high-priority notification when cash commission is added and a deduplicated reminder at most once per 24 hours while debt remains.
12. **Secure roadside handoff:** each request receives a cryptographically protected four-digit pickup PIN. Only the owning customer may retrieve the plaintext PIN. A provider must submit the correct PIN before moving an `EN_ROUTE` request to `ARRIVED`; provider, admin and realtime payloads must never expose the PIN verifier or encrypted value.
13. **Persistent notification inbox:** customer and provider push messages are also stored in the in-app inbox. Inbox list and read operations are always scoped by the authenticated user, and push delivery remains best-effort rather than a source of dispatch truth.
14. **Provider offer economics:** an offer shows the customer price, platform commission, provider net amount, payment mode, pickup distance and ETA before acceptance. Commission and net values are computed on the server with integer kobo arithmetic.
15. **Planned and delegated assistance:** customers may request help for another named Nigerian phone contact and may schedule matching between 30 minutes and 30 days ahead. Scheduled activation must survive Redis loss through database recovery and must not bypass normal dispatch eligibility or the one-active-job-per-provider invariant.
16. **Private status sharing:** each request has an unguessable private share token. The public projection exposes only operational status, pickup description and responder identity needed for tracking; it never exposes customer identity, phone numbers, payment data, pickup PIN material or internal events.
17. **Two-sided trust and support:** a provider may rate the customer once after a completed assigned job. Customer and provider help requests are persisted, ownership-scoped and handled by Operations through audited OPEN, IN_PROGRESS and RESOLVED states.

### 8.3 Wallet and payouts
- `WalletService.balance(providerId) = SUM(ledger_entries.amount_kobo WHERE provider_id=… AND type IN (PROVIDER_EARNING, PAYOUT, ADJUSTMENT))`.
- Provider sets bank account; requests payout ≤ available balance (reject if a payout is already `REQUESTED`).
- Admin (FINANCE or SUPER_ADMIN) approves → status `APPROVED`; after transferring manually via bank, marks `PAID` with bank transfer reference → creates `PAYOUT` ledger entry (negative). Reject returns no ledger change. All audited.

---

## 9. Location tracking

### 9.1 Provider app behaviour
| State | Interval | Notes |
|---|---|---|
| Offline | none | Background task stopped |
| Online / idle | every **30 s** or 100 m moved (whichever first) | Android foreground service with persistent notification "RoadAid: You're online" |
| Active job (ASSIGNED→IN_PROGRESS) | every **5 s** or 10 m | `accuracy: Location.Accuracy.High` |

- Use `expo-location` `startLocationUpdatesAsync` inside a task defined with `expo-task-manager` at module top level. Request foreground then background permission with a clear in-app rationale screen first. Handle "denied", "while using only" (show guidance to switch to "Always" / "Allow all the time"), and battery-optimisation guidance (Android: deep link to settings).
- Batch buffer: if the request fails, keep up to 200 points in memory/`expo-secure-store`/AsyncStorage and flush oldest-first when connectivity returns via `POST /provider/location/batch`.
- Each point: `{lat, lng, accuracy, heading, speed, recordedAt}`.

### 9.2 Backend
- `POST /provider/location` and `/batch`: auth PROVIDER; reject if `accuracy > 200` m (store but flag) or `recordedAt` more than 5 min in the past/ 1 min in the future of server time (use `received_at` for freshness logic). Upsert `provider_locations`. If the provider has an active request, also insert `provider_location_history` and emit `provider.location` to room `request:{id}` with `{lat,lng,heading,recordedAt,receivedAt}`.
- Rate-limit: max 1 req/s per provider.
- ETA to customer: recompute every 30 s during `EN_ROUTE` via Routes API (cache); emit `request.eta`.

### 9.3 Customer app display
- Marker moves smoothly between updates. If `now - receivedAt > 30 s` show "Last updated 1 min ago" chip and grey the marker; if > 120 s show "Provider connection lost — last seen at HH:MM" and keep showing the call button. **Never present stale coordinates as live.**

---

## 10. Authentication and security

- **Customer & provider login:** phone number → `POST /auth/otp/request` (rate-limit 3/10 min per phone, 10/hour per IP) → `POST /auth/otp/verify` returns `{accessToken, refreshToken, user, isNewUser}`. OTP hashed (bcrypt/argon2), 6 digits, 5-minute TTL, max 5 attempts. If `isNewUser`, app collects `fullName` via `POST /auth/profile`.
- **Admin login:** email + password (argon2id) → JWT. Bootstrap the first SUPER_ADMIN from env on first boot. Optional TOTP is out of scope.
- JWT access (15 min) + rotating refresh tokens (hashed in DB, revoke on reuse). Mobile stores tokens in `expo-secure-store`.
- RBAC via `@Roles()` + `@AdminRoles()` guards. **Every query on customer/provider-owned resources must filter by the authenticated user's id** (prevent IDOR). Write tests for this.
- Documents: stored privately; admin views via short-lived signed URLs (5 min). Never public.
- Validation: zod on every DTO; whitelist and reject unknown fields. Helmet, CORS allow-list, `@nestjs/throttler` global limits, request size limits (documents ≤ 8 MB; images/PDF only).
- Phone numbers normalised to E.164 (+234…). Mask phone numbers in logs.
- Customer ↔ provider contact: provider sees the customer's phone only while the request is active (ASSIGNED→IN_PROGRESS); customer sees provider phone likewise. After completion the API stops returning it.
- Audit logging for all admin mutations. Data retention: location history 30 days; configurable.
- Compliance note for `docs/HANDOVER.md`: NDPA (Nigeria Data Protection Act) considerations — consent screen for location and data collection, privacy policy link, data deletion request path (admin tool: anonymise user).

---

## 11. API (REST, prefix `/v1`, JSON, camelCase, errors `{code, message, details?}`)

### Auth
- `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/profile`
- `POST /admin/auth/login`

### Customer
- `GET /me`, `PATCH /me`
- `GET/POST/PATCH/DELETE /me/vehicles`
- `POST /quotes` `{serviceType, pickup:{lat,lng}, details}` → price breakdown
- `POST /requests` `{serviceType, pickup:{lat,lng,address,note}, vehicleId?, details, quoteId?/priceKobo}` → request (server recalculates; rejects if client price ≠ server price by > 0)
- `GET /requests` (history, paginated), `GET /requests/:id`
- `GET /requests/active`
- `POST /requests/:id/cancel` `{reason}`
- `POST /requests/:id/rating` `{rating, review}`
- `POST /requests/:id/dispute` `{reason}`
- `POST /payments/initialize`, `POST /payments/cash/collect`, `POST /payments/commission/initialize`, `GET /payments/:reference/status`
- `POST /devices` register push token

### Provider
- `PUT /provider/profile`, `GET /provider/profile`
- `POST /provider/services` apply `{serviceType, details}`; `GET /provider/services`
- `POST /provider/documents` (multipart), `GET /provider/documents`, `DELETE /provider/documents/:id` (only if not accepted)
- `POST /provider/submit` (DRAFT→SUBMITTED; validates required docs per service)
- `POST /provider/availability` `{state: ONLINE|OFFLINE|UNAVAILABLE}` — ONLINE requires APPROVED, fresh location (<60 s) and no active job
- `POST /provider/location`, `POST /provider/location/batch`
- `GET /provider/offers/current` (polling fallback; returns pending offer or null)
- `POST /provider/offers/:id/accept`, `POST /provider/offers/:id/decline` `{reason?}`
- `GET /provider/jobs/active`, `GET /provider/jobs` (history)
- `POST /provider/jobs/:id/status` `{status: EN_ROUTE|ARRIVED|IN_PROGRESS|COMPLETED}` — validated transitions; `IN_PROGRESS` blocked until paid in ONLINE_AFTER_ACCEPT mode
- `POST /provider/jobs/:id/cancel` `{reason}`
- `GET /provider/earnings` (summary + entries), `GET /provider/wallet`
- `PUT /provider/bank-account`, `POST /provider/payouts`, `GET /provider/payouts`
- `POST /devices`

### Admin (all audited)
- `GET /admin/dashboard` (KPIs: requests today, active jobs, avg time-to-accept, completion rate, online providers, escalated count, revenue today)
- `GET /admin/requests?status=&service=&from=&to=&q=` `GET /admin/requests/:id` (with events timeline, offers, payments)
- `POST /admin/requests/:id/redispatch`, `/assign` `{providerId}`, `/cancel`, `/mark-paid`, `/refund`
- `GET /admin/providers?status=&service=` `GET /admin/providers/:id` (docs via signed URLs)
- `POST /admin/providers/:id/services/:serviceType/approve|reject|suspend`
- `POST /admin/providers/:id/approve|reject|suspend|reinstate`
- `POST /admin/documents/:id/accept|reject`
- `GET /admin/customers`, `GET /admin/customers/:id`
- `GET/PUT /admin/settings/pricing`, `/dispatch`, `/commission`, `/cancellation`
- `GET /admin/payments`, `GET /admin/payouts`, `POST /admin/payouts/:id/approve|reject|mark-paid`
- `GET /admin/reports/requests|revenue|providers|payouts?from=&to=&format=json|csv`
- `GET /admin/live` (snapshot for map: online providers with last location, active requests)
- `GET /admin/audit-logs`
- `GET/POST /admin/users` (create admins; SUPER_ADMIN only)

### Webhooks & health
- `POST /webhooks/paystack` · `GET /health` · `GET /ready`

### Socket.IO (namespace `/`, auth via `auth: {token}` JWT)
Rooms: `user:{id}`, `request:{id}`, `admin`.
Server → client events:
- `offer.new` {offer, request summary, expiresAt, serverNow} → provider
- `offer.expired` / `offer.cancelled` {offerId} → provider
- `request.updated` {request} → customer, assigned provider, admin
- `provider.location` {requestId, lat, lng, heading, recordedAt, receivedAt} → customer (room `request:{id}`), admin
- `request.eta` {requestId, etaSeconds} → customer
- `admin.alert` {type, requestId, message} → admin
- `provider.availability` {providerId, state} → admin
Clients must **resync via REST on every reconnect and on app foreground** (fetch `/requests/active` or `/provider/jobs/active` + `/provider/offers/current`).

---

## 12. Applications

### 12.1 Customer mode (`apps/provider-mobile`)
Screens: Splash → Welcome/Consent (location + privacy) → Phone entry → OTP → Name (new users) → **Home** (map with current location + service selector cards: Fuel / Towing / Lockout) → **Service details** (fuel type + litres | towing destination with Places autocomplete | lockout type; vehicle select/add; pickup pin adjust + note) → **Price summary + Confirm** → **Searching** (animated, cancel button, shows "Finding the best provider…") → **Provider assigned** (card: name, photo, rating, vehicle, plate, ETA, call button, live map; status steps) → **Pay** (if due) → **In progress** → **Completed** (receipt, rate provider, report problem) → History list/detail → Profile/Vehicles → Help/Contact.
- Customer-facing responder terminology and visuals are service-specific: FUEL = dispatch rider/motorcycle; TOWING = tow operator/tow truck; LOCKOUT = roadside technician/tools. The secure backend role remains `PROVIDER` for all three.
- The assigned-request screen uses a status-progress strip, ETA, responder identity and call action, and a live map with customer pickup and responder markers. It must distinguish live, delayed and disconnected location states.
- Handle: no provider found ("Our team has been alerted"), payment failed/retry, offline banner, location permission denied (manual address entry fallback), app killed/reopened (restore active request).
- Push categories: provider assigned, provider arrived, job completed, payment needed, request escalated.

### 12.2 Provider mode (`apps/provider-mobile`)

The mobile app uses asymmetric role access: `CUSTOMER` accounts can use Customer mode only; `PROVIDER` accounts can switch between Customer and Provider modes. A customer account cannot self-promote after registration. A newly created account may choose provider registration during its first authenticated onboarding flow.
Screens: Splash → Phone/OTP → **Onboarding wizard** (profile → select services → service-specific details → document upload with camera/gallery → review & submit) → **Pending approval** screen (per-service status, rejection reasons, re-upload) → **Home** (big Online/Offline toggle, Pause toggle, today's earnings, status chip) → **Incoming offer** (full-screen modal over home with countdown ring driven by server `expiresAt` minus clock offset, pickup address, distance, ETA, service details, estimated earnings, Accept/Decline; must also open from a high-priority push when app is backgrounded) → **Active job** (map, "Navigate" opens Google Maps intent with destination, customer name/call button, status buttons: Start trip → Arrived → Start service → Complete; Cancel with reason) → Earnings (daily/weekly, entries) → Wallet & payouts (bank account, request payout, history) → Job history → Profile/Documents.
- Offer sound + vibration; Android notification channel `offers` with `importance=MAX`.
- Handle: location permission wizard, battery optimisation guidance, offline banner, being forced offline when stale, unapproved/suspended states, resync on foreground.
- Build via EAS dev client; configure Android foreground service and iOS `UIBackgroundModes: ["location","remote-notification"]` with usage strings.

### 12.3 Admin dashboard (`apps/admin-web`, route `/admin`)
Pages: Login · **Dashboard** (KPI cards, live map of online providers + active requests, alerts panel) · **Requests** (table, filters, row → detail with timeline, offers sequence, payment, map, actions: re-dispatch / assign / cancel / mark paid / refund) · **Providers** (table with status chips; detail with documents viewer, per-service approve/reject with reason, suspend/reinstate, stats, cancellation count) · **Customers** · **Pricing & Commission** · **Dispatch Settings** (per service timers/radius/max offers/stale threshold) · **Payments** · **Payouts** (queue with approve/reject/mark paid) · **Reports** (date range, CSV export) · **Audit Log** · **Admin Users**.
- Real-time updates via Socket.IO; audible/visual alert for `admin.alert`.
- Role-gated menus (FINANCE sees payments/payouts/reports; OPERATIONS sees requests/providers; SUPER_ADMIN all).

### 12.4 Public website (`apps/admin-web`, route `/`)
The public RoadAid website introduces the Abuja roadside-assistance service without exposing customer or provider web-app functionality. It must clearly present the three supported services (fuel delivery, towing and vehicle lockout), explain the request → sequential match → live tracking journey, direct customers to the unified mobile app, and invite qualified providers to register in the app. The `/admin` route remains available to authorised staff but is intentionally not linked or advertised on the public website.

- Brand: RoadAid, “BUILT FOR CERTAINTY”, using the established shield/road mark and charcoal, warm-white and amber identity.
- Claims must be grounded in implemented product behavior; do not invent testimonials, service volumes, response-time guarantees, coverage beyond Abuja or store availability.
- Responsive and accessible across mobile and desktop, including keyboard focus, reduced-motion behavior, semantic headings and WCAG AA contrast.
- Public routes remain informational only. Customers and providers still transact exclusively through the native mobile app.

---

## 13. Notifications
- `NotificationsService.send(userId, {title, body, data, channel, priority})` writes a `notifications` row, emits socket event, and sends FCM push to all of the user's device tokens. Remove tokens on `UNREGISTERED` responses.
- Provider offers use FCM **data message with high priority** plus a notification, so the device wakes.
- Customer SMS only for OTP. No marketing messages.

---

## 14. Testing requirements (definition of done)

**Unit/integration (Jest + Testcontainers):**
1. Auth: OTP rate limit, expiry, attempts, refresh rotation/reuse detection.
2. RBAC/IDOR: customer cannot read another customer's request; customer/provider cannot call admin routes; provider cannot read other providers' jobs.
3. Provider approval: unapproved provider or unapproved service never appears in candidates; wrong-service provider excluded (fuel-only never gets towing).
4. Pricing: each service formula, min price, towing free km, kobo integer math, price lock.
5. **Dispatch suite:**
   - nearest/ETA-ranked provider offered first; ETA API failure falls back to distance;
   - stale location excluded; offline/unavailable/busy/reserved excluded;
   - decline → next provider; expiry → next provider; exhaustion → ESCALATED + admin alert;
   - same provider never re-offered same request (until admin re-dispatch round);
   - provider with pending offer receives no second offer;
   - **concurrency:** 2 providers accept simultaneously → exactly one succeeds; same provider accepts two different requests concurrently → one succeeds; **load test: 50 simultaneous requests, 20 online providers → zero provider with >1 active job, zero request with >1 provider** (assert via SQL after run);
   - expiry job lost (delete from Redis) → sweeper recovers within 30 s;
   - provider cancels after accept → request returns to SEARCHING excluding that provider;
   - customer cancels during pending offer → offer cancelled, provider released;
   - completing a job makes provider `ONLINE` and eligible again only after a fresh location update.
6. State machine: every illegal transition rejected; every transition writes an event.
7. Payments: valid signature accepted; invalid rejected; duplicate webhook processed once; amount mismatch rejected; failed payment doesn't mark paid; commission/earning arithmetic (including rounding) reconciles to the kobo; refund and payout ledger entries; wallet balance equals ledger sum; payout > balance rejected.
8. Location: batch ingest ordering, stale-point handling, history only while job active, customer receives `provider.location` only for their own request.
9. Documents: type/size validation; admin-only signed URLs.

**E2E script** (`pnpm e2e:journey`): seeds 1 admin, 3 providers (fuel, towing, lockout capabilities) and 1 customer; simulates the full journey for each service using HTTP + socket clients; prints PASS/FAIL per step. Use it as the demo and UAT dry-run.

**Manual device test checklist** (`docs/DEVICE_TESTS.md`): provider moves along a route while the customer watches; phone locked; network toggled; permission denied; battery saver on; app killed and reopened; push while locked.

**Coverage target:** ≥ 80% for `dispatch`, `payments`, `wallet`, `requests` modules.

---

## 15. Build order (phases with acceptance gates)

Dates assume build starts **9 Nov 2026** with feature freeze **30 Nov 2026**. Adjust only by cutting scope, never by cutting tests.

### Phase 0 — Foundation (9–11 Nov)
Monorepo, docker-compose (Postgres+PostGIS, Redis), NestJS skeleton with config validation, Prisma schema + hand-written SQL migration (Section 5.3), seed script, Socket gateway skeleton, shared package, CI pipeline, unified Expo app and Next.js app boot, `/health`.
**Gate:** `docker compose up` + `pnpm dev` runs all apps; migrations apply cleanly; CI green.

### Phase 1 — Identity, onboarding, admin approvals (12–15 Nov)
Auth (OTP, refresh, admin login), users, device tokens, provider onboarding wizard + document upload + submit, admin provider review (per-service approve/reject), customer profile + vehicles, audit logging, RBAC tests.
**Gate:** a real provider registers on a phone, uploads documents, admin approves fuel but rejects towing, provider app reflects it. Unapproved cannot go online.

### Phase 2 — Requests and pricing (16–18 Nov)
Pricing rules + admin editor, quote endpoint, Places autocomplete, customer app request flow for all 3 services, request creation, history, admin request list/detail, state service and event timeline.
**Gate:** customer creates fuel, towing and lockout requests with correct locked prices; admin sees them.

### Phase 3 — Dispatch (19–23 Nov) ← critical
Provider availability + location ingestion, dispatch engine (Sections 6–7), offers, BullMQ processors, sweeper, accept/decline, provider offer UI with countdown + push, customer searching/assigned UI, status updates, cancellations, escalation + admin alerts + manual assign/re-dispatch.
**Gate (Week-of-23-Nov demo, non-negotiable):** on two physical phones plus admin: customer requests → provider receives offer (also when app backgrounded) → declines → second provider receives → accepts → customer sees assigned provider. Dispatch test suite (Section 14.5) passes, including the 50×20 concurrency run.

### Phase 4 — Tracking, payments, wallet, reports (24–28 Nov)
Live tracking (foreground+background), ETA, stale indicators, Paystack init/webhook/verify, payment screens, ledger, commissions, provider earnings, wallet, payout requests + admin approval, admin live map, dashboard KPIs, reports + CSV, notifications polish, dispute flag + rating.
**Gate:** complete paid journey for each service with correct ledger; webhook replay test passes; tracking verified on device, including locked-phone and offline scenarios.

### Phase 5 — Freeze and hardening (29–30 Nov)
Bug fixes only. Security review (IDOR, rate limits, secrets), performance pass, `docs/` complete. **Feature freeze at end of 30 Nov.**

### December (no new features)
- 1–7 Dec: stable EAS builds (Android AAB/APK, iOS TestFlight), Android closed testing / TestFlight start, load + security tests, device matrix tests.
- 8–14 Dec: client UAT using the UAT checklist; production deployment; backup/restore + rollback drill.
- 15–18 Dec: store listings, privacy policy URL, screenshots, review notes, demo accounts (customer, provider, admin) → **submit** the unified mobile app.
- 19–31 Dec: respond to store feedback, fix defects, admin training, handover pack.

---

## 16. Deployment and operations

- Dockerfiles for `api` and `admin-web`; `docker-compose.prod.yml` with Caddy (auto-HTTPS) → api, admin; managed or containerised Postgres/PostGIS and Redis (enable Redis AOF persistence). Run `prisma migrate deploy` on release.
- Background worker runs inside the API process for MVP (BullMQ workers + cron); structure code so workers can be split later.
- Nightly `pg_dump` to S3-compatible storage, 14-day retention; `restore.sh` tested.
- Sentry for API, admin and the unified mobile app; structured logs with request ids; alerts on 5xx rate and queue depth.
- Rollback: tag images; `docs/RUNBOOK.md` explains deploy, rollback, restore, rotating secrets, and "dispatch stuck" troubleshooting.
- Seed script creates the bootstrap super admin; no default passwords in production.
- All accounts (cloud, Google Maps, Paystack, FCM, SMS, Apple, Google Play) are registered in the **client's** name; document ownership in `docs/HANDOVER.md`.

---

## 17. Documentation deliverables (agent writes these)
`README.md` (setup in ≤ 10 minutes) · `docs/API.md` (generated from Swagger `/docs`) · `docs/DECISIONS.md` · `docs/RUNBOOK.md` · `docs/ADMIN_GUIDE.md` (non-technical, screenshots later) · `docs/DEVICE_TESTS.md` · `docs/HANDOVER.md` (accounts, keys, env vars, costs, store submission steps, known limitations) · `docs/PROGRESS.md`.

---

## 18. Known limitations to document honestly (do not hide)
- Background location can be restricted by Android/iOS battery management; the provider app guides users through settings, and customers see "last updated" rather than stale positions.
- Push delivery is not guaranteed; offers are also fetched by polling/resync and expire server-side.
- ETA depends on Google Routes availability; fallback uses straight-line distance and a fixed average speed.
- Payouts are manual; refunds are manual.
- Store approval timing is outside the developer's control.

---

## 19. Defaults and assumptions to record in `docs/DECISIONS.md` on day one
1. Payment timing: customer choice of in-app payment after provider acceptance or cash to the provider after arrival; both must be confirmed before service starts.
2. Cancellation fee: ₦0 until the client sets a policy.
3. Placeholder prices (Section 8.1) until the client supplies real ones.
4. Commission 15% (1500 bps) placeholder.
5. Supported devices: Android 10+, iOS 16+.
6. Gateway: Paystack.
7. Offer timers: Fuel 30 s, Towing 45 s, Lockout 30 s; radius 15 km; max 5 offers; stale location 90 s.
8. Expected scale: 20–30 providers, 20–50 requests/day (single API instance is sufficient).
9. One admin organisation, one city (Abuja); city field is not modelled.

---

## 20. Kickoff and phase prompts (paste these into your coding agent)

**Kickoff prompt**
> You are the lead engineer building RoadAid. Read `SPEC.md` fully, then `docs/DECISIONS.md`. Follow Section 0 rules strictly. Start Phase 0. Before writing code, output a short plan (files you will create, commands you will run, tests you will write). Then implement, run lint/typecheck/tests, and finish by updating `docs/PROGRESS.md` and reporting: what works, how to run it, test results, and anything you could not complete. Do not start Phase 1 until I say "gate passed".

**Per-phase prompt template**
> Implement Phase N from `SPEC.md` Section 15 as vertical slices. For each slice: DB changes → API → real-time → UI → tests. Do not add features outside the spec. At the end, run the full test suite and report against the phase gate checklist line by line (PASS/FAIL with evidence).

**Dispatch prompt (Phase 3)**
> Implement Section 7 exactly as written, including the transaction boundaries, `FOR UPDATE` / `SKIP LOCKED` usage, the three partial unique indexes, the BullMQ expiry jobs with idempotent jobIds, and the sweeper. Then write the full dispatch test suite in Section 14.5, including the 50-request/20-provider concurrency test, and show me the SQL assertions that prove there are no double assignments. If any test is flaky, fix the root cause; do not loosen the test.

**Review prompt (end of each phase)**
> Act as a skeptical reviewer. Audit this phase against SPEC.md for: missing requirements, IDOR/authorization gaps, race conditions, money-handling errors (floats, rounding), unhandled offline/error states in the mobile apps, and missing tests. List findings by severity and fix all critical and high issues.

---

## 21. Traceability: client requirement → spec section

| Client requirement | Where |
|---|---|
| Fuel, towing, lockout requests with location sharing and updates | §5, §6, §12.1, §11 |
| Provider registration, verification, approval | §5 (provider_services/documents), §12.2, §12.3, Phase 1 |
| Providers only receive jobs they're authorised for | §7.2 query, §14.3 |
| Automatic dispatch: eligible → best match → timed offer → next → confirm → alert admin | §7 |
| Configurable response timers | §5 dispatch_settings, §12.3 |
| Prevent duplicate/conflicting assignments; handle cancellations, delays, unavailability | §5.3 indexes, §6, §7.4–7.6 |
| One active job per provider | §5.3, §6.2, §7.4 |
| Uber/Bolt-style: live tracking after acceptance, ETA, call provider | §9, §12.1 |
| Last-update time when connection lost | §9.3 |
| Admin: approve, monitor, configure dispatch, intervene, payments & reports | §11 admin, §12.3 |
| Transaction records, payouts, commissions, reporting | §8, §5 ledger/payout |
| Android and iOS apps, admin web | §2, §12, §15 Dec |
| Handover by 31 Dec 2026, testing, documentation | §14, §15, §16, §17 |
