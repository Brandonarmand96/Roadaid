# ROADAID — RISK REGISTER & MITIGATION STRATEGY

| Risk ID | Category | Description | Severity | Mitigation Strategy |
|---|---|---|---|---|
| **R01** | Architecture | Race condition / double-assignment of providers under concurrent requests | Critical | Database-level partial unique indexes (`uq_provider_one_active_request`, `uq_request_one_pending_offer`, `uq_provider_one_pending_offer`) combined with strict `SELECT ... FOR UPDATE` and `SKIP LOCKED` query semantics. Concurrency test suite mandatory. |
| **R02** | Financial | Floating-point rounding errors in pricing, commissions, or earnings | High | Strictly store all currency in integer minor units (kobo). Floor calculations for commissions. Validate math in unit tests down to the kobo. |
| **R03** | Operations | Lost Redis delayed jobs or server restarts leading to stuck offers | High | Sweeper cron task running every 15s to detect expired pending offers (`expires_at < NOW() - 3s`) and recover orphaned reservations. |
| **R04** | Security | IDOR on customer requests, provider documents, or admin endpoints | Critical | Global JWT authentication guard, `@Roles()` and `@AdminRoles()` decorators, combined with database queries strictly filtered by `user.id` on non-admin routes. Signed short-lived URLs (5m) for documents. |
| **R05** | Mobile / UX | Mobile background location killed by OS battery optimization; stale coordinates | High | Implement foreground service notification on Android; display "Last updated X min ago" chip if >30s stale, grey out marker, and warn customer if >120s stale. Never fake live tracking. |
| **R06** | Third-party | SMS/Push notification delivery latency or drop | Medium | Offers are accessible via polling fallback (`GET /v1/provider/offers/current`); state machine strictly driven by backend server time, never relying on client push receipt. |
| **R07** | Payments | Webhook replay attacks or duplicate charge processing | High | Webhook verification via HMAC SHA512 signature, idempotent event processing table `webhook_events (gateway, event_id)`, and server-to-server transaction verification before marking PAID. |
