# Release status and acceptance gates

## Verified locally

- TypeScript check and production build.
- Six unit/integration tests: ranges, price/levels, network-address blocking, database-backed reward idempotency/budget protection, client crypto/recovery/sharing/tampering.
- Chromium end-to-end test: real virtual-authenticator passkey ceremony, managed and encrypted playback, interrupted encrypted upload resume after reload, recipient fingerprint mismatch rejection and recipient decryption, 720p processing, cross-account denial, share/revoke, origin rejection, RTL, overview accessibility, offline fallback, recovery rotation, passkey replacement, delegated-role restrictions, moderation and account deletion.
- Actual page screenshots at 375, 768 and 1440 px; Figma has editable responsive specifications and a separate raster proof page.

## Not verified or disabled

- Physical iPhone/iPad/Android, full-browser compatibility, memory/performance budgets under representative slow networks, and accessibility beyond the exercised pages.
- Independent encryption/client security review, including the implemented recipient fingerprint trust workflow.
- Native Figma Code Connect requires a Dev/Full seat on an Organization/Enterprise plan; the connected Starter/View seat does not permit it. Editable design work and browser photo uploads succeeded. Repository-side mappings are in `design/code-map.json`.
- Figma Starter tool quota was reached after 72 editable frames and 71 photo placements. All 84 current captures exist locally; 13 additional photo uploads, refreshing older proofs, and four new page specifications remain pending a quota reset/plan change. No paid upgrade was performed.
- Live Telegram delivery/import without locally configured bot credentials; cloud imports are limited to 20 MB. A local Bot API large-file adapter is not implemented.
- TeraBox integration permission/API remains unavailable. There is no bypass or fabricated successful connection.
- VAPID-enabled real push delivery and optional recovery email verification.
- Payments, regional price publication, merchant eligibility, signed payment webhooks, advertising and cash payouts. No payable or withdrawable cash balances accrue.
- Production PostgreSQL/S3/HTTPS deployment, environment-specific rate limits/egress restrictions, hardened FFmpeg sandbox, production backups and actual restore/tombstone reconciliation.
- Delegated support/moderator roles, passkey removal, recovery-code regeneration, blog covers, draft preview/editing and individual article pages are implemented. Core API and user flows are exercised by the expanded browser test. Richer moderation evidence and complete UI translation/error-message review remain before declaring the entire blueprint complete.

## Launch rule

Do not label this repository a complete production MVP or independently certified E2EE product. Close each remaining requirement with evidence in the tracker. Native App Store/Play Store applications are a separate later phase; this release is a browser-installable PWA.
