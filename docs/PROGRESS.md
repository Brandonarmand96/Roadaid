# ROADAID — BUILD PROGRESS TRACKER

## Test deployment branch — 21 Nov 2026

- Created the isolated `test` branch for card-free online UAT; `master` remains unchanged.
- Added a Google/Mapbox server provider switch while preserving the current maps API contract and straight-line fallback.
- Replaced Google-specific mobile/admin test rendering with MapLibre and added private Supabase document storage.
- Added a Render Blueprint backed by Supabase PostGIS and Upstash Redis, with migrations applied before API startup.
- Restricted hosted test CORS, disabled Swagger outside local development, and documented provisioning, EAS builds, acceptance testing and cleanup in `docs/TEST_DEPLOYMENT.md`.
- Verification: workspace typecheck PASS; workspace lint PASS with no warnings; API tests PASS (96/96) and shared tests PASS (4/4); API/admin production builds PASS. Physical MapLibre rendering, EAS native compilation and the three-surface online journey remain required after the external test accounts are provisioned.
- Render Docker hotfix: copy the lockfile, install frozen dependencies, install OpenSSL, and generate Prisma Client before Nest compilation. A clean Linux `docker build -f infrastructure/docker/Dockerfile.api .` now passes without missing Prisma enums/`Decimal` or OpenSSL detection warnings.
- Render startup hotfix: copy the API workspace `node_modules` links into the final pnpm image and invoke the workspace Prisma binary. Verified inside the final Linux image that Prisma 5.22 uses `linux-musl-openssl-3.0.x`, exports `RequestStatus` and `Prisma.Decimal`, and that the real container `CMD` reaches `prisma migrate deploy` (an intentionally unreachable database produced the expected `P1001`, not a missing executable).
- Corrected the Supabase/Render network instructions: the free direct database hostname is IPv6-only, so the IPv4 Render service must use the dashboard-provided shared **Session pooler** URI on port 5432 with the `postgres.<project-ref>` username. Database credentials exposed in logs/chat must be rotated before redeploying.

## Phase 0: Foundation (COMPLETED)
**Status:** Gate Passed / Ready for Phase 1  
**Date:** 13 Nov 2026 (Timeline baseline: 9–11 Nov 2026)

---

### 1. What Was Built
1. **Repository & Tooling Foundation:**
   - Strict TypeScript monorepo using pnpm workspaces (`pnpm@12.18.0`) + Turborepo.
   - Root configuration (`turbo.json`, `pnpm-workspace.yaml`, `.gitignore`, `.env.example`, `README.md`).
   - Project specifications and operational guidance (`SPEC.md`, `AGENTS.md`, `CLAUDE.md`).
   - Architecture & decision registers (`docs/DECISIONS.md`, `docs/decisions/OPEN_DECISIONS.md`, `docs/architecture/ARCHITECTURE.md`, `docs/plan/IMPLEMENTATION_BACKLOG.md`, `docs/plan/RISK_REGISTER.md`).

2. **Shared Package (`packages/shared`):**
   - Domain enums (`Role`, `AdminRole`, `UserStatus`, `ServiceType`, `ApprovalStatus`, `OnboardingStatus`, `ProviderAvailability`, `RequestStatus`, `OfferStatus`, `PaymentStatus`, `CancelledBy`, `PayoutStatus`, `LedgerEntryType`, `VehicleType`, `DocumentType`, `LockType`, `FuelType`).
   - Domain constants (default pricing in integer kobo, dispatch timeout/radius rules, commission basis points, Abuja coordinates).
   - Zod validation schemas and TypeScript DTOs.
   - Comprehensive schema unit test suite.

3. **Backend API (`apps/api`):**
   - NestJS modular monolith with strict environment validation via Zod (`src/config/env.config.ts`).
   - Prisma schema (`prisma/schema.prisma`) mapping all domain tables with snake_case database columns and UUID primary keys.
   - Hand-written SQL migration (`prisma/migrations/20261109000000_init/migration.sql`) implementing PostGIS geometry/geography columns and mandatory database constraints (from SPEC §5.3):
     - `uq_provider_one_active_request`: at most ONE active request per provider.
     - `uq_request_one_pending_offer`: at most ONE pending offer per request.
     - `uq_provider_one_pending_offer`: at most ONE pending offer per provider.
     - Spatial GIST index `idx_provider_locations_gist`.
     - Request status index `idx_requests_status`.
     - Offer expiry index `idx_offers_expiry`.
   - Seed script (`prisma/seed.ts`) seeding bootstrap Super Admin, default pricing rules, dispatch settings, and commission settings.
   - Global HTTP exception filter with standardized error envelope `{ code, message, details?, path, timestamp }`.
   - Global Zod validation pipe.
   - Global REST prefix `/v1` with Swagger/OpenAPI documentation at `/docs`.
   - Health and readiness endpoints (`GET /v1/health` and `GET /v1/ready`).
   - Realtime Gateway skeleton (`src/realtime/realtime.gateway.ts`) using Socket.IO with JWT authentication handshake and rooms (`user:{id}`, `request:{id}`, `admin`).

4. **Frontends:**
   - **Admin Web (`apps/admin-web`):** Next.js 14 App Router, Tailwind CSS, TypeScript, layout with RoadAid branding, live system indicators, production static build verified.
   - **Customer Mobile (`apps/customer-mobile`):** Expo React Native app shell configured for Android/iOS with location permissions and shared domain branding.
   - **Provider Mobile (`apps/provider-mobile`):** Expo React Native app shell configured for Android/iOS with background location permissions, foreground service, and notifications.

