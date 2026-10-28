CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, alias text NOT NULL, role text NOT NULL DEFAULT 'user', plan text NOT NULL DEFAULT 'free',
 created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, suspended boolean NOT NULL DEFAULT false,
 referral_code text UNIQUE NOT NULL, inviter_id text REFERENCES users(id), invite_consumed boolean NOT NULL DEFAULT false,
 vault_public_key jsonb, vault_wrapped jsonb, locale text NOT NULL DEFAULT 'en'
);
CREATE TABLE IF NOT EXISTS invites (hash text PRIMARY KEY, role text NOT NULL DEFAULT 'user', consumed_by text REFERENCES users(id), expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS credentials (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), public_key text NOT NULL, counter bigint NOT NULL, transports jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions (hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, verified_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS challenges (hash text PRIMARY KEY, data jsonb NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS recovery_codes (hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id));
CREATE TABLE IF NOT EXISTS folders (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS media (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), mode text NOT NULL CHECK(mode IN ('vault','managed')),
 name text NOT NULL, mime text NOT NULL, size bigint NOT NULL CHECK(size >= 0), stored_size bigint NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'uploading', metadata jsonb, folder_id text REFERENCES folders(id), favorite boolean NOT NULL DEFAULT false,
 deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, position double precision NOT NULL DEFAULT 0,
 provider_url text, chunk_count integer NOT NULL DEFAULT 0, upload_expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE TABLE IF NOT EXISTS chunks (media_id text NOT NULL REFERENCES media(id) ON DELETE CASCADE, idx integer NOT NULL, size integer NOT NULL, digest text NOT NULL, PRIMARY KEY(media_id,idx));
CREATE TABLE IF NOT EXISTS shares (id text PRIMARY KEY, media_id text NOT NULL REFERENCES media(id), owner_id text NOT NULL REFERENCES users(id), recipient_id text NOT NULL REFERENCES users(id), wrapped_key jsonb, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS playlists (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), name text NOT NULL, media_ids jsonb NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS notifications (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), kind text NOT NULL, message text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), subscription jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS jobs (id text PRIMARY KEY, kind text NOT NULL, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), leased_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(status,available_at);
CREATE TABLE IF NOT EXISTS reward_ledger (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), event_key text NOT NULL UNIQUE, kind text NOT NULL, gb integer NOT NULL DEFAULT 1, state text NOT NULL, cost_cents integer NOT NULL DEFAULT 2, expires_at timestamptz, reverses_id text REFERENCES reward_ledger(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS referral_qualifications (user_id text PRIMARY KEY REFERENCES users(id), inviter_id text REFERENCES users(id), status text NOT NULL DEFAULT 'pending', reason text, qualified_at timestamptz);
CREATE TABLE IF NOT EXISTS partners (user_id text PRIMARY KEY REFERENCES users(id), status text NOT NULL DEFAULT 'pending', website text NOT NULL, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS campaigns (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), name text NOT NULL, tag text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS campaign_visits (id text PRIMARY KEY, campaign_id text NOT NULL REFERENCES campaigns(id), day date NOT NULL DEFAULT current_date);
CREATE TABLE IF NOT EXISTS posts (id text PRIMARY KEY, slug text NOT NULL, locale text NOT NULL DEFAULT 'en', title text NOT NULL, body text NOT NULL, published boolean NOT NULL DEFAULT false, author_id text REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(slug,locale));
CREATE TABLE IF NOT EXISTS audit (id text PRIMARY KEY, actor_id text REFERENCES users(id), action text NOT NULL, target_id text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, hits integer NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS delivery (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), bytes bigint NOT NULL, relay boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS appeals (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), message text NOT NULL, status text NOT NULL DEFAULT 'open', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS external_links (hash text PRIMARY KEY, media_id text NOT NULL REFERENCES media(id), user_id text NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL, revoked_at timestamptz);
CREATE TABLE IF NOT EXISTS deletion_tombstones (user_id text PRIMARY KEY, requested_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE delivery ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS processing_usage(job_key text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),seconds integer NOT NULL CHECK(seconds>0),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS telegram_links(user_id text PRIMARY KEY REFERENCES users(id),code_hash text UNIQUE,code_expires_at timestamptz,chat_id text UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS telegram_updates(update_id bigint PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE posts ADD COLUMN IF NOT EXISTS cover_data text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS cover_alt text;
ALTER TABLE media ADD COLUMN IF NOT EXISTS moderated boolean NOT NULL DEFAULT false;
