# ROADAID — BUILD PROGRESS TRACKER

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

**Status:** Implementation complete / acceptance gate pending physical customer UI confirmation
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
- Live PostGIS/API gate data:
  - FUEL quote and locked price: 1,050,000 kobo (`RA-20261114-C6A885`).
  - TOWING quote and locked price: 2,006,850 kobo (`RA-20261114-8DDBD7`).
  - LOCKOUT quote and locked price: 800,000 kobo (`RA-20261114-8985F2`).
  - All three were stored as `REQUESTED` with matching quote and locked prices.

### Remaining gate evidence

- On the physical customer phone, create or inspect each service request and confirm the locked prices and history display.
- In the admin dashboard, confirm all three requests and their `CREATED` timeline events are visible.