5. **Infrastructure & CI/CD:**
   - `infrastructure/docker-compose.yml`: PostgreSQL 16 + PostGIS (`postgis/postgis:16-3.4`) and Redis 7 (`redis:7-alpine`).
   - `infrastructure/docker-compose.prod.yml`: Production compose configuration.
   - `infrastructure/docker/Dockerfile.api` & `Dockerfile.admin`: Multi-stage production container builds.
   - `infrastructure/scripts/backup.sh` & `restore.sh`: Tested automated backup and restore scripts.
   - `.github/workflows/ci.yml`: GitHub Actions pipeline running lint, typecheck, migrations, seed, tests, and build.

---

### 2. How to Run It

1. **Prerequisites:**
   - Node.js >= 20 (`node -v`)
   - pnpm 12 (`npm install -g pnpm`)
   - Docker Desktop running

2. **Start Database & Redis:**
   ```bash
   docker compose up -d
   ```

3. **Install & Build:**
   ```bash
   pnpm install
   pnpm --filter @roadaid/shared build
   pnpm --filter api prisma:generate
   ```

4. **Run Migrations & Seed:**
   ```bash
   pnpm --filter api db:migrate
   pnpm --filter api db:seed
   ```

5. **Run Applications in Development:**
   ```bash
   pnpm dev
   ```
   - API: http://localhost:3000
   - Swagger Docs: http://localhost:3000/docs
   - Health: http://localhost:3000/v1/health
   - Admin Web: http://localhost:3001
   - Customer App: Expo bundler
   - Provider App: Expo bundler

---

### 3. Test Results

- **Shared Package:** `pnpm --filter @roadaid/shared test` (4 passed, 4 total)
- **API Unit Tests:** `pnpm --filter api test` (5 passed, 5 total):
  - `HealthController`: verifies `/health` (status: ok), `/ready` (connected database check), and degraded error handling.
  - `EnvConfig`: verifies strict Zod environment validation and minimum 32-character JWT secret enforcement.
- **Typecheck:** `pnpm typecheck` (6 passed, 6 total across all packages and apps with 0 errors).
- **Production Builds:**
  - `pnpm --filter api build`: successfully compiled with Nest CLI.
  - `pnpm --filter admin-web build`: successfully generated static and optimized pages.

---

### 4. Known Gaps / Next Phase Requirements
- Docker Desktop daemon needs to be running on the host machine to execute containerized Postgres and Redis locally (`docker compose up -d`).
- Next phase: **Phase 1 — Identity, onboarding, admin approvals (12–15 Nov)**:
  - Phone OTP request & verification with SMS provider abstraction (Console / Termii).
  - Admin login with Argon2id password hashing.
  - Customer vehicle management.
  - Provider onboarding wizard, service registration, document uploads with signed URLs, and admin approval workflows.

---

## Phase 0 Review — 13 Nov 2026

**Result:** Gate passed, including live PostGIS migration and seed verification.

- Repaired the missing workspace ESLint toolchain and shared configuration.
- `pnpm lint`: PASS (no errors).
- `pnpm typecheck`: PASS (6/6 workspaces).
- `pnpm test`: PASS (29/29 tests across API and shared packages).
- `pnpm build`: PASS (API and admin production builds).
- `docker compose config --quiet`: PASS; Docker engine and Redis image: PASS.
- PostGIS 3.4 verified; initial migration applied cleanly and seed completed.
- Mandatory one-active-job and one-pending-offer indexes verified directly in PostgreSQL.
- Seed verified: 3 pricing rules, 3 dispatch settings, 3 commission settings and 1 bootstrap admin.

---

## Phase 1: Identity, Onboarding & Admin Approvals

**Status:** Gate passed on physical device
**Date:** 13 Nov 2026

### What Was Built

- OTP auth with rate limiting, expiry, attempt limits, cryptographic production codes and atomic one-time consumption.
- Rotating refresh tokens with reuse detection, Argon2 admin login, device tokens and active-account enforcement.
- Customer profile and ownership-protected vehicle CRUD.
- Provider profile, service applications, document upload/delete, submission and guarded availability.
- Provider mobile flow: OTP, vehicle profile, service selection, document upload, review, submission and review outcomes.
- Admin provider queue/detail with profile, service and document decisions, signed previews and audited mutations.

### Verification

- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS (6/6 workspaces).
- `pnpm test`: PASS (29/29 tests).
- `pnpm build`: PASS.
- Impeccable static UI detector: PASS after resolving all findings.

### Acceptance Gate Evidence — Passed 14 Nov 2026

- On a physical provider phone: register, upload documents and submit.
- In admin: approve FUEL and reject TOWING with a reason.
- Confirm the provider phone displays both decisions and cannot go online without an approved service and fresh location.

The user confirmed the complete physical provider/admin journey, including per-service approve/reject decisions and provider-side reflection. Phase 2 is authorized.

### Mobile Compatibility Update — 14 Nov 2026

- Upgraded provider and customer apps from Expo SDK 52 to SDK 58 (React Native 0.88 / React 19.3).
- Aligned all Expo native modules with `expo install --fix`.
- Expo Doctor: 20/20 checks passed for both mobile apps.
- Removed obsolete SDK 52 app-config fields and missing placeholder asset references.
- Updated removed React Native 0.88 `StatusBar` usage.
- Provider Metro bundler starts successfully on port 8081.
- Full repository typecheck and 29/29 tests pass after the upgrade.

### Phase 1 Device-Test Fix — 14 Nov 2026

- Fixed Prisma `BigInt` response serialization encountered while saving a provider profile.
- Added a global exact-integer JSON serializer for all kobo-valued API responses.
- Unsafe values above JavaScript's exact integer range fail explicitly instead of losing money precision.
- Added three regression tests; API suite passes 28/28 tests.
- Replaced the obsolete React Native pseudo-file multipart upload with SDK 58 `File` + `expo/fetch`.
- Provider mobile lint/typecheck and Expo Doctor (20/20) pass after the upload fix.

