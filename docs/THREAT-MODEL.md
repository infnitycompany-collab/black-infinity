# Black Infinity implementation threat model

Scope: this repository and the invited 25-person beta. Approved assumptions are pseudonymous passkey accounts, two explicit privacy modes, 1 GB upload limits, a restricted media relay, no cash activation, and no public deployment yet.

## Assets and boundaries

- Browser ↔ API: session cookies, account records, encrypted envelopes, media authorization and quota operations (`security.ts`, `auth.ts`, API route).
- Browser ↔ service worker: decrypted file keys and streaming plaintext (`vault.ts`, `sw.js`). Keys must never cross to the server.
- API/worker ↔ PostgreSQL and private storage: ownership, durable jobs, invitations, ciphertext and managed plaintext (`schema.sql`, `storage.ts`).
- Relay ↔ external provider: approved origins, provider URLs, upstream streams and bandwidth obligations (`relay.ts`).
- Worker ↔ untrusted media decoder: managed plaintext is parsed by native tools (`processing.ts`). This boundary needs the strongest production isolation.
- Administration ↔ user/account operations: recent verified passkeys and audit records; no vault-key access.

## Prioritized abuse paths

| Priority | Attack | Existing controls | Remaining work |
|---|---|---|---|
| High | Stolen session/recovery secret grants account access | HttpOnly/SameSite cookies, origin validation, hashed session/recovery tokens, passkey UV, session revocation | Physical-device and recovery-abuse review; operational rate-limit tuning |
| High | Cross-account media or share access | Owner/recipient queries, expiry/revocation checks, user-state checks, private/no-store responses | Broader concurrency, deleted-owner and external-link regression coverage |
| High | XSS or compromised bundle steals unlocked vault content | React text rendering, nonce CSP, no arbitrary HTML embeds, local assets, no third-party private-area scripts | Dependency/build provenance, independent client/crypto review, CSP style hardening |
| High | Media relay reaches internal infrastructure | HTTPS origin allowlist, all-answer public IP policy, DNS pinning, redirect validation, explicit headers | Real-provider and network-egress policy validation before adapter activation |
| High | Native decoder vulnerability escapes processing | Separate non-root production worker, no shell arguments, timeouts, resource caps, private temp cleanup | Updated OS media tools, demuxer restriction, hardened per-job sandbox and secret separation verification |
| High | Key-directory substitution or recovery loss compromises vault trust | Separate vault recovery, client-generated keys, authenticated metadata/chunks | Independent protocol review and recipient fingerprint verification workflow |
| Medium | Concurrent uploads/rewards overspend budget | Serializable transactions/advisory locks, reserved media sizes, chunk bounds, idempotent ledger/events, global budgets | Production load tests and failover reconciliation |
| Medium | Pseudonymous referral farming drains promotion credits | Invitations, passkeys, aging/upload qualification, caps and budget reservation | Manual fraud review; cannot reliably infer unique humans without more identity data |
| Medium | Logs, push or exports leak private details | Generic push, explicit export authorization, redacted error codes, disabled request URL logging | Verify hosting/CDN logs and actual retention before publishing guarantees |
| Medium | Restore resurrects a deleted account | Deletion tombstones and documented restore quarantine | Perform full restore/tombstone reconciliation rehearsal |

## Evidence and limits

Automated tests exercise selected key, access, streaming, quota and referral controls. They are not a penetration test or a proof of complete security. Production storage encryption, external connection permissions, physical devices, TLS deployment, decoder isolation, backup restoration and legal retention remain unverified until their release checks are performed.
