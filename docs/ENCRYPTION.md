# Experimental BI-V1 vault format

This describes implemented behavior in `src/lib/vault.ts` and `public/sw.js`. The protocol is experimental and requires independent review before a public E2EE claim. Standard primitives do not imply that a composition or application has been independently audited.

## Keys and recovery

The browser generates a random 256-bit AES-GCM master key and a 3072-bit RSA-OAEP/SHA-256 key pair. The exported PKCS8 private key is encrypted under the master key with a random 96-bit nonce and AAD `BI-VAULT-KEY-V1`. Only its ciphertext, nonce, version and public JWK reach the service.

The user downloads `BI-RECOVERY-1.<base64 master key>` as the separate vault recovery kit. It is a bearer secret. Anyone holding it plus the wrapped private-key record can unlock that vault. It is never sent to the server by the UI. Account recovery codes only establish an account session; they cannot unwrap a vault key.

## Files and chunks

Each file has a fresh random AES-256-GCM key and an eight-byte random nonce prefix. A nonce is `prefix || uint32_be(chunkIndex)`. Chunk size is 4 MiB of plaintext; the final chunk can be shorter. AES-GCM appends its 16-byte authentication tag.

Chunk AAD is the UTF-8 string `BI-V1:<media UUID>:<index>:<plaintext size>`. This authenticates object identity, position and total size. Metadata reserves index `0xffffffff` and encrypts filename, MIME type and a streaming SHA-256 fingerprint. File data cannot approach that reserved index under the enforced 1 GB limit.

The public metadata envelope contains version, prefix, RSA-wrapped file key, encrypted metadata, plaintext size and chunk size. These reveal size and object existence, not filename. Each permitted recipient receives a separately RSA-wrapped file key. The vault sharing UI requires the recipient’s SHA-256 RSA JWK thumbprint (canonical e/kty/n JSON, base64url) obtained through a trusted channel. Privacy controls display the user’s own fingerprint for copying. The independent review must still assess key-directory and client-delivery trust.

## Resume and playback

The browser stores only an opaque upload pointer in session storage, keyed by file fingerprint. To resume encrypted uploads after reload, the user unlocks the vault and reselects the identical file. The fingerprint is checked against encrypted metadata before reusing key/nonce pairs. A different file must start with a new UUID and new key.

For playback, the browser passes a CryptoKey to its same-origin service worker through a MessageChannel. The worker keeps keys in volatile memory under a random capability handle tied to the creating client. Its range responder fetches one encrypted chunk at a time, authenticates/decrypts it, and emits only the requested plaintext region. No private response enters the Cache API. Handles expire after 30 minutes of inactivity and are removed on explicit close/lock.

## Limits of the promise

- Service infrastructure sees IP connections, identities, object sizes, timing, quotas, sharing relationships and encrypted records.
- A compromised client, extension, operating system, delivered JavaScript bundle or recovery kit defeats content confidentiality.
- Provider imports already exposed plaintext to that provider and import service.
- Revocation prevents future server access but cannot erase prior downloads or keys.
- Browser/codec support varies. Native physical-device streaming remains a release gate.
- Browser process suspension, service-worker termination, logout and account deletion can interrupt playback. Re-unlocking is expected.
