# ROADAID — ARCHITECTURAL & PRODUCT DECISION RECORD

Recorded on: 9 Nov 2026 / 13 Nov 2026
Reference: SPEC.md Section 19 & Blueprint Section 3

## 1. Baseline Defaults and Assumptions
1. **Payment timing:** Online, after provider acceptance (`ONLINE_AFTER_ACCEPT`), before service start. (`PAYMENT_MODE=ONLINE_AFTER_ACCEPT` configurable to `ONLINE_ON_COMPLETION`).
2. **Cancellation fee:** ₦0 (0 kobo) until client sets specific commercial policy.
3. **Placeholder prices (kobo):**
   - FUEL: Base ₦3,000 (300,000 kobo) + ₦1,500/litre (150,000 kobo/litre), min ₦3,000.
   - TOWING: Base ₦15,000 (1,500,000 kobo) + ₦500/km (50,000 kobo/km), min ₦15,000, 0 free km.
   - LOCKOUT: Base ₦8,000 (800,000 kobo), min ₦8,000.
   *(Marked as placeholders to be adjusted via admin dashboard or client config)*.
4. **Platform commission:** 15% (1500 basis points) placeholder across all services.
5. **Supported devices:** Android 10+ (API 29+), iOS 16+.
6. **Payment gateway:** Paystack (default provider-agnostic implementation, webhook HMAC verification).
7. **Offer timeouts & dispatch parameters:**
   - FUEL: 30s timeout, 15km radius, max 5 offers.
   - TOWING: 45s timeout, 15km radius, max 5 offers.
   - LOCKOUT: 30s timeout, 15km radius, max 5 offers.
   - Shortlist size for ETA matrix: 5 candidates.
   - Location staleness threshold: 90s.
   - Max search duration: 600s (10 minutes) before escalating.
8. **Expected scale:** 20–30 active providers, 20–50 requests/day in pilot. Single modular monolith backend with BullMQ worker.
9. **Single operational region:** Abuja, Nigeria (UTC timestamps internally, formatted in UI using `Africa/Lagos`).
10. **Money representation:** Integer minor units (kobo) strictly. No floating point.

## 2. Invariants Enforced in Code & Database
1. **One active job per provider:** Partial unique index `uq_provider_one_active_request` on `service_requests (provider_id)` where status IN ('ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS').
2. **One pending offer per request:** Partial unique index `uq_request_one_pending_offer` on `dispatch_offers (request_id)` where status = 'PENDING'.
3. **One pending offer per provider:** Partial unique index `uq_provider_one_pending_offer` on `dispatch_offers (provider_id)` where status = 'PENDING'.
4. **Unique active provider-service:** Unique `(provider_id, service_type)` on `provider_services`.
5. **Server clock is source of truth:** All expiry and ETA checks compare against server `NOW()`. Client clocks are untrusted.
