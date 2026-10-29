"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  X,
  Radio,
} from "lucide-react";
import { api } from "@/lib/client";
import { useTranslation } from "@/lib/locale";
import { Button } from "./ui";
type Person = {
  user_id: string;
  alias: string;
  publisher: boolean;
  joined_at: string;
};
type Peer = {
  pc: RTCPeerConnection;
  stream: MediaStream;
  audio?: RTCRtpTransceiver;
  video?: RTCRtpTransceiver;
  candidates: RTCIceCandidateInit[];
};
function MediaTile({
  stream,
  label,
  muted = false,
  state,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  state?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null),
    [blocked, setBlocked] = useState(false),
    [videoActive, setVideoActive] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let current = true;
    setBlocked(false);
    video.muted = muted;
    const bound = new Set<MediaStreamTrack>();
    const update = () => {
      setVideoActive(
        !!stream
          ?.getVideoTracks()
          .some((t) => !t.muted && t.readyState === "live"),
      );
      for (const track of stream?.getTracks() || [])
        if (!bound.has(track)) {
          bound.add(track);
          track.addEventListener("mute", update);
          track.addEventListener("unmute", update);
          track.addEventListener("ended", update);
        }
    };
    update();
    stream?.addEventListener("addtrack", update);
    stream?.addEventListener("removetrack", update);
    video.srcObject = stream;
    if (stream)
      void video.play().catch((e) => {
        if (
          current &&
          e instanceof DOMException &&
          e.name === "NotAllowedError"
        )
          setBlocked(true);
      });
    return () => {
      current = false;
      stream?.removeEventListener("addtrack", update);
      stream?.removeEventListener("removetrack", update);
      for (const track of bound) {
        track.removeEventListener("mute", update);
        track.removeEventListener("unmute", update);
        track.removeEventListener("ended", update);
      }
      video.srcObject = null;
    };
  }, [stream, muted]);
  return (
    <figure className="call-tile">
      <video ref={ref} autoPlay playsInline muted={muted} aria-label={label} />
      {!videoActive && <span className="call-avatar">{label.slice(0, 1)}</span>}
      <figcaption>
        <strong>{label}</strong>
        <span>{state}</span>
      </figcaption>
      {blocked && (
        <button
          className="btn btn-light"
          onClick={() =>
            void ref.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => setBlocked(true))
          }
        >
          Play call audio
        </button>
      )}
    </figure>
  );
}
export default function CallPanel({
  roomId,
  userId,
  title,
  kind,
  role,
}: {
  roomId: string;
  userId: string;
  title: string;
  kind: string;
  role: string;
}) {
  const tr = useTranslation(),
    publisher = kind !== "channel" || ["owner", "admin"].includes(role);
  const [open, setOpen] = useState(false),
    [joined, setJoined] = useState(false),
    [active, setActive] = useState(false),
    [config, setConfig] = useState<any>(null),
    [allowDirect, setAllowDirect] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [people, setPeople] = useState<Person[]>([]),
    [streams, setStreams] = useState<Record<string, MediaStream>>({}),
    [statuses, setStatuses] = useState<Record<string, string>>({}),
    [local, setLocal] = useState<MediaStream | null>(null),
    [muted, setMuted] = useState(false),
    [camera, setCamera] = useState(false),
    [sharing, setSharing] = useState(false);
  const peers = useRef(new Map<string, Peer>()),
    localRef = useRef<MediaStream | null>(null),
    cameraRef = useRef<MediaStreamTrack | null>(null),
    screenRef = useRef<MediaStreamTrack | null>(null),
    joinedRef = useRef(false),
    peopleRef = useRef<Person[]>([]),
    after = useRef("0"),
    callId = useRef(""),
    generation = useRef(0),
    conf = useRef<any>(null),
    isStarting = useRef(false);
  const path = `conversations/${roomId}/call`;
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);
  const cleanup = useCallback(() => {
    generation.current++;
    joinedRef.current = false;
    callId.current = "";
    after.current = "0";
    for (const p of peers.current.values()) p.pc.close();
    peers.current.clear();
    for (const track of localRef.current?.getTracks() || []) track.stop();
    cameraRef.current?.stop();
    screenRef.current?.stop();
    cameraRef.current = null;
    screenRef.current = null;
    localRef.current = null;
    setLocal(null);
    setStreams({});
    setStatuses({});
    setJoined(false);
    setCamera(false);
    setSharing(false);
    setMuted(false);
  }, []);
  useEffect(() => {
    if (!publisher && joinedRef.current) {
      cleanup();
      void api(`${path}/leave`, "POST", {}).catch(() => {});
    }
  }, [publisher, cleanup, path]);
  const leave = async () => {
    cleanup();
    try {
      await api(`${path}/leave`, "POST", {});
    } catch {
      setError(
        tr("Call ended locally. Server presence expires automatically."),
      );
    }
  };
  useEffect(
    () => () => {
      generation.current++;
      joinedRef.current = false;
      for (const p of peers.current.values()) p.pc.close();
      peers.current.clear();
      for (const track of localRef.current?.getTracks() || []) track.stop();
      cameraRef.current?.stop();
      screenRef.current?.stop();
      void api(`${path}/leave`, "POST", {}).catch(() => {});
    },
    [path],
  );
  const signal = async (target: string, payload: unknown) => {
    if (!joinedRef.current) return;
    await api(`${path}/signal`, "POST", {
      target,
      payload,
      clientId: crypto.randomUUID(),
    });
  };
  const ensurePeer = async (person: Person) => {
    let peer = peers.current.get(person.user_id);
    if (peer) return peer;
    const pc = new RTCPeerConnection({
        iceServers: conf.current.iceServers,
        iceTransportPolicy: conf.current.iceTransportPolicy,
        bundlePolicy: "max-bundle",
      }),
      stream = new MediaStream();
    peer = { pc, stream, candidates: [] };
    peers.current.set(person.user_id, peer);
    // Only the deterministic offerer creates transceivers. The answerer must
    // reuse the offered m-lines rather than create unnegotiated senders.
    if (userId < person.user_id) {
      peer.audio = pc.addTransceiver("audio", {
        direction: publisher ? "sendrecv" : "recvonly",
      });
      peer.video = pc.addTransceiver("video", {
        direction: publisher ? "sendrecv" : "recvonly",
      });
      if (publisher) {
        await peer.audio.sender.replaceTrack(
          localRef.current?.getAudioTracks()[0] || null,
        );
        await peer.video.sender.replaceTrack(
          screenRef.current || cameraRef.current,
        );
      }
    }
    pc.onicecandidate = (e) => {
      if (e.candidate)
        void signal(person.user_id, {
          type: "candidate",
          candidate: e.candidate.toJSON(),
        }).catch(() =>
          setError(tr("Call signaling interrupted. Check your connection.")),
        );
    };
    pc.ontrack = (e) => {
      const current = peopleRef.current.find(
        (p) => p.user_id === person.user_id,
      );
      if (!current?.publisher) {
        e.track.stop();
        return;
      }
      if (!stream.getTracks().some((t) => t.id === e.track.id))
        stream.addTrack(e.track);
      setStreams((s) => ({ ...s, [person.user_id]: stream }));
    };
    pc.onconnectionstatechange = () => {
      setStatuses((s) => ({ ...s, [person.user_id]: pc.connectionState }));
    };
    return peer;
  };
  const pollRef = useRef<() => Promise<void>>(async () => {});
  pollRef.current = async () => {
    const epoch = generation.current,
      state = await api(`${path}?after=${after.current}`);
    if (epoch !== generation.current) return;
    setActive(!!state.call);
    peopleRef.current = state.participants;
    setPeople(state.participants);
    if (!joinedRef.current) return;
    if (
      !state.call ||
      state.call.id !== callId.current ||
      !state.participants.some((p: Person) => p.user_id === userId)
    ) {
      cleanup();
      setError(tr("Call ended or access was removed."));
      return;
    }
    for (const [uid, p] of peers.current) {
      if (
        !state.participants.some(
          (x: Person) => x.user_id === uid && (publisher || x.publisher),
        )
      ) {
        p.pc.close();
        peers.current.delete(uid);
        setStreams((s) => {
          const next = { ...s };
          delete next[uid];
          return next;
        });
      }
    }
    for (const person of state.participants as Person[]) {
      if (person.user_id === userId || (!publisher && !person.publisher))
        continue;
      const old = peers.current.has(person.user_id),
        peer = await ensurePeer(person);
      if (!old && userId < person.user_id) {
        await peer.pc.setLocalDescription(await peer.pc.createOffer());
        await signal(person.user_id, {
          type: "offer",
          sdp: peer.pc.localDescription!.sdp,
        });
      }
    }
    for (const s of state.signals) {
      const person = state.participants.find(
        (p: Person) => p.user_id === s.sender_id,
      );
      if (!person || (!publisher && !person.publisher)) {
        after.current = s.seq;
        continue;
      }
      const peer = await ensurePeer(person),
        payload = s.payload;
      if (payload.type === "candidate") {
        if (peer.pc.remoteDescription)
          await peer.pc.addIceCandidate(payload.candidate);
        else peer.candidates.push(payload.candidate);
      } else {
        await peer.pc.setRemoteDescription({
          type: payload.type,
          sdp: payload.sdp,
        });
        for (const candidate of peer.candidates)
          await peer.pc.addIceCandidate(candidate);
        peer.candidates = [];
        if (payload.type === "offer") {
          peer.audio = peer.pc
            .getTransceivers()
            .find((t) => t.receiver.track.kind === "audio");
          peer.video = peer.pc
            .getTransceivers()
            .find((t) => t.receiver.track.kind === "video");
          for (const transceiver of [peer.audio, peer.video])
            if (transceiver)
              transceiver.direction = publisher ? "sendrecv" : "recvonly";
          if (publisher) {
            await peer.audio?.sender.replaceTrack(
              localRef.current?.getAudioTracks()[0] || null,
            );
            await peer.video?.sender.replaceTrack(
              screenRef.current || cameraRef.current,
            );
          }
          await peer.pc.setLocalDescription(await peer.pc.createAnswer());
          await signal(s.sender_id, {
            type: "answer",
            sdp: peer.pc.localDescription!.sdp,
          });
        }
      }
      after.current = s.seq;
    }
  };
  useEffect(() => {
    let running = false,
      live = true,
      failures = 0;
    const poll = async () => {
      if (running) return;
      running = true;
      try {
        await pollRef.current();
        failures = 0;
      } catch (e) {
        failures++;
        if (live)
          setError(e instanceof Error ? e.message : tr("Call unavailable"));
        if (failures >= 3 && joinedRef.current) cleanup();
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(poll, open ? 2000 : 10000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [open, cleanup]);
  const show = async () => {
    generation.current++;
    setOpen(true);
    setError("");
    try {
      const c = await api(`${path}/config`);
      setConfig(c);
      conf.current = c;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Call unavailable");
    }
  };
  const join = async (video: boolean) => {
    if (isStarting.current) return;
    isStarting.current = true;
    setBusy(true);
    setError("");
    try {
      if (!config?.available)
        throw new Error(tr("Calls require a configured TURN relay"));
      if (config.mode === "direct-development" && !allowDirect)
        throw new Error(tr("Accept the direct connection disclosure first."));
      localRef.current = publisher
        ? await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: video
              ? {
                  width: { ideal: 640 },
                  height: { ideal: 360 },
                  frameRate: { ideal: 20, max: 24 },
                }
              : false,
          })
        : new MediaStream();
      cameraRef.current = localRef.current.getVideoTracks()[0] || null;
      const call = await api(path, "POST", { allowDirect });
      generation.current++;
      callId.current = call.id;
      after.current = "0";
      joinedRef.current = true;
      setJoined(true);
      setCamera(video);
      setLocal(new MediaStream(localRef.current.getTracks()));
    } catch (e) {
      cleanup();
      setError(
        e instanceof Error
          ? e.message
          : tr(
              "Could not start call. Check microphone and camera permissions.",
            ),
      );
    } finally {
      isStarting.current = false;
      setBusy(false);
    }
  };
  const replaceVideo = async (track: MediaStreamTrack | null) => {
    for (const peer of peers.current.values())
      await peer.video?.sender.replaceTrack(track);
    setLocal(
      new MediaStream([
        ...(localRef.current?.getAudioTracks() || []),
        ...(track ? [track] : []),
      ]),
    );
  };
  const toggleCamera = async () => {
    setError("");
    try {
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
        setCamera(false);
        if (!screenRef.current) await replaceVideo(null);
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 360 },
            frameRate: { max: 24 },
          },
          audio: false,
        });
        cameraRef.current = stream.getVideoTracks()[0];
        setCamera(true);
        if (!screenRef.current) await replaceVideo(cameraRef.current);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Camera unavailable");
    }
  };
  const share = async () => {
    setError("");
    try {
      if (screenRef.current) {
        const old = screenRef.current;
        screenRef.current = null;
        old.onended = null;
        old.stop();
        setSharing(false);
        await replaceVideo(cameraRef.current);
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { max: 15 } },
          audio: false,
        }),
        track = stream.getVideoTracks()[0];
      screenRef.current = track;
      setSharing(true);
      await replaceVideo(track);
      track.onended = () => {
        screenRef.current = null;
        setSharing(false);
        void replaceVideo(cameraRef.current).catch(() =>
          setError(tr("Could not restore camera.")),
        );
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screen sharing unavailable");
      const track = screenRef.current;
      screenRef.current = null;
      if (track) {
        track.onended = null;
        track.stop();
      }
      setSharing(false);
      await replaceVideo(cameraRef.current).catch(() => {});
    }
  };
  return (
    <>
      <button
        className="icon-button"
        aria-label={tr(
          kind === "channel"
            ? "Open channel broadcast"
            : "Open voice and video call",
        )}
        onClick={() => void show()}
      >
        {kind === "channel" ? <Radio size={20} /> : <Phone size={20} />}
      </button>
      {active && !open && (
        <button
          className="call-incoming subtle-button"
          onClick={() => void show()}
        >
          {tr(
            kind === "channel"
              ? "Broadcast live · Join"
              : "Call in progress · Join",
          )}
        </button>
      )}
      {open && (
        <dialog
          ref={dialog}
          className="call-panel"
          aria-label={tr("Call controls")}
          onCancel={(e) => {
            e.preventDefault();
            void leave();
            setOpen(false);
          }}
        >
          <header>
            <div>
              <strong>{title}</strong>
              <small>
                {tr(
                  kind === "channel" ? "Channel broadcast" : "Voice and video",
                )}{" "}
                · {tr("Four-person beta")}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label={tr("Close call panel")}
              onClick={() => {
                void leave();
                setOpen(false);
              }}
            >
              <X size={20} />
            </button>
          </header>
          {error && (
            <p className="error-banner" role="alert">
              {tr(error)}
            </p>
          )}
          {!joined ? (
            <div className="call-lobby">
              <p>
                {tr(
                  active
                    ? "A call is in progress. Join when you are ready."
                    : kind === "channel"
                      ? "Start a broadcast for your channel."
                      : "Start a private voice or video conversation.",
                )}
              </p>
              <p className="social-hint">
                {tr(
                  "No recording. Media uses WebRTC transport encryption. This is not an independently reviewed E2EE calling claim.",
                )}
              </p>
              {config?.mode === "direct-development" && (
                <label className="call-consent">
                  <input
                    type="checkbox"
                    checked={allowDirect}
                    onChange={(e) => setAllowDirect(e.target.checked)}
                  />
                  {tr(
                    "Local development only: I accept a direct connection that can reveal my network address to call participants. No TURN relay is configured.",
                  )}
                </label>
              )}
              {config && !config.available && (
                <p>{tr("Calls require a configured TURN relay")}</p>
              )}
              <div className="d-flex gap-2 flex-wrap">
                <Button
                  disabled={
                    busy ||
                    !config?.available ||
                    (config.mode === "direct-development" && !allowDirect) ||
                    (!publisher && !active)
                  }
                  onClick={() => void join(false)}
                >
                  <Phone size={17} />
                  {tr(publisher ? "Join voice call" : "Watch broadcast")}
                </Button>
                {publisher && (
                  <Button
                    variant="outline-light"
                    disabled={
                      busy ||
                      !config?.available ||
                      (config.mode === "direct-development" && !allowDirect)
                    }
                    onClick={() => void join(true)}
                  >
                    <Video size={17} />
                    {tr("Join video call")}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <p className="call-mode" role="status">
                {tr(
                  config?.mode === "relay"
                    ? "Relay-only media connection"
                    : "Direct local development connection",
                )}{" "}
                · {people.length}/4
              </p>
              <div className="call-grid">
                {publisher && (
                  <MediaTile stream={local} label={tr("You")} muted />
                )}
                {people
                  .filter((p) => p.user_id !== userId && p.publisher)
                  .map((p) => (
                    <MediaTile
                      key={p.user_id}
                      stream={streams[p.user_id] || null}
                      label={p.alias}
                      state={tr(statuses[p.user_id] || "connecting")}
                    />
                  ))}
              </div>
              <div className="call-toolbar">
                {publisher && (
                  <>
                    <button
                      aria-label={tr(
                        muted ? "Unmute microphone" : "Mute microphone",
                      )}
                      aria-pressed={muted}
                      onClick={() => {
                        const next = !muted;
                        localRef.current?.getAudioTracks().forEach((t) => {
                          t.enabled = !next;
                        });
                        setMuted(next);
                      }}
                    >
                      {muted ? <MicOff /> : <Mic />}
                    </button>
                    <button
                      aria-label={tr(
                        camera ? "Turn camera off" : "Turn camera on",
                      )}
                      aria-pressed={camera}
                      onClick={() => void toggleCamera()}
                    >
                      {camera ? <Video /> : <VideoOff />}
                    </button>
                    <button
                      aria-label={tr(
                        sharing ? "Stop sharing screen" : "Share screen",
                      )}
                      aria-pressed={sharing}
                      onClick={() => void share()}
                      disabled={!navigator.mediaDevices?.getDisplayMedia}
                    >
                      <MonitorUp />
                    </button>
                  </>
                )}
                <button
                  className="call-hangup"
                  aria-label={tr("Leave call")}
                  onClick={() => void leave()}
                >
                  <PhoneOff />
                </button>
              </div>
              <small>
                {tr(
                  "Screen sharing sends the selected video only. System audio is not shared. Leaving stops your camera, microphone and shared screen.",
                )}
              </small>
            </>
          )}
        </dialog>
      )}
    </>
  );
}