### Phase 1 Device-Test Hardening — 14 Nov 2026

- Replaced transient Android document-picker URIs with SDK 58 `File.pickFileAsync` file handles so selected documents retain readable native permissions during upload.
- Added an 8 MB client-side upload check and API multipart limits before files are buffered.
- Added server-side JPEG, PNG, WEBP and PDF signature validation instead of trusting the submitted MIME type.
- Persisted rotating refresh tokens securely and added one-time automatic session refresh for expired access tokens.
- Added a 15-second mobile request timeout with cancellation and clear network errors.
- Made local storage writes, reads and deletes asynchronous, confined storage paths to the upload root and used constant-time signed-URL token comparison.
- Added `PUBLIC_API_URL` so signed document URLs are no longer tied to localhost.
- Full workspace verification: lint PASS, typecheck PASS, tests PASS (30/30), and provider Expo Doctor PASS (20/20), including upload-signature regressions.
- Normalized mobile and admin API base URLs to include the backend `/v1` prefix, preventing `Cannot POST /auth/otp/request` when an environment URL supplies only the host and port.
- Fixed admin document previews/downloads by signing MIME and filename metadata, returning explicit safe response headers, and inferring an extension when a mobile picker supplies no filename extension. Existing uploaded documents receive the correct format through their stored MIME metadata.

---

## Phase 2: Requests and Pricing

**Status:** Gate passed on physical device and admin dashboard
**Started:** 14 Nov 2026

### Backend slices completed

- Quote endpoint for FUEL, TOWING and LOCKOUT with server-owned pricing rules and integer-kobo arithmetic.
- Cross-field validation prevents service types from being paired with the wrong details payload.
- Towing distance fallback uses integer metres; money is rounded in kobo without floating-point monetary calculations.
- Customer request creation recalculates and locks the price server-side, verifies vehicle ownership, stores the PostGIS pickup point and appends the `CREATED` event transactionally.
- Ownership-protected customer request history/detail endpoints.
- Central request state-transition service with row locking, transition-table enforcement, event logging and realtime emission.
- Audited admin pricing-rule endpoints plus admin request queue/detail/event timeline endpoints.
- Phase 2 pricing regression tests added; API suite passes 33/33 tests.

### Interfaces completed

- Customer mobile OTP, service selection, service-specific details, GPS pickup capture, quote confirmation, request submission and history for all three services.
- Admin dashboard pricing controls, request queue, locked-price display and request event timeline in `Africa/Lagos` time.
- Impeccable guidance extended the established RoadAid design language with explicit loading, error, empty and confirmation states.

### Verification

- Full workspace lint and typecheck: PASS.
- API/shared tests: PASS (37 total: API 33, shared 4).
- API and admin production builds: PASS.
- Live journey: PASS for FUEL, TOWING and LOCKOUT with 18 realtime updates and exact integer-kobo commission/earning reconciliation.
- Live PostGIS/API gate data:
  - FUEL quote and locked price: 1,050,000 kobo (`RA-20261114-C6A885`).
  - TOWING quote and locked price: 2,006,850 kobo (`RA-20261114-8DDBD7`).
  - LOCKOUT quote and locked price: 800,000 kobo (`RA-20261114-8985F2`).
  - All three were stored as `REQUESTED` with matching quote and locked prices.

### Acceptance Gate Evidence — Passed 14 Nov 2026

- Physical customer flow produced FUEL, TOWING and LOCKOUT requests with locked prices.
- Admin dashboard screenshot confirmed all three service types in the request queue with their locked prices and `REQUESTED` status.
- Selected request displayed its append-only `CREATED · CUSTOMER` event in the Lagos-time timeline.
- Pricing controls displayed the active integer-kobo rules for all three services.

Phase 3 dispatch is now authorized.

---

## Phase 3: Dispatch

**Status:** Gate passed on physical devices
**Started:** 14 Nov 2026

### Slice 1 — Location and transactional offers

- Provider location endpoint validates device timestamps and upserts the latest PostGIS geography point with server receipt time.
- Location history is written only while a provider has an active request.
- New customer requests transition from `REQUESTED` to `SEARCHING` and enqueue an idempotent BullMQ dispatch job.
- Candidate selection enforces approved provider/service/account, online state, no active request, fresh location, radius, prior-offer exclusion and `FOR UPDATE OF pp SKIP LOCKED`.
- ETA falls back to distance at approximately 30 km/h and uses deterministic distance/workload tie-breaking.
- Only one provider is reserved; the database partial indexes remain the last defense against conflicting offers and assignments.
- Delayed expiry jobs, a 15-second sweeper, orphaned reservation recovery and stalled-search recovery are active.
- Provider accept and decline paths use row locks; acceptance atomically sets the request `ASSIGNED` and provider `BUSY/current_request_id`.
- Provider phone can publish GPS, go online, poll/resync pending offers every five seconds and accept or decline.

### Verification so far

- API and provider mobile typecheck: PASS.
- Existing API regression suite: PASS (33/33).

### Slice 1 remaining-work snapshot

- Provider job status progression and customer/provider cancellation recovery.
- Customer searching/assigned UI, realtime resync and provider contact details.
- Push notification delivery and background offer handling.
- Admin escalation, re-dispatch, manual assignment and cancellation controls.
- Dispatch settings editor and full sweeper/offline behavior.
- Mandatory dispatch authorization, expiry, fallback and 50-request/20-provider concurrency tests.

### Slice 2 — Lifecycle, intervention and concurrency — 14 Nov 2026

