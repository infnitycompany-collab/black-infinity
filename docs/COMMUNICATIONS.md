# Communication scope and acceptance record

Black Infinity communication is its own application. It does not import a person's Telegram inbox, groups or channel subscriptions. The existing Telegram bot connector remains a separate consent-based media-import integration.

The requested “everything in Telegram” scope is tracked below. This is a coverage inventory, not a claim of parity or a claim that Telegram works in a particular way today. Items marked pending must not appear as enabled product controls.

| Area | Current implementation | Remaining work |
|---|---|---|
| One-to-one messaging | Account-ID addressing, persistent plain-text messages, idempotent sending, blocking | Message requests/acceptance, richer contact privacy, group-block rules |
| Groups | Private, max 25 beta members, single-use 24h invitations, revoke, leave, roles, removal, ownership transfer | Public discovery, topics, advanced permissions, join requests, ban history |
| Channels | Private broadcast, owner/admin publishing, subscriber read-only | Public handles, discussion threads, subscriber analytics, verified ownership |
| Message controls | Replies, edit own messages, delete, pin, four reactions, 50-message pagination, visible timestamps | Forwarding, scheduled/silent messages, disappearing messages, drafts, saved messages, revision policy |
| Delivery | Five-second visible-tab polling, inbox notices, read/unread counts | Streaming transport, typing/presence privacy, delivery/read receipts, reconnect/load testing |
| Attachments | Existing media library upload/playback remains separate | Per-room authorized attachments, albums, voice notes, video messages, downloads, albums and quota accounting |
| Rich content | Plain text, React escaping | Stickers, GIFs, emoji packs, polls/quizzes, formatted text, spoiler controls |
| Calls | WebRTC voice/video, group mesh up to four people, screen video sharing, channel broadcast viewer controls; see CALLS.md | Production TURN provisioning and budgets, physical devices, four simultaneous peers, reconnect/device routing, independent review |
| Stories/live | Private channel WebRTC broadcasts, max four participants total | Scalable live delivery, audience controls/expiration, stories and processing |
| Bots/extensions | Consent-based Telegram bot media integration only | Black Infinity bot API, scoped tokens, webhook signing, commands, mini-app sandbox and payments eligibility |
| Search | Room-title search and loaded-message filtering | Authorized indexed full-history search, date/sender filters and media gallery |
| Safety | Session authentication, same-origin writes, per-action membership, channel roles, caps, block, report to appeals | Rate/abuse tuning, evidence workflow, member bans and appeals, independent review |
| Privacy | Service-managed chat disclosed; generic inbox text; data export; account-deletion worker | Separate independently reviewed E2EE messaging protocol, multi-device identity verification, chat-key recovery, retention choices |
| Motion | Message enter, selected-row feedback, welcome illustration motion; reduced-motion fallbacks | Screen-by-screen interaction QA, physical-device performance validation |
| App shell | Responsive RTL mobile/tablet/desktop; existing standalone PWA installation | Native desktop/mobile apps, notifications on physical devices, platform-specific window chrome |
| Figma | Existing file and tokens remain the design destination | New communications screens and brand synchronization blocked by Starter MCP quota; no upgrade purchased |

## Boundaries

- Chat bodies are readable by Black Infinity's server. They do not use vault content keys. Never market this as E2EE messaging.
- Account IDs, aliases, membership, activity, messages and reactions are service-visible. There is no directory exposing all users.
- Members joining a group can read its existing history. Explain this before sharing sensitive content. Invitations are bearer secrets, single-use, and expire after 24 hours.
- Removing a member prevents later API access. It cannot erase already read or copied messages. Blocking stops new direct messages; shared groups remain shared contexts.
- Account deletion removes owned communities/direct conversations, removes authored message bodies from other communities and removes membership/reactions/invitations. Other members' independent copies cannot be erased.
- Export contains the requesting account's authored messages and memberships, delivered to its authenticated browser. It does not bulk-export other members' chat history.
- No fake typing, fake online states, call buttons without calls or fabricated Telegram connections are presented.

## Required verification

Exercise two real passkey accounts: outsider access denial, invitation reuse denial, send/retry identity, unauthorized edit/pin, reply/reaction, channel subscriber publish denial, promotion/removal, direct block, unread acknowledgement, archive, owner leave protection, reporting, export and deletion. Exercise mobile/tablet/desktop, Arabic RTL and reduced-motion behavior. Complete independent security review and production transport/load testing before opening communication to public registration.
