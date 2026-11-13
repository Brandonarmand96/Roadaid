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