- Central request state service now owns provider job progression and releases the provider atomically on completion or cancellation.
- Customer cancellation cancels pending offers, releases reserved/assigned providers and is blocked after arrival as specified.
- Provider app now resyncs the active job and exposes `EN_ROUTE`, `ARRIVED`, `IN_PROGRESS` and `COMPLETED` progression controls.
- Customer app polls live request status, shows assigned provider name/phone and permits cancellation only during allowed states.
- Added dispatch rounds through migration `20261114090000_phase3_dispatch_round`; admin re-dispatch increments the round so previously declined providers can be reconsidered without violating offer uniqueness.
- Admin APIs and dashboard controls now support re-dispatch, eligible-provider discovery, atomic manual assignment and cancellation.
- State-machine/cancellation regression suite added; API suite passes 38/38.
- Added and executed the isolated live 50-request/20-provider concurrency harness with scoped cleanup.
- The first concurrency run exposed premature escalation when all eligible rows were briefly `SKIP LOCKED`; candidate selection now retries when eligible providers remain visible but locked.
- Final live result: 50 requests, 20 providers, 20 pending offers, 20 unique pending providers, zero duplicate-provider offers and zero duplicate-request offers.

### Remaining Phase 3 work

- Push notification delivery/background handling and customer socket integration.
- Provider cancellation-after-acceptance recovery and offline/stale-provider sweeper behavior.
- Admin dispatch settings editor and stronger manual-assignment UX.
- Complete offer expiry, authorization, IDOR, decline-fallback and assignment-race automated suites.
- Two-phone physical dispatch acceptance gate.

### Slice 3 — Recovery, notifications and offer security — 14 Nov 2026

- Provider cancellation after acceptance returns the request to `SEARCHING`, releases the provider and excludes them through the existing accepted offer in the current dispatch round.
- The sweeper now moves idle providers with locations older than 15 minutes to `OFFLINE`.
- Provider job routes now match the contract at `/provider/jobs/current`, `/:id/status` and `/:id/cancel`.
- Notifications persist in the database, emit over Socket.IO and attempt high-priority Expo delivery without affecting dispatch correctness when delivery fails.
- Provider EAS builds register an Android MAX-importance `offers` channel and push token when `EXPO_PUBLIC_EAS_PROJECT_ID` is configured; Expo Go retains five-second polling fallback.
- Added validated, audited admin dispatch-settings APIs for offer timeout, radius, maximum offers, shortlist size, location staleness and maximum search duration.
- Added offer ownership, expiry, accept and decline regression tests.
- Full verification: workspace lint PASS, typecheck PASS, API tests 43/43, shared tests 4/4, API build PASS and admin production build PASS.

### Gate blockers requiring device/account evidence

- Configure an Expo/EAS project ID and create a provider development build; remote push/background behavior cannot be validated in Expo Go.
- Run the two-provider-phone plus customer-phone fallback demo: first provider declines or times out, second provider accepts, customer sees assignment.

### Slice 4 — Realtime, configuration and build readiness — 14 Nov 2026

- Customer and provider apps now connect to Socket.IO for immediate resync while retaining five-second polling as the delivery-independent fallback.
- Request-room joins now enforce customer/provider ownership or admin role, closing the realtime IDOR path.
- Admin dashboard displays and edits validated dispatch timers, radius, maximum offers and freshness/search limits.
- Expo push responses remove device tokens reported as `DeviceNotRegistered`.
- Added `expo-dev-client`, the notifications config plugin and an internal Android APK development profile in `apps/provider-mobile/eas.json`.
- Added `docs/DEVICE_TESTS.md` with the complete multi-phone dispatch, background, timeout, cancellation, escalation and recovery matrix.
- Impeccable detector: PASS with no findings on the changed admin target.
- Provider Expo Doctor: PASS (20/20).
- API 43/43 tests, admin/provider/customer lint and typecheck: PASS.
- Expo authentication check: `Not logged in`; EAS project initialization and APK creation require the project owner's Expo login.

### Slice 5 — Automated gate hardening — 14 Nov 2026

- Prisma client regenerated successfully after the Phase 3 dispatch-round migration.
- Added automated expiry recovery, provider-cancellation recovery and admin re-dispatch round tests.
- Added Socket.IO request-room tests proving customer ownership enforcement, cross-customer denial and admin access.
- API suite now passes 49/49 tests across 10 suites.
- Live 50-request/20-provider concurrency harness rerun: 20 pending offers, 20 unique providers, zero duplicate-provider offers and zero duplicate-request offers.
- PostgreSQL catalog verification confirms all mandatory partial unique indexes:
  - `uq_provider_one_active_request`
  - `uq_provider_one_pending_offer`
  - `uq_request_one_pending_offer`
- PostGIS and Redis containers were restarted for live verification and remain available.

**Pre-gate evidence request:** Expo account login/project initialization, provider development APK, background push on a locked phone, and the physical customer + two-provider sequential fallback journey.

### Acceptance Gate — Passed 16 Nov 2026

- The user confirmed Phase 3 was tested and authorized the move to Phase 4.
- Phase 3's automated gate remains green: API dispatch/security/recovery tests and the isolated 50-request/20-provider concurrency run pass without duplicate provider or request assignments.

---

## Phase 4: Tracking, Payments, Wallet & Reports

**Status:** In progress
**Started:** 16 Nov 2026

### Slice 1 — Payment and wallet invariants

- Added the Paystack gateway abstraction and transaction initialization using exact integer-kobo amounts.
- Added raw-body HMAC-SHA512 webhook verification, Paystack server-side re-verification, currency/amount matching and replay-safe webhook event storage.
- Paid transactions atomically update the request and create customer-payment and platform-commission ledger entries.
- Provider earnings are credited exactly once when both completion and payment conditions are satisfied, supporting both configured payment modes.
- Provider progression to `IN_PROGRESS` is blocked until payment in `ONLINE_AFTER_ACCEPT` mode.
- Added ledger-derived wallet and earnings APIs, bank-account management and payout requests with row locking, one-pending-request enforcement and balance validation.
- Added batched provider location ingestion (up to 200 points), ordered oldest-first and validated point-by-point for offline recovery.

