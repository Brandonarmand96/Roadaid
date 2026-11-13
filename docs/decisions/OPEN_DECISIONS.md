# ROADAID — OPEN DECISION REGISTER (D01–D14)

Reference: RoadAid Implementation Blueprint Section 3

| ID | Decision | Blueprint Proposed Default (Configured Baseline) | Status | Owner |
|---|---|---|---|---|
| **D01** | Exact Abuja service polygon/radius | Configurable Abuja pilot boundary / 15km default radius. Disabled outside. | Non-blocking (Configured default in DB) | RoadAid Ops |
| **D02** | Fuel quantity, fuel cost and delivery fee calculation | Base ₦3,000 + ₦1,500/litre. Seeded as admin-adjustable pricing rules. | Non-blocking (Configured default in DB) | RoadAid Commercial |
| **D03** | Towing rates (base / per km / free km) | Base ₦15,000 + ₦500/km (0 free km). Configurable estimate via Google Routes API. | Non-blocking (Configured default in DB) | RoadAid Commercial |
| **D04** | Lockout pricing | Fixed base ₦8,000. Configurable in DB. | Non-blocking (Configured default in DB) | RoadAid Commercial |
| **D05** | Payment timing (prepay vs match vs completion) | Default `ONLINE_AFTER_ACCEPT`. Configurable to `ONLINE_ON_COMPLETION` via env `PAYMENT_MODE`. | Non-blocking (Configured default in env/DB) | RoadAid Product |
| **D06** | Cancellation fee & refund policy | Default ₦0 cancel fee. Manual admin refund approval. Refund ledger entries. | Non-blocking (Configured default in DB) | RoadAid Legal/Finance |
| **D07** | Provider commission & payout cadence | Default 15% (1500 bps). Manual admin payout approval and bank transfer confirmation. | Non-blocking (Configured default in DB) | RoadAid Finance |
| **D08** | Offer expiry, radius, GPS freshness | FUEL 30s, TOWING 45s, LOCKOUT 30s. Radius 15km, Stale GPS 90s. | Non-blocking (Configured default in DB) | RoadAid Ops |
| **D09** | Auth method | Phone OTP (E.164) with SMS provider abstraction (Termii for Nigeria prod, Console for dev). Argon2 admin login. | Implemented (Configured) | RoadAid Product |
| **D10** | Support contact & emergency disclaimer | Configurable support phone (+234...) and legal disclaimer banner in mobile apps. | Non-blocking placeholder | RoadAid Legal |
| **D11** | Supported OS versions | Android 10+ (API 29+), iOS 16+. Background location support. | Implemented in Expo config | RoadAid QA |
| **D12** | App store accounts & merchant credentials | Client-owned Play Console, Apple Developer, and Paystack live keys. Sandbox for dev. | External dependency tracked for Dec | RoadAid Owner |
| **D13** | Job completion evidence | Provider completes in app, customer notified, dispute/rating flow enabled. | Implemented | RoadAid Ops |
| **D14** | Admin dispatch override authority | Super Admin & Operations Admin can re-dispatch, manual assign, or cancel with audit trail. | Implemented | RoadAid Ops |
