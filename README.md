# Black Infinity

A working privacy-first media workspace, built with Next.js, React, TypeScript, Bootstrap, PostgreSQL and private object storage. **Development beta, not a certified or publicly deployed service.**

## Run locally

Requires Node.js 24 and npm. The existing workstation toolchain is sufficient; Docker is optional for deployment.

```powershell
npm ci
npm run setup
npm run dev
```

Open http://localhost:3000/login?register=1 and use the single-use owner invitation in `.data/owner-invitation.txt`. Register a real passkey and save the account recovery codes. The invitation is generated locally, never committed. Create additional invitations in the owner console.

Local development uses a persistent embedded PostgreSQL engine (PGlite) and private files under `.data`. This is real persistence, not mocked API data. Do not open that same local database from another process while the app runs. Use **Run one local worker tick** in the owner console to process queued jobs. Production uses a separate PostgreSQL service and worker.

Copy `.env.example` to `.env.local` when configuring integrations. Next.js and the setup/worker scripts read `.env.local`. Keep credentials in environment files, never in chat or source control.

## Implemented flows

- Invite-only, pseudonymous passkey registration/login, multiple passkeys, one-time recovery codes, recent verification for administration, session revocation.
- Chunked/resumable managed and encrypted uploads, byte-range playback, favorites, folders, playlists, trash/restore, recipient sharing/revocation and temporary managed-player links.
- Device-held vault keys, encrypted metadata, bounded-memory service-worker decryption, separate vault recovery kit and recipient key wrapping.
- Persistent notification inbox, authenticated SSE with polling fallback, configurable generic Web Push, and offline PWA fallback with public-only caching.
- Deterministic capped storage rewards, qualification worker, referral attribution, partner applications, campaign links/QR codes and exports. Cash commissions are disabled and no cash balance accrues.
- Owner, support and moderator roles, invitations, suspension, partner review, managed-content moderation, public blog covers/articles, jobs, appeals and audit trail.
- Arabic catalog and RTL switching, English, light/dark appearance, responsive mobile/tablet/desktop UI, locally served fonts and reduced-motion-aware 3D.
- Restricted media relay with public-network validation, DNS pinning, redirect revalidation, stripping of identifying headers, range support and delivery reservations. Public source adapters remain disabled pending approval.
- Real FFmpeg-compatible managed variants and Telegram linking/import handlers. Telegram needs a bot token and webhook secret; cloud imports are explicitly limited to 20 MB.

## Design and project links

- [GitHub](https://github.com/infnitycompany-collab/black-infinity)
- [Figma design system, responsive screens and actual browser photos](https://www.figma.com/design/PndV8YDm0JEuLccfOe7kfb)
- [Architecture and handoff document](https://docs.google.com/document/d/1u0zvxiaDqtjIK4Lr9FVL0fLzR8d6ZlXv7xO3xPQ393I/edit)
- [Release tracker](https://docs.google.com/spreadsheets/d/1gk5a2srPnCY1grUdsGyyrpK6GMCYFnzs5PO2d1zYeRY/edit)

Figma has 72 editable responsive frames (including three Arabic variants) and 71 clearly labeled raster browser proofs. There are 84 current browser captures locally. The Starter-plan tool quota stopped the final 13 photo uploads and four newer page specifications. Repository design definitions preserve that pending work. Native Code Connect is also unavailable on the current Starter/View seat; source mappings are recorded in `design/code-map.json`.

The editable frames represent design specifications; screenshot proofs capture the actual running application. Do not describe every editable frame as a pixel-perfect reproduction without individual comparison.

## Verify

```powershell
npm run check
npm test
npm run build
npx playwright install chromium --only-shell
npm run test:e2e
```

The browser test uses genuine WebAuthn ceremonies with Chromium’s virtual authenticator, generated playable media, isolated persistent PostgreSQL data, and the real application endpoints. It exercises streaming, encrypted resume, recipient fingerprint verification and decryption, processing, authorization, revocation, recovery/passkey changes, delegated roles, moderation, deletion, CSRF rejection, responsive screenshots, RTL, accessibility and offline fallback. It does not substitute for physical iPhone/iPad/Android testing.

Generated page photos are in `docs/screenshots`; CI uploads them as an artifact. Never commit recovery kits, account exports, `.data`, `.env` files, presigned upload instructions, or user media.

## Release boundaries

Read [the release checklist](docs/RELEASE.md), [threat model](docs/THREAT-MODEL.md), [encryption format](docs/ENCRYPTION.md) and [operations guide](ops/README.md).

No live payments, cash payouts, ad network, TeraBox bypass, public deployment, physical-device certification or independent encryption audit is claimed. Paid plans are proposed and checkout remains disabled. Production credentials, hosting, approved provider access and external reviews are needed to open those gates.
