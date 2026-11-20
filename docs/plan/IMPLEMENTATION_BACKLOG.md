# ROADAID — IMPLEMENTATION BACKLOG

Tracking implementation phases against SPEC.md and Implementation Blueprint.

## Epic 0: Foundation & Bootstrap (Phase 0) — Target: 9–11 Nov
- [x] **TASK-001**: Repository inspection, git initialization, agent instruction files (`SPEC.md`, `AGENTS.md`, `CLAUDE.md`).
- [x] **TASK-002**: Monorepo root setup (`pnpm-workspace.yaml`, root `package.json`, `turbo.json`, `tsconfig.json`).
- [x] **TASK-003**: Shared contracts package (`packages/shared` with Zod schemas, domain enums, DTOs, constants).
- [x] **TASK-004**: Infrastructure setup (`docker-compose.yml` with Postgres 16 + PostGIS and Redis 7, `.env.example`).
- [x] **TASK-005**: API module structure (`apps/api` NestJS modular monolith with typed config, Prisma schema, hand-written SQL migration for PostGIS & partial unique indexes).
- [x] **TASK-006**: Seed script (`infrastructure/scripts/seed.ts` or `apps/api/prisma/seed.ts`) with default admin, pricing rules, dispatch settings, commission settings.
- [x] **TASK-007**: Realtime Gateway skeleton (`RealtimeModule` with Socket.IO, auth handshake, room management).
- [x] **TASK-008**: Frontend shells (`apps/admin-web` Next.js, `apps/customer-mobile` Expo, `apps/provider-mobile` Expo).
- [x] **TASK-009**: Health & readiness endpoints (`GET /v1/health`, `GET /v1/ready`) + CI workflow (`.github/workflows/ci.yml`).

## Epic 1: Identity, Onboarding & Approvals (Phase 1) — Target: 12–15 Nov
- [x] **TASK-101**: Auth module (OTP request, verify with dev fixed code / console SMS / Termii, refresh tokens, Argon2 admin login).
- [x] **TASK-102**: User profile & customer vehicles API + RBAC & ownership guards.
- [x] **TASK-103**: Provider profile, service registration, document upload (S3 / local storage adapter), review submission.
- [x] **TASK-104**: Admin provider approval workflow (per-service approve/reject, document inspection via signed URLs).
- [x] **TASK-105**: Audit logging on all admin mutations.
- [x] **TASK-106**: RBAC, IDOR, and OTP security test suite.

## Epic 2: Requests & Pricing (Phase 2) — Target: 16–18 Nov
- [x] **TASK-201**: Pricing rules engine (`PricingService.quote` for FUEL, TOWING, LOCKOUT with kobo integer arithmetic).
- [x] **TASK-202**: Service request creation and server-side price lock (`service_requests.price_kobo`).
- [x] **TASK-203**: Request state machine (`RequestStateService.transition` with transactional event logging).
- [x] **TASK-204**: Customer request flows across all 3 services + history.
- [x] **TASK-205**: Admin request queue, detail view, and event timeline.

## Epic 3: Dispatch Engine & Concurrency (Phase 3) — Target: 19–23 Nov
- **TASK-301**: Provider availability & location ingestion (`POST /v1/provider/location`, batching, freshness checks).
- **TASK-302**: Transactional candidate selection with PostGIS spatial queries and `FOR UPDATE ... SKIP LOCKED`.
- **TASK-303**: Timed offer generation, BullMQ `offer:expire` delays, and Socket.IO `offer.new` delivery.
- **TASK-304**: Provider offer acceptance/decline atomic transitions with partial unique index guard.
- **TASK-305**: Offer sweeper cron job (safety net for expired offers and orphaned reserved states).
- **TASK-306**: Escalation, admin re-dispatch rounds, and manual assignment.
- **TASK-307**: Mandatory 50-request / 20-provider concurrency and dispatch test suite.

## Epic 4: Tracking, Payments, Wallet & Operations (Phase 4) — Target: 24–28 Nov
- **TASK-401**: Provider high-frequency GPS tracking on active jobs + ETA recalculation.
- **TASK-402**: Paystack integration (initialize, webhook HMAC signature verification, idempotent event logging).
- **TASK-403**: Immutable double-entry ledger (`ledger_entries`) for platform commissions and provider earnings.
- **TASK-404**: Provider wallet and manual payout requests + Admin finance approval.
- **TASK-405**: Admin live operations map and dashboard KPI reporting.
- **TASK-406**: Ratings, customer disputes, and cancellation fee policies.

## Epic 5: Hardening, Security & Handover (Phase 5) — Target: 29–30 Nov
- [x] **TASK-501**: Comprehensive end-to-end journey tests (`pnpm e2e:journey`).
- [x] **TASK-502**: Mobile location permission wizards, background handling, and offline sync.
- [x] **TASK-503**: Security review (IDOR, rate limits, PII sanitization, secret scanning).
- [x] **TASK-504**: Documentation suite (`README.md`, `API.md`, `RUNBOOK.md`, `ADMIN_GUIDE.md`, `HANDOVER.md`).
