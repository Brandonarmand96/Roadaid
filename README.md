# RoadAid — BUILT FOR CERTAINTY

On-demand roadside assistance platform for **Abuja, Nigeria**.
Serving **Fuel Delivery**, **Towing**, and **Lockout Assistance**.

---

## Architecture Overview

- **Monorepo:** pnpm workspaces + Turborepo
- **Backend:** NestJS (Express adapter), PostgreSQL 16 + PostGIS, Redis 7 + BullMQ, Socket.IO
- **Mobile:** One React Native + Expo app with Customer and Provider modes
- **Admin Dashboard:** Next.js 14 (App Router) + Tailwind CSS

---

## Quick Start (Setup in ≤ 10 minutes)

### Prerequisites
- Node.js >= 20 (v22 recommended)
- pnpm >= 9 (`npm install -g pnpm`)
- Docker & Docker Compose

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/roadaid/roadaid.git
cd roadaid
pnpm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Start Database and Redis
```bash
docker compose up -d
```
This boots:
- PostgreSQL 16 with PostGIS on port `5432`
- Redis 7 on port `6379`

### 4. Apply Database Migrations & Seed
```bash
pnpm --filter @roadaid/shared build
pnpm --filter api prisma:generate
pnpm --filter api db:migrate
pnpm --filter api db:seed
```

### 5. Run API and Admin
```bash
pnpm --filter api dev
pnpm --filter admin-web dev
```
- **API:** http://localhost:3000
- **Swagger Docs:** http://localhost:3000/docs
- **Health Check:** http://localhost:3000/health
- **Readiness Check:** http://localhost:3000/ready
- **Admin Dashboard:** http://localhost:3001

### 6. Run the Unified Mobile App

Use a LAN-reachable API address; `localhost` on a phone points to the phone itself.

```powershell
$env:EXPO_PUBLIC_API_URL="http://YOUR_LAN_IP:3000/v1"
$env:EXPO_PUBLIC_EAS_PROJECT_ID="YOUR_EAS_PROJECT_ID"
pnpm --filter mobile start -- --dev-client --lan
```

Install the EAS development APK before connecting to Metro. Expo Go is not valid evidence for background location or background push.

---

## Running Tests

```bash
# Run all unit tests
pnpm test

# Run type checks across all workspaces
pnpm typecheck

# Run the exact-kobo three-service journey
pnpm e2e:journey
```

---

## Repository Structure

```
roadaid/
├── apps/
│   ├── api/                  # NestJS API & Dispatch Engine
│   ├── admin-web/            # Next.js Admin Web Dashboard
│   ├── provider-mobile/      # Unified Expo app: Customer + Provider modes
│   └── customer-mobile/      # Legacy source retained temporarily; excluded from workspace
├── packages/
│   ├── shared/               # Domain contracts, enums, Zod schemas, constants
│   └── config/               # Shared tsconfig & tooling
├── infrastructure/           # Dockerfiles, docker-compose, scripts
└── docs/                     # Specifications, architecture, decisions & runbooks
```
