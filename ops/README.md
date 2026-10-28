# Operations and reproducible deployment

## Local workstation

Node 24, npm and Git are sufficient. FFmpeg/ffprobe development binaries are project dependencies; production uses OS packages. `npm run setup` creates the local owner invitation and PWA icons. It also generates a private `.data/vapid.env` template; set a verified contact before enabling push.

The embedded PostgreSQL engine is a local convenience, not a multi-process production database. Run local jobs through the owner console while the web process owns it. Run `npm run worker` separately only with PostgreSQL, or when no other process has the embedded database open.

## Production configuration

Docker is not installed on the current workstation; the supplied container setup has not been executed here. Provision a Docker host only after verifying region, cost and account configuration.

Create a private `.env.deploy` with DATABASE_URL, APP_ORIGIN, RP_ID, STORAGE_DRIVER=s3, S3 endpoint/region/bucket, AWS credentials scoped to that private bucket, and any verified provider/push configuration. Set APP_HOST and POSTGRES_PASSWORD for Compose interpolation. URL-encode special characters in the database password inside DATABASE_URL. Never commit either environment file.

```sh
docker compose build
docker compose up -d
```

The gateway obtains HTTPS for APP_HOST. PostgreSQL is not published publicly. The web container is read-only/non-root. The separate worker has process, CPU, memory and temporary-storage limits. No access logger is configured in Caddy. Verify reverse-proxy rate limits and cloud/CDN logging before exposing the service; application rate limits do not replace infrastructure slow-request defenses.

Storage must be private, encrypted at rest, versioned/backed up where required, and separately metered. Do not enable public bucket URLs. Configure region and lifecycle explicitly. Credentials should be least-privilege and separately scoped per service.

The processing container is a baseline boundary, not a verified per-job sandbox. Restrict egress, update native decoders, and verify that untrusted media cannot access service credentials before public use.

## Provider gates

Telegram requires TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET. Register the HTTPS `/api/telegram` webhook using Telegram’s official API and that secret. User linking is explicit; imported media is managed plaintext. Never expose token-bearing download URLs. Local Bot API support for larger files remains future work.

The relay is unavailable with an empty RELAY_ORIGINS list. No user can submit an arbitrary source URL. Approved source provisioning is an operator adapter task and must validate provider permission, stable size/MIME and security. RELAY_BUDGET_BYTES may reduce the 50 GB global maximum; it cannot expand it.

VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT enable real generic Web Push. Test permission rejection, stale subscriptions, expired sessions and iOS Home Screen delivery.

## Backup, restore and rollback

`npm run backup` requires PostgreSQL `pg_dump`, `age`, DATABASE_URL and an age BACKUP_RECIPIENT. It encrypts database output without logging credentials. Back up object storage separately with 30-day lifecycle limits. Schedule backups and verification externally; no scheduler has been installed here.

Restore into a quarantined environment with no outbound notifications/imports or public traffic. Reconcile deletion tombstones from a separately retained authoritative deletion record before enabling any accounts or media links. Test a deliberately deleted account and confirm it cannot reappear. Restoring a database alone is not a completed recovery test.

Deploy immutable image tags and retain the prior image plus compatible database backup. Test schema compatibility and rollback in staging. Do not blindly downgrade after a destructive schema migration. No destructive migration is included in this initial schema.

## Financial gates

Sales and cash commissions are hard-disabled. Before activation, verify merchant country, settlement currency/fees, the complete variable cost model and at least 40% contribution margin. Version EGP/USD price books and notify customers before changes. Payment webhook signature verification and idempotent entitlements must exist before a payment provider is enabled.
