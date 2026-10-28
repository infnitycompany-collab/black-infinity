# Security and privacy boundaries

This is a development beta. No independent security audit, production logging verification, complete anonymity, or certification is claimed. Read `docs/THREAT-MODEL.md` and `docs/ENCRYPTION.md` before deployment.

Do not send credentials, recovery kits, private media, or account exports to GitHub issues or project documents. A verified private vulnerability-reporting contact must be configured before public launch. If a report needs sensitive evidence, wait for that channel rather than publishing it.

Script CSP uses per-request nonces with dynamic rendering and no production unsafe-eval. `style-src 'unsafe-inline'` is deliberately scoped to styles because React computes progress/layout widths and the WebGL canvas applies inline dimensions. No user-supplied CSS or raw HTML is accepted. Stricter nonce/hash-based style handling remains a hardening task; do not relax script CSP to make an integration work.

Request URL logging and browser-to-terminal forwarding are disabled in Next development configuration to avoid recording bearer playback links or provider URLs. Production proxy/CDN/service logs require separate verification. Errors log only controlled type/codes, not arbitrary exception bodies.

The beta media relay is not a general-purpose proxy. Unknown origins, private/mapped IP addresses, unsafe redirects, and arbitrary user-provided source URLs are rejected. Public provider adapters remain disabled until permission and network-egress controls are verified.
