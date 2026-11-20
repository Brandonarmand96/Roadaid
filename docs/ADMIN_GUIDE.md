# RoadAid Admin Guide

## Roles

- `OPERATIONS`: provider reviews, requests, dispatch settings, escalation, re-dispatch, manual assignment and cancellation.
- `FINANCE`: payments, refunds, payout approval/rejection/completion and financial reports.
- `SUPER_ADMIN`: combined access.

Never share admin accounts. Every mutation is audited against the signed-in administrator.

## Provider approval

1. Open the provider review queue.
2. Compare profile, identity, driving/vehicle documents and service-specific evidence.
3. Approve or reject each service independently.
4. Add a specific rejection reason that tells the provider what to correct.
5. Confirm an unapproved provider cannot go online.

## Live operations

Use the live map as operational context, not as proof of current location when its timestamp is stale. A provider may be Available, Busy, Unavailable or Offline. `RESERVED` is displayed as Available because it is an internal sequential-dispatch state.

For an escalation:

1. Open the request timeline and identify the last offer outcome.
2. Check eligible providers and freshness.
3. Re-dispatch to start a new round when automated matching should retry.
4. Manually assign only an eligible, online provider with no active job.
5. Cancel only when recovery is inappropriate; enter a clear reason.

Never promise two providers the same request or override the one-active-job rule.

## Dispatch settings

Change timeout, radius, offer count, shortlist, freshness and maximum search duration cautiously. Record why the operational change is needed. Extremely short timeouts harm provider response; large radii produce poor ETA and customer experience.

## Payments and refunds

1. Match the request code, customer, payment reference, currency and exact kobo amount.
2. Use manual payment only after external confirmation.
3. Refund through the audited control and record the external reference/reason.
4. Confirm the resulting immutable negative refund ledger entry.

## Payouts

1. Confirm available ledger-derived balance and bank details.
2. Approve or reject the request.
3. Complete the external bank transfer manually.
4. Record the transfer reference and mark paid once.
5. Confirm one exact negative payout ledger entry; do not repeat the action if the UI is slow.

## Reports

Dashboard and CSV dates use Africa/Lagos. Export Requests, Revenue, Providers and Payouts for the required range, then reconcile totals with immutable ledger entries. Treat CSV files as sensitive operational/financial data.

## Session and security

- An expired session returns to sign-in; sign in again instead of repeatedly refreshing.
- Do not copy access tokens from browser storage.
- Report unexpected role access, another customer's data, duplicate assignments or duplicate money entries immediately.
- Use the Runbook for outages, dispatch recovery and secret rotation.