### Verification so far

- API lint: PASS (pre-existing warnings only).
- API typecheck: PASS.
- API tests: PASS (54/54 across 12 suites).
- New regressions cover invalid Paystack signatures, verified amount mismatch, exact-kobo commission/earning reconciliation, payout-over-balance rejection and payment-gated job progression.

### Remaining Phase 4 work

- Background provider tracking configuration, offline buffer persistence, ETA refresh and customer stale-location UI.
- Customer receipt polish and provider wallet/earnings/payout interfaces.
- Admin live-map, KPI, payment/payout and report dashboard surfaces (the backing APIs and CSV exports are complete).
- Full webhook replay, refund, payout ledger, tracking authorization and device acceptance suites, followed by the paid journey gate for all three services.

### Slice 2 — Finance operations, feedback and reporting — 16 Nov 2026

- Added audited FINANCE/SUPER_ADMIN controls for manual payment, refunds, payout approval/rejection and manual bank-transfer completion.
- Refunds and paid payouts lock their source rows and append exact negative integer-kobo ledger entries, preventing replay from double-writing financial state.
- Failed webhook processing now removes its idempotency reservation so Paystack can retry safely; successfully recorded event IDs still short-circuit replays.
- Added customer rating and dispute endpoints with ownership filtering, terminal-state rules, one-rating/one-dispute enforcement and append-only request events.
- Provider rating aggregates update transactionally with the completed request rating.
- Added admin dashboard KPIs, live provider/job snapshot, payment/payout queues and requests/revenue/providers/payouts reports in JSON or escaped CSV.
- Customer mobile now exposes payment, rating and dispute actions in the live request history; admin request detail exposes manual payment and refund actions.

### Slice 2 verification

- API typecheck: PASS.
- API tests: PASS (59/59 across 13 suites).
- Workspace lint and typecheck: PASS; lint reports seven pre-existing unused-import warnings and no errors.
- API and admin production builds: PASS.
- New coverage includes exact negative refund and payout ledger entries alongside the existing signature, amount and commission reconciliation tests.

### Slice 3 — Background tracking and provider wallet — 16 Nov 2026

- Registered the provider background location task at module scope for locked-phone execution in an EAS development/production build.
- Tracking switches between 30-second/100-metre idle updates and 5-second/10-metre active-job updates, with the Android foreground-service notification required by the platform.
- Added a persistent 200-point offline buffer, five-minute server-window pruning and oldest-first batch replay; only the newest replayed point is emitted as live to customers.
- Background tracking stops while the provider is offline and requires explicit foreground plus background permission before going online.
- Location uploads older than five minutes are now rejected server-side; points with accuracy worse than 200 metres are stored with a warning but excluded from dispatch eligibility.
- Added 30-second server-owned ETA refresh during `EN_ROUTE`, using the specified straight-line/fixed-speed fallback and realtime `request.eta` emission.
- Customer mobile now distinguishes live, delayed (>30 seconds) and connection-lost (>120 seconds) provider positions without presenting stale coordinates as current.
- Provider mobile now includes the ledger-derived available balance, recent earnings, bank-account form, payout request controls and payout history with pending-request protection.
- Impeccable hardening guidance shaped explicit permission, offline-buffer, empty-wallet, disabled-action and stale-location states; its detector reports no findings in the changed mobile screens.

### Slice 3 verification

- API tests: PASS (61/61 across 13 suites), including oldest-first batch replay and the 200-point boundary.
- Workspace lint: PASS with seven pre-existing warnings and no errors.
- Workspace typecheck: PASS (all six workspaces).
- Impeccable detector: PASS (no findings).

### Slice 4 — Admin live operations and finance workspace — 16 Nov 2026

- Added a role-aware admin workspace: OPERATIONS no longer requests forbidden finance resources, FINANCE no longer fails on provider-review resources, and SUPER_ADMIN retains the combined view.
- Added Lagos-day KPI reporting for requests, active/completed jobs, completion rate, online providers, escalations, collected revenue and average acceptance time.
- Added the specification-selected Google Maps React integration with online/busy provider markers, active-request pickup markers and a clear configuration fallback when the browser key is absent.
- Admin sockets now update provider positions in place and debounce broader refreshes for request, alert and availability changes.
- Added payment and payout queues with audited manual-payment, refund, approve/reject and bank-transfer completion controls exposed only to finance-capable roles.
- Added Lagos-time payout timestamps, explicit empty states and date-range CSV downloads for requests, revenue, providers and payouts.
- Hardened report date validation and aligned “today” calculations with `Africa/Lagos` rather than UTC midnight.
- Added the mandatory webhook replay regression: duplicate Paystack event IDs return success without a second gateway verification or ledger write.
- Impeccable guidance shaped responsive metric density, overflow handling, permission-aware surfaces, loading/empty/error states and keyboard-visible controls; the detector reports no findings.

### Slice 4 verification

- API tests: PASS (62/62 across 13 suites), including duplicate-webhook replay.
- Shared tests: PASS (4/4).
- Workspace typecheck: PASS (all six workspaces).
- Workspace lint: PASS; only the seven existing API unused-import warnings remain.
- API and admin production builds: PASS.
- Impeccable detector: PASS (no findings on the admin workspace).

### Slice 5 — Paid-journey gate, receipts and realtime money safety — 16 Nov 2026

