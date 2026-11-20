# RoadAid API

The REST API is served under `/v1`; Socket.IO uses the API origin without the `/v1` suffix. In non-production environments, generated Swagger documentation is available at `/docs`. Swagger is disabled in production.

## Authentication

- Mobile users request and verify a phone OTP through `POST /v1/auth/otp/request` and `POST /v1/auth/otp/verify`.
- Administrators authenticate through `POST /v1/admin/auth/login`.
- Protected requests use `Authorization: Bearer <access-token>`.
- Refresh tokens rotate through `POST /v1/auth/refresh`; reuse revokes every session for that user.
- Customer/provider-owned resources are always filtered by the authenticated user ID. Treat a `404` on another user's resource as an ownership denial.

## Primary routes

| Area | Method and route | Role |
|---|---|---|
| Health | `GET /health`, `GET /ready` | Public |
| Profile | `POST /v1/auth/profile` | Authenticated |
| Device token | `POST /v1/devices` | Authenticated |
| Vehicles | `/v1/me/vehicles` | Customer or Provider acting as customer |
| Quote | `POST /v1/pricing/quote` | Customer or Provider acting as customer |
| Requests | `GET/POST /v1/requests`, `GET /v1/requests/:id` | Request owner |
| Cancellation | `POST /v1/requests/:id/cancel` | Request owner |
| Rating/dispute | `POST /v1/requests/:id/rating`, `POST /v1/requests/:id/dispute` | Request owner |
| Provider onboarding | `/v1/provider/profile`, `/services`, `/documents`, `/submit` | Authenticated/Provider as guarded per route |
| Availability/location | `POST /v1/provider/availability`, `/location`, `/location/batch` | Provider |
| Offers | `GET /v1/provider/offers`, `POST /:id/accept`, `POST /:id/decline` | Owning provider |
| Jobs | `GET /v1/provider/jobs/current`, `POST /:id/status`, `POST /:id/cancel` | Assigned provider |
| Payment | `POST /v1/payments/initialize`, `GET /v1/payments/:reference/status` | Request owner |
| Paystack webhook | `POST /v1/webhooks/paystack` | HMAC signature |
| Wallet/payout | `/v1/provider/wallet`, `/earnings`, `/bank-account`, `/payouts` | Provider |
| Admin operations | `/v1/admin/*` | ADMIN plus `AdminRole` guard |

## Exact-value rules

- Money is always integer kobo. JSON values may be serialized as exact integers; clients must never calculate financial truth with floating point.
- Timestamps are UTC ISO-8601 values. User interfaces display them in `Africa/Lagos`.
- Offer expiry, request state, ETA and payment state are server authoritative.
- A provider can have at most one pending offer and one active job. Conflict responses are expected protection, not retry permission to bypass the invariant.

## Error envelope

```json
{
  "code": "OFFER_NO_LONGER_AVAILABLE",
  "message": "This offer is no longer available",
  "path": "/v1/provider/offers/.../accept",
  "timestamp": "2026-11-20T12:00:00.000Z"
}
```

Clients should recover as follows:

- `400`: correct the submitted data.
- `401`: clear the local session or rotate the refresh token.
- `403/404`: do not reveal or retry another user's resource.
- `409`: resynchronise request/offer/job state before showing another action.
- `429`: wait before retrying; location ingestion permits at most one request per provider per second.
- `5xx`: keep the user's input, show a retry action, and attach the request ID/log context when escalating.

## Realtime events

Socket clients authenticate with the access token and join only request rooms they own, are assigned to, or may access as admin. Important events include `request.updated`, `request.eta`, provider-location updates, `offer.new`, `offer.expired`, `offer.cancelled`, availability changes and admin alerts. Polling/resync remains the correctness fallback because push and sockets are best-effort.

## Regenerating the contract

Start the API in development, open `/docs`, and export the OpenAPI document from Swagger. Validate all route changes against role/ownership tests before publishing a new contract.
