# ROADAID — SYSTEM ARCHITECTURE & DESIGN RECORDS

## 1. High-Level Architecture

```mermaid
flowchart TD
  subgraph Clients [Client Applications]
    C[Customer Mobile App<br/>Expo / React Native]
    P[Provider Mobile App<br/>Expo / React Native]
    A[Admin Dashboard<br/>Next.js 14 App Router]
  end

  subgraph Backend [RoadAid Modular Monolith API]
    GW[API Gateway & Socket.IO Gateway<br/>NestJS / Express]
    Auth[Auth & User Module]
    Req[Requests & State Module]
    Disp[Dispatch Engine & Queues<br/>BullMQ]
    Loc[Location & Geo Engine<br/>PostGIS]
    Pay[Payments & Ledger Module]
    Adm[Admin & Audit Module]
  end

  subgraph Infrastructure [Data & Services]
    PG[(PostgreSQL 16 + PostGIS)]
    RD[(Redis 7)]
    S3[(Object Storage / S3 Adapter)]
    GMap[Google Maps Platform<br/>Routes & Places API]
    PST[Paystack Payment Gateway]
    SMS[Termii SMS Gateway]
  end

  C -->|HTTPS REST & WSS| GW
  P -->|HTTPS REST & WSS| GW
  A -->|HTTPS REST & WSS| GW

  GW --> Auth & Req & Disp & Loc & Pay & Adm

  Disp --> RD
  Req --> PG
  Loc --> PG
  Pay --> PG
  Pay --> PST
  Auth --> SMS
  Disp --> GMap
  Adm --> PG
  Adm --> S3
```

## 2. Core Architectural Decision Records (ADRs)

### ADR-001: Modular Monolith vs Microservices
- **Decision:** Build a single NestJS modular monolith with BullMQ workers in-process for MVP.
- **Rationale:** Minimizes operational complexity and deployment friction under the tight deadline while maintaining clean domain boundaries (modules, interfaces, contracts) that can be factored into standalone services later if necessary.

### ADR-002: Concurrency & Invariants Protection
- **Decision:** Combine PostgreSQL PostGIS spatial indexes, `SELECT ... FOR UPDATE SKIP LOCKED`, and partial unique database indexes (`uq_provider_one_active_request`, `uq_request_one_pending_offer`, `uq_provider_one_pending_offer`).
- **Rationale:** Ensures that even with multiple concurrent API requests or distributed workers, double dispatch and provider collisions are prevented at the database storage engine level.

### ADR-003: Double-Entry Immutable Ledger
- **Decision:** Financial balances are derived as `SUM(amount_kobo)` over immutable `ledger_entries`. `wallet_balance_kobo` in `provider_profiles` is an audited cache.
- **Rationale:** Eliminates silent financial mutations, provides an indelible audit trail, and simplifies reconciliation with gateway payouts.