- Replaced the broken `pnpm e2e:journey` target (which referenced a missing Jest configuration) with the specification-required HTTP + Socket.IO journey harness.
- The harness creates isolated customer/provider identities, approves one provider for each service, dispatches and accepts sequential offers, records payment, completes each job, observes realtime updates, verifies provider release and asserts exact ledger reconciliation before cleaning up its data.
- Added customer receipt details for completed requests: service, exact total, payment gateway/reference and Lagos-time completion timestamp.
- Customer-owned request responses now include only that customer’s payment receipt metadata.
- Added payment IDOR regressions proving customers cannot initialize or inspect payments belonging to another customer.
- Added the mandatory webhook replay regression and a realtime regression for exact-safe Prisma `BigInt` serialization.
- The live journey exposed Socket.IO attempting to serialize Prisma `BigInt` values during offer acceptance; realtime payload serialization is now centralized and uses the same exact-integer safety policy as REST responses.
- Impeccable hardening guidance shaped the receipt hierarchy and long-reference handling; its detector reports no findings.

### Slice 5 live gate evidence

- `pnpm e2e:journey`: PASS.
- FUEL: 1,050,000 kobo = 157,500 commission + 892,500 provider earning.
- TOWING: 1,578,150 kobo = 236,722 commission + 1,341,428 provider earning.
- LOCKOUT: 800,000 kobo = 120,000 commission + 680,000 provider earning.
- Realtime: 18 `request.updated` events observed across the three journeys.
- All three providers were released from `current_request_id` after completion; test identities and financial rows were removed by scoped cleanup.
- API regression suite: PASS (65/65 across 13 suites).
- Shared tests: PASS (4/4); workspace lint/typecheck and API/admin production builds: PASS.
- Impeccable detector: PASS (no findings on the customer receipt surface).

### Slice 6 — Provider authorization and physical-device gate hardening — 16 Nov 2026

- Added explicit `PROVIDER` role enforcement to dispatch offers, provider job lifecycle, service onboarding mutations, availability and location ingestion routes; customer tokens can no longer invoke provider-only operations.
- Kept provider profile creation available to authenticated users so the documented customer-to-provider onboarding transition remains possible.
- Enforced the specification's maximum location-ingestion rate of one request per provider per second across single-point and batch endpoints, returning `429 LOCATION_RATE_LIMIT` before service work is performed.
- Added authorization and throttling regressions proving a customer role is rejected and rapid repeated provider location calls are blocked.
- Expanded `docs/DEVICE_TESTS.md` into the Phase 4 physical acceptance script covering locked-phone tracking, 30/120-second stale states, offline buffering and oldest-first replay, exact receipts/ledger reconciliation, wallet/payout behavior and battery-saver evidence.

### Slice 6 verification

- API regression suite: PASS (67/67 across 14 suites).
- `pnpm e2e:journey`: PASS for FUEL, TOWING and LOCKOUT with exact integer-kobo reconciliation and 18 realtime updates.
- Workspace typecheck: PASS (all six workspaces).
- Workspace lint: PASS with no errors; six unrelated pre-existing unused-import warnings remain.
- Phase 4 automated gates are green. The remaining acceptance item is execution and evidence capture for the physical-device cases in `docs/DEVICE_TESTS.md`.

### Slice 7 — Admin session-expiry hardening — 19 Nov 2026

- Fixed the admin dashboard restoring an expired JWT from browser storage and continuing to render protected surfaces with failed data requests.
- Admin JWT metadata is now validated before session restoration; malformed or expired tokens are removed before any dashboard request is made.
- Active sessions now end at the token's server-issued `exp` time, and every authenticated API `401` (including CSV reports) centrally clears the session and protected dashboard data.
- Expired sessions return to the sign-in screen with a specific recovery message instead of showing an authenticated dashboard with `JWT token verification failed or expired`.

### Slice 7 verification

- Admin lint: PASS with no warnings or errors.
- Admin typecheck: PASS.
- Admin production build: PASS.
- Impeccable detector: PASS (no findings on the changed session and error-state surface).

### Cross-surface brand integration — 19 Nov 2026

- Adopted the V2 RoadAid shield, route and location-pin mark across the customer app, provider app and admin dashboard.
- Replaced the temporary `RA` monograms with the real brand asset and configured it for both Expo launcher icons and Android adaptive icons.
- Standardised the V2 palette across all three interfaces: amber `#F4AE3E`, green `#64CF99`, ink `#191D23`, dark surface `#252A32`, canvas `#F6F7F5`, muted `#6B7280` and danger `#EC6969`.
- Preserved all existing product flows, dispatch behavior and the frozen three-service scope.
- Customer/provider lint and typecheck pass; Expo resolves both app-icon configurations; admin lint, typecheck and production build pass; the Impeccable detector reports no mechanical findings.

### Approved scope change — unified RoadAid mobile app — 19 Nov 2026

- Replaced the separate shipping-app model with one Expo workspace package named `mobile`, using the existing provider-capable native project so background location, notifications and EAS development builds remain available.
- Added a unified entry choice for Customer or Provider use. New identities may select provider registration during their first authenticated session; an established Customer account cannot self-promote.
- Provider accounts can switch between Provider and Customer modes without a second login. Customer accounts never receive the Provider-mode switch or provider operations.
- Moved the complete customer request, tracking, payment, receipt, rating and dispute experience into the unified app and connected it to the same rotating mobile session used by Provider mode.
- Expanded customer API authorization to `PROVIDER` accounts while retaining ownership checks. Realtime request rooms now authorize a provider as either the request's customer or assigned provider.
- Provider accounts must be offline and have no active provider job before creating a customer request, preserving safe availability behavior and the one-active-job invariant.
- Push registration now records the account's authoritative role, and provider background-location permissions are still requested only when going online in Provider mode.
- Renamed the Expo display app and slug to `RoadAid` / `roadaid`. The existing provider bundle identifiers and EAS project are retained as the upgrade path; the legacy customer source is retained temporarily but excluded from the pnpm workspace and all build gates.
- Updated `SPEC.md`, `PRODUCT.md`, `docs/DECISIONS.md`, `README.md` and the physical-device test instructions for the approved asymmetric role model.

