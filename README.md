# RoadAid — BUILT FOR CERTAINTY

On-demand roadside assistance platform for **Abuja, Nigeria**.
Serving **Fuel Delivery**, **Towing**, and **Lockout Assistance**.

---

## Architecture Overview

- **Monorepo:** pnpm workspaces + Turborepo
- **Backend:** NestJS (Express adapter), PostgreSQL 16 + PostGIS, Redis 7 + BullMQ, Socket.IO
- **Mobile Apps:** React Native + Expo (EAS Build / Dev Client) for Customer and Provider
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

### 5. Run All Applications
```bash
pnpm dev
```
- **API:** http://localhost:3000
- **Swagger Docs:** http://localhost:3000/docs
- **Health Check:** http://localhost:3000/v1/health
- **Admin Dashboard:** http://localhost:3001
- **Customer Mobile:** Expo dev server
- **Provider Mobile:** Expo dev server

---

## Running Tests

```bash
# Run all unit tests
pnpm test

# Run type checks across all workspaces
pnpm typecheck
```

---

## Repository Structure

```
roadaid/
├── apps/
│   ├── api/                  # NestJS API & Dispatch Engine
│   ├── admin-web/            # Next.js Admin Web Dashboard
│   ├── customer-mobile/      # Expo Customer Mobile App
│   └── provider-mobile/      # Expo Provider Mobile App
├── packages/
│   ├── shared/               # Domain contracts, enums, Zod schemas, constants
│   └── config/               # Shared tsconfig & tooling
├── infrastructure/           # Dockerfiles, docker-compose, scripts
└── docs/                     # Specifications, architecture, decisions & runbooks
```
