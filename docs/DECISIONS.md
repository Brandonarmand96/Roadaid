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
11. **Unified mobile application (approved 19 Nov 2026):** RoadAid ships one Android/iOS app. Customer accounts can use Customer mode only. Provider accounts retain provider capabilities and may switch into Customer mode to request assistance. A customer account cannot self-promote after registration; provider registration must be selected during first-account onboarding. Provider background-location permissions are requested only for provider operations.
12. **Service-specific customer terminology (client feedback, 19 Nov 2026):** Fuel responders are presented as dispatch riders with motorcycle visuals; towing responders as tow operators with tow-truck visuals; lockout responders as roadside technicians with tool visuals. These are presentation labels over the single secured `PROVIDER` role, not additional account roles.

## 2. Invariants Enforced in Code & Database
1. **One active job per provider:** Partial unique index `uq_provider_one_active_request` on `service_requests (provider_id)` where status IN ('ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS').
2. **One pending offer per request:** Partial unique index `uq_request_one_pending_offer` on `dispatch_offers (request_id)` where status = 'PENDING'.
3. **One pending offer per provider:** Partial unique index `uq_provider_one_pending_offer` on `dispatch_offers (provider_id)` where status = 'PENDING'.
4. **Unique active provider-service:** Unique `(provider_id, service_type)` on `provider_services`.
5. **Server clock is source of truth:** All expiry and ETA checks compare against server `NOW()`. Client clocks are untrusted.

## 3. Unified Mobile Experience System (20 Nov 2026)

1. **Map-first composition:** Customer request/active-service and provider dispatch/job surfaces use the map as the spatial context, with compact overlays and a bottom sheet for the current decision. The map remains supporting evidence; identity, status, ETA and the primary action must remain understandable when map tiles, GPS or connectivity are degraded.
2. **State-driven bottom sheets:** Sheet content and available actions are derived from authoritative request, offer, payment and provider-availability states. Sheets must resync on reconnect/foreground and must not preserve an action after its server state has expired or advanced.
3. **Visual language:** Retain the RoadAid V2 shield/route mark, amber `#F4AE3E`, green `#64CF99`, ink `#191D23`, dark surface `#252A32`, warm canvas `#F6F7F5`, muted `#6B7280` and danger `#EC6969`. Service imagery stays explicit: motorcycle/dispatch rider for fuel, tow truck/operator for towing, and tools/technician for lockout. Code-native vector icons are preferred for clarity across densities.
4. **Critical UX contracts:** Never show providers before a customer submits a request; never present stale coordinates as live; preserve call access when tracking is delayed; expose only actions legal for the current state and role; keep customer/provider ownership checks server-side; and never weaken the one-active-job-per-provider invariant for interface convenience.
5. **Timed offers:** Offer countdowns are display-only projections of server `expiresAt` using the measured server/client clock offset. The backend expiry processor and sweeper decide availability. Accept/decline must handle `OFFER_NO_LONGER_AVAILABLE`, immediately resync and remove stale controls; push delivery is never proof that an offer remains valid.
6. **Money display:** API and UI amounts remain integer kobo end to end. Formatting to naira occurs only for presentation; pricing, commission, earnings, refunds and payouts never use floating-point monetary arithmetic.
7. **Accessibility and constrained layouts:** All critical controls require accessible names, adequate contrast and touch targets, text-scaling tolerance and screen-reader-readable state changes. Bottom sheets must avoid trapping focus, remain usable with the keyboard open, allow scrolling to the focused field/action, respect safe areas, and keep the primary action reachable on small screens without obscuring required status or price information.
8. **Device-QA evidence gap:** Static review, lint/typecheck and automated journey coverage do not prove map, keyboard, background tracking, locked-phone offers or small-screen behavior. Acceptance still requires timestamped physical-device evidence using the unified EAS development build and the matrix in `docs/DEVICE_TESTS.md`, including text scaling, screen reader, keyboard-open sheets, smallest supported screen, weak/offline network, background/locked phone, battery saver and stale-location transitions.