### Unified-app verification

- Workspace lint: PASS across five packages; only five unrelated pre-existing API unused-import warnings remain.
- Workspace typecheck: PASS across all five active packages.
- API/shared tests: PASS (72 API + 4 shared), including provider access to customer capabilities, realtime dual ownership, first-session provider enrollment and established-customer conversion rejection.
- Expo public configuration resolves the unified `RoadAid` app with provider background-location capabilities.
- `pnpm e2e:journey`: PASS for FUEL, TOWING and LOCKOUT with exact integer-kobo ledger reconciliation and 18 realtime updates.
- Remaining acceptance work: install the unified EAS development build on both physical phones and rerun the updated role-switch plus locked-phone/offline matrix in `docs/DEVICE_TESTS.md`.

### Client-requested active-service experience — 19 Nov 2026

- Added service-specific customer language and vector visuals: dispatch rider/motorcycle for FUEL, tow operator/tow truck for TOWING and roadside technician/tools for LOCKOUT, while retaining the single secured provider domain role.
- Reworked assigned and active requests around the supplied interaction reference using RoadAid's own visual system: service headline, ETA, seven-step progress strip, responder identity, one-tap phone action and live map.
- Added pickup coordinates to customer-owned request responses so restored requests can render both the customer and responder markers without trusting stale client state.
- Added explicit live, delayed (>30 seconds) and disconnected (>120 seconds) map states and preserved the existing payment, cancellation, receipt, rating and dispute actions.
- Added `react-native-maps`, `react-native-svg` and `lucide-react-native`; code-native vector icons were selected over generated raster imagery so service symbols stay crisp, accessible and consistent across screen densities.

### Active-service verification

- Unified mobile lint and typecheck: PASS.
- API typecheck and regression suite: PASS (72/72).
- Live FUEL, TOWING and LOCKOUT paid journeys: PASS with exact integer-kobo reconciliation and 18 realtime updates.
- Physical visual QA remains part of the Phase 4 unified-device gate.

---

## Phase 5: Freeze and Hardening

**Status:** Implementation complete; physical release evidence remains pending
**Started:** 20 Nov 2026

### Slice 1 — Production security and release safety

- Production environment validation now fails closed when `CORS_ORIGINS` is absent, a fixed development OTP is configured, console SMS is selected, Termii or Paystack credentials are absent, development JWT secrets are reused, or the default bootstrap password remains active.
- Production browser CORS is restricted to the configured allowlist while native clients without an Origin header remain supported.
- Swagger remains available for development contract work but is no longer exposed by a production API process.
- `/ready` now raises service-unavailable semantics when PostgreSQL cannot answer instead of returning a misleading HTTP 200 degraded response.
- Secret scanning found only documented placeholders/test fixtures; no committed live-looking credential was found.

### Slice 2 — Backup, recovery and deployment hardening

- Production Compose now requires explicit PostgreSQL and Redis passwords instead of silently accepting repository defaults.
- The authenticated Redis health check now uses the configured password.
- Backup and restore scripts accept explicit container/user/database targets, validate the container and gzip archive, reject empty backups and require `CONFIRM_RESTORE=RESTORE` before destructive restoration.
- Removed obsolete Compose version declarations.

### Slice 3 — Documentation and operational handoff

- Added `docs/API.md` with authentication, ownership, exact-kobo, realtime and recovery contracts.
- Added `docs/RUNBOOK.md` with deployment, rollback, backup/restore, stuck-dispatch, payment-incident, outage and secret-rotation procedures.
- Added `docs/ADMIN_GUIDE.md` with role-specific provider, dispatch, finance and reporting procedures.
- Added `docs/HANDOVER.md` with client-owned accounts, environment ownership, release cadence, known limitations and final evidence requirements.
- Updated the README for the unified Customer/Provider mobile application, development-client startup and exact-kobo journey command.

### Phase 5 verification

- Workspace lint: PASS with no warnings or errors.
- Workspace typecheck: PASS across all five active packages.
- API/shared regression suites: PASS (74 API + 4 shared).
- API and admin production builds: PASS.
- Live `pnpm e2e:journey`: PASS for FUEL, TOWING and LOCKOUT with 18 realtime updates and exact integer-kobo reconciliation:
  - FUEL: 1,050,000 = 157,500 commission + 892,500 provider earning.
  - TOWING: 1,578,150 = 236,722 commission + 1,341,428 provider earning.
  - LOCKOUT: 800,000 = 120,000 commission + 680,000 provider earning.
- Impeccable native hardening review was applied to the current map-first unified-app work; automated lint/typecheck pass. Physical-device visual, accessibility, background and battery-saver evidence is still required.

### Remaining acceptance evidence

- Complete the updated unified-app device matrix in `docs/DEVICE_TESTS.md`, including smallest supported screen, large text, TalkBack/VoiceOver, keyboard-open sheets, locked-phone push/location, weak/offline recovery and battery saver.
- Run and record a production-like Compose deployment using a real secret file, then perform the documented backup/restore and rollback drills in an isolated environment.
- Freeze new feature work after acceptance; subsequent changes are release defects, security fixes or store-readiness work only.

### Slice 4 — Uber/Bolt-style journey refinements — 20 Nov 2026

