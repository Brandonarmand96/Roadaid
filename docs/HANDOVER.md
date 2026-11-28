# RoadAid Handover

## Client-owned accounts

The client must own and control recovery access, billing and MFA for:

- Domain/DNS and `roadaid.ng`
- Production hosting/container registry
- PostgreSQL and Redis hosting
- AWS/S3-compatible storage
- Google Maps Platform
- Expo/EAS, Apple Developer and Google Play Console
- Firebase/FCM
- Paystack
- Termii
- Sentry
- GitHub organisation/repository

Record the account owner, billing owner, recovery email, MFA custodian and renewal date in the client's secure password manager—not in this repository.

## Environment inventory

Backend requires database/Redis URLs, unique JWT secrets, OTP/SMS settings, Maps server key, Paystack secrets, storage credentials, FCM service account, Sentry DSN, bootstrap admin credentials, payment mode, public API URL and production `CORS_ORIGINS`.

Mobile public variables contain only the API URL, EAS project ID and public Maps SDK keys. Anything named `EXPO_PUBLIC_*` is embedded in the application and must not contain a secret.

Admin uses the API URL and browser-restricted Maps key.

## Release ownership

1. Production secrets live in the client's managed secret store.
2. Release images are tagged and immutable.
3. EAS Android/iOS signing credentials remain client controlled.
4. Paystack payouts remain manual; RoadAid does not automate bank payouts.
5. Before store submission, provide demo accounts, privacy-policy URL, screenshots, support contact and review notes explaining background location.

## Operational cadence

- Daily: health/error/queue review and escalated-request review.
- Nightly: encrypted database backup copied off-host.
- Weekly: payment/payout/ledger reconciliation and stale admin-account review.
- Monthly: restore drill, dependency/security review and credential-access review.
- On every release: lint, typecheck, tests, build, three-service journey, migration review and rollback record.

## Known limitations

- Android/iOS battery management may restrict background location.
- Push delivery is best-effort; server timers and resync determine correctness.
- ETA falls back to straight-line distance and fixed average speed if Routes is unavailable.
- Payouts and refunds require manual operational actions.
- Store review timing is external to RoadAid.
- Abuja is the only configured city and the service catalogue is limited to fuel, towing and lockout.

## Final acceptance evidence

Retain the completed `docs/DEVICE_TESTS.md` matrix, EAS build identifiers, automated test output, concurrency result, exact-kobo journey reconciliation, backup/restore drill, rollback drill and administrator training acknowledgement.
