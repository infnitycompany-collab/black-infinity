# Voice, video, screen sharing and channel broadcasts

This implementation uses browser WebRTC media, authenticated short-lived database signaling and explicit per-user call joining. It does not record or persist media. It is not an independently reviewed E2EE calling protocol.

## Supported implementation

- Direct voice/video calls; private group calls with up to four total participants in this beta.
- Channel broadcasting: only channel owners/admins start/publish; subscribers explicitly join as viewers. Viewer-to-viewer negotiation is rejected.
- Microphone mute, camera on/off, screen video sharing and restoration to the camera.
- Participant tiles, actual peer connection states, explicit leave, navigation cleanup, native browser permission requests and an autoplay recovery control.
- One active call per room, membership rechecks, bilateral direct-call blocks, short-lived signaling, participant heartbeat, 45-second presence expiry and a one-hour maximum session.
- Production ICE is relay-only and requires an operator-configured TURN server. No third-party public STUN service is inserted.

## Deployment configuration

Set `TURN_URLS` to comma-separated `turn:`/`turns:` URLs and `TURN_SHARED_SECRET` to the secret of your controlled coturn deployment. Configure coturn with `use-auth-secret`, certificates, a restricted relay port range, per-user/global bandwidth quotas, private/metadata peer-address blocking, and infrastructure egress controls. Do not run an unauthenticated public TURN service.

The API returns one-hour temporary user credentials computed using coturn's documented timestamp/HMAC-SHA1 scheme. The shared secret stays server-side. The browser receives `iceTransportPolicy: relay` in configured production. See [coturn authentication documentation](https://github.com/coturn/coturn/blob/master/README.turnserver).

When no relay is configured, production joining is disabled. In development only, the UI offers direct local calling after explicit disclosure/consent. Direct ICE may reveal a participant's network address to peers. This is separate from the media privacy relay. Do not expose a development server to public users.

## Limits and required validation

- Four-participant mesh is a bounded beta implementation, not a scalable SFU service. Large groups/channels require a separate SFU architecture, verified encryption boundaries, capacity controls and cost accounting.
- Screen sharing sends the chosen video track; system/desktop audio mixing is not implemented. Browser/OS capture support varies. The capture picker remains a browser-controlled choice.
- Calls need HTTPS or a browser-trusted localhost context. Physical iOS/iPadOS/Android permission, autoplay, backgrounding, microphone routing, screen capture and network handoff remain device acceptance gates.
- TLS/DTLS-SRTP transport encryption is not a claim of independently verified participant identity or of protection from a malicious signaling/app-delivery service.
- Application signaling is never written to ordinary logs. SDP and candidates are deleted after 90 seconds when call endpoints are active; scheduled retention and hosting-log enforcement must be verified for production. Metadata and temporary credentials remain service-visible.
- TURN bandwidth must be separately limited and included in the beta spending cap before production activation. Existing managed-media relay accounting is not a measurement of TURN traffic.
- Calls do not currently provide app-wide incoming ringing, call history, device switching, network ICE restart, recording, screen-control, multi-host large live events or an independently reviewed E2EE group protocol.

## Verification record

The focused communication test passed on 29 October 2026. Browser tests used genuine peer connections and Chromium-provided synthetic camera/microphone devices. They verified private bidirectional video, synthetic audio tracks, mute/camera controls, browser screen capture and matching remote video dimensions, four simultaneous browser participants with three connected peers each, channel viewer restrictions/removal, and leave. Synthetic input is a test fixture, not real-device certification. Call views were captured at 375/768/1440 px. Production TURN connectivity, four physical devices and mobile screen capture remain separate gates.