- Added authenticated, server-side Google Places autocomplete, place resolution, reverse geocoding and Google Routes integration with request timeouts, bounded coordinate validation and deterministic routing fallback.
- Replaced coordinate-first customer entry with a searchable, draggable-pin confirmation screen for pickup and towing destination while preserving manual/GPS recovery.
- Towing pricing now uses server route distance when configured; all prices, balances and daily earnings remain integer kobo.
- Active customer and provider maps render road geometry and fit both endpoints without a permanently controlled camera.
- Customer dispatch messaging now reflects recorded sequential-offer events, including review, decline/expiry retry and operations escalation.
- Payment return now polls authoritative server status on foreground, prevents duplicate payment taps while verification is pending and clearly tells the customer not to pay twice.
- Provider command center now reports GPS accuracy/freshness, resyncs both offers and active job after every accept/decline attempt, and shows Lagos-day paid-job count and earnings.
- Added explicit destructive cancellation confirmation and expanded accessible labels/live status announcements.
- Extended physical-device acceptance instructions for location search, pin confirmation, route pricing, map camera behavior, payment return and the limits of a two-phone Phase 3 run.

### Slice 4 verification

- Workspace lint: PASS with no warnings or errors.
- Workspace typecheck: PASS across all five active packages.
- API/shared regression suites: PASS (77 API + 4 shared), including Maps validation/fallback and route-backed towing pricing.
- API and admin production builds: PASS.
- Physical-device validation remains required for native Places interaction, draggable-pin behavior, map camera animation and Paystack app-return behavior; the exact evidence steps are in `docs/DEVICE_TESTS.md`.

### Slice 5 — Cash collection and commission settlement — 20 Nov 2026

- Added customer choice between secure in-app payment and cash to the assigned provider, captured before request submission.
- Cash jobs show the exact locked amount to both parties; the provider can confirm receipt only after arrival, and service cannot begin before confirmation.
- Cash confirmation records a MANUAL customer payment and an exact negative provider commission ledger entry. It does not credit provider earnings because the provider already holds the gross cash.
- Provider wallet now exposes total cash commission due and each unsettled request. Providers can pay an individual commission through Paystack, with foreground verification and duplicate-payment suppression.
- Verified commission settlement adds one equal positive adjustment, reducing provider debt. Cash debt participates in the ledger-derived available balance, so it offsets online earnings and constrains payouts.
- Added ownership, exact-kobo cash commission and duplicate-safe settlement coverage; expanded the physical-device matrix for the full cash journey.

### Slice 5 verification

- Workspace lint: PASS with no warnings or errors.
- Workspace typecheck: PASS across all five active packages.
- API/shared regression suites: PASS (80 API + 4 shared), including assigned-provider ownership, exact cash commission debt and idempotent commission settlement.
- API and admin production builds: PASS.
- Existing live FUEL, TOWING and LOCKOUT Paystack journeys: PASS with 18 realtime updates and exact integer-kobo reconciliation.
- Physical-device cash handover and real Paystack commission settlement remain acceptance evidence to capture using `docs/DEVICE_TESTS.md`; automated tests use the gateway abstraction and do not claim a real bank transaction occurred.

### Slice 6 — Cash commission exposure controls — 20 Nov 2026

- Added the integer-kobo `CASH_COMMISSION_LIMIT_KOBO` policy with a ₦50,000 default and exposed debt, limit, remaining allowance and blocked status in the provider wallet.
- Providers at or above the ceiling cannot go online or enter automatic dispatch candidate results. An active job is never interrupted; the provider is returned offline after completion if the ceiling has been reached.
- Provider mode clearly explains the block and removes its go-online action until verified repayment reduces debt below the threshold.
- Cash confirmation sends an immediate high-priority repayment notification. A server reminder pass runs on startup and every six hours, with database-backed 24-hour deduplication per provider.
- Added automated coverage proving an otherwise eligible provider cannot go online at the exact debt ceiling.

### Slice 6 verification

- Workspace lint and typecheck: PASS.
- API/shared regression suites: PASS (81 API + 4 shared).

### Phase 5 marketplace trust and notification hardening — 20 Nov 2026

- Added a per-request four-digit pickup PIN with AES-256-GCM encryption, a separate keyed verifier and customer-only plaintext retrieval. Providers must verify it before marking arrival; provider payloads strip all PIN secrets and private share tokens.
- Enriched the assigned-provider customer experience with verified provider identity, rating, completed-job count and service vehicle details.
- Added server-calculated offer economics (customer price, commission and provider net) using integer kobo arithmetic, alongside payment mode, ETA and distance context.
- Added an authenticated customer/provider notification inbox API with ownership-scoped list, mark-one-read and mark-all-read operations, plus a customer mobile inbox entry point.
- Added database fields and migration groundwork for beneficiary, scheduling, private request sharing and reciprocal ratings without exposing unfinished flows in the mobile UI.
- Verification: Prisma client generation PASS; workspace lint/typecheck/build PASS; full API regression suite PASS (86/86), including pickup-PIN cryptography and notification ownership tests.

### Phase 5 delegated, scheduled and support experience — 20 Nov 2026

- Added beneficiary booking with validated Nigerian contact details carried through the customer review, provider active-job handoff and request history.
- Added scheduled requests for one hour or the next day in mobile, with server validation for the 30-minute to 30-day window, delayed BullMQ activation and database sweeper recovery after Redis loss or process restarts.
- Added private request-status sharing through a random 128-bit token and an explicit redacted public projection that excludes account, payment, event and pickup-PIN secrets.
- Added provider job history and one-time provider-to-customer ratings for completed assigned jobs.
- Added provider notification inbox read controls alongside the customer inbox.
- Added persisted customer/provider support cases, request ownership validation, an Operations queue, audited status changes and admin dashboard controls.
- Verification: Prisma generation, workspace lint/typecheck/build PASS; API regression suite PASS (95/95), including scheduled-window, private-share, reciprocal-rating and support ownership assertions.
- Commission-sensitive targeted suites: PASS (41/41 across dispatch, provider availability, request state, payments and wallet).
- API and admin production builds: PASS.
- Physical push delivery, 24-hour reminder deduplication and at-limit device behavior remain listed acceptance evidence in `docs/DEVICE_TESTS.md`.
