# Release status and acceptance gates

## Verified locally

- The combined production build, type checks, seven unit/integration tests and both end-to-end suites passed on 29 October 2026. The browser suites completed together in 5.7 minutes with synthetic test media/hardware and isolated persistent data.
- Published GitHub Actions run 40716749108 passed installation, build, type checks, tests and browser verification on Linux.
- Production browser smoke passed nonce CSP without unsafe-eval, client hydration, Arabic switching, anonymous access denial and install assets. This does not validate a production database or object store.
- TypeScript check and production build.
- Seven unit/integration tests: ranges, price/levels, network-address blocking, database-backed reward idempotency/budget protection, client crypto/recovery/sharing/tampering, and production calling relay/temporary-credential policy.
- Focused communications browser verification passed on 29 October: real passkey accounts, private bidirectional video, synthetic microphone input, browser screen capture and remote dimension matching, camera/mute controls, four concurrent browser participants with three connected peers each, channel subscriber publish denial/viewing/removal, messages/invitations/roles/reactions/blocking/archives, responsive captures, Arabic RTL, reduced motion and no exercised WCAG A/AA violations in the communication surface. Synthetic browser hardware does not certify physical devices or production TURN.
- Chromium end-to-end test: real virtual-authenticator passkey ceremony, managed and encrypted playback, interrupted encrypted upload resume after reload, recipient fingerprint mismatch rejection and recipient decryption, 720p processing, cross-account denial, share/revoke, origin rejection, RTL, overview accessibility, offline fallback, recovery rotation, passkey replacement, delegated-role restrictions, moderation and account deletion.
- Actual page screenshots at 375, 768 and 1440 px; Figma has editable responsive specifications and a separate raster proof page.

## Not verified or disabled

- Communication scope expanded on 29 October 2026. Chats/groups/channels are service-managed and must never inherit vault E2EE claims. See `docs/COMMUNICATIONS.md` for the full requested coverage inventory and pending features including production calling, stories, bots and rich attachments. Telegram-equivalent functionality is not complete.
- WebRTC private/group calls, screen video sharing and private channel broadcast controls have now been implemented. See `docs/CALLS.md` for exact boundaries and test evidence. Production relay provisioning/budgets, four physical devices, network handoff and backgrounding remain unverified. No production-ready universal calling claim is made.
- Brand v2 has editable vector sources, generated artwork and matching install icons. The new brand and messaging screens cannot be synchronized to Figma while the Starter MCP quota is exhausted; the quota was checked again and remains blocked.
- Physical iPhone/iPad/Android, full-browser compatibility, memory/performance budgets under representative slow networks, and accessibility beyond the exercised pages.
- Independent encryption/client security review, including the implemented recipient fingerprint trust workflow.
- Native Figma Code Connect requires a Dev/Full seat on an Organization/Enterprise plan; the connected Starter/View seat does not permit it. Editable design work and browser photo uploads succeeded. Repository-side mappings are in `design/code-map.json`.
- Figma Starter tool quota was reached after 72 editable frames and 71 photo placements. All 114 current captures exist locally; 43 additional photo placements, refreshing older proofs, nine new page specifications and brand-v2 synchronization remain pending a quota reset/plan change. No paid upgrade was performed.
- Live Telegram delivery/import without locally configured bot credentials; cloud imports are limited to 20 MB. A local Bot API large-file adapter is not implemented.
- TeraBox integration permission/API remains unavailable. There is no bypass or fabricated successful connection.
- VAPID-enabled real push delivery and optional recovery email verification.
- Payments, regional price publication, merchant eligibility, signed payment webhooks, advertising and cash payouts. No payable or withdrawable cash balances accrue.
- Production PostgreSQL/S3/HTTPS deployment, environment-specific rate limits/egress restrictions, hardened FFmpeg sandbox, production backups and actual restore/tombstone reconciliation.
- Delegated support/moderator roles, passkey removal, recovery-code regeneration, blog covers, draft preview/editing and individual article pages are implemented. Core API and user flows are exercised by the expanded browser test. Richer moderation evidence and complete UI translation/error-message review remain before declaring the entire blueprint complete.

## Launch rule

Do not label this repository a complete production MVP or independently certified E2EE product. Close each remaining requirement with evidence in the tracker. Native App Store/Play Store applications are a separate later phase; this release is a browser-installable PWA.
