# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

RoadAid serves motorists in Abuja who need fuel delivery, towing, or vehicle-lockout assistance, and verified roadside providers who respond to those requests. Provider accounts may also need roadside assistance themselves.

## Product Purpose

RoadAid coordinates a trustworthy roadside-assistance journey from request and sequential provider dispatch through live tracking, payment, completion, and support.

## Positioning

RoadAid combines verified service-specific providers with sequential, conflict-safe dispatch and visible operational oversight for Abuja.

## Operating Context

Customers commonly use the app during a stressful roadside incident. Providers use it while mobile, including with the app backgrounded or the phone locked during an active job. Operations administrators monitor and intervene through the separate web dashboard.

## Capabilities and Constraints

- Services are limited to fuel delivery, towing, and vehicle lockout.
- One mobile binary contains Customer and Provider modes.
- Customer accounts may use Customer mode only.
- Provider accounts may switch between Customer and Provider modes.
- A customer account cannot self-promote after registration; provider registration is chosen during first-account onboarding.
- Provider mode preserves the one-active-job-per-provider invariant and background-location requirements.
- Money is represented only as integer kobo; timestamps are stored in UTC and displayed in Lagos time.
- Android 10+ and iOS 16+ are supported.

## Brand Commitments

The product name is RoadAid and the tagline is “BUILT FOR CERTAINTY.” Existing shield/road brand assets and the established charcoal, warm white, and amber identity remain authoritative.

## Evidence on Hand

The repository contains the working mobile flows, admin dashboard, API, automated dispatch/payment tests, and RoadAid mark. No testimonials or external performance claims are supplied and none should be fabricated.

## Product Principles

- Make urgent customer actions immediately understandable.
- Keep provider authority explicit and verifiable.
- Never weaken dispatch, payment, or ownership invariants for UI convenience.
- Ask for sensitive provider permissions only when provider work requires them.
- Recover clearly from weak connectivity and expired sessions.

## Accessibility & Inclusion

Controls must remain usable with platform text scaling, screen readers, high contrast, and one-handed operation in stressful or mobile conditions.
