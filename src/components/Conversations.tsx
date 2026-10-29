"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  MessageCircle,
  Users,
  Megaphone,
  Send,
  Plus,
  Settings2,
  Pin,
  X,
  Search,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/client";
import { useTranslation } from "@/lib/locale";
import { Button } from "./ui";
import dynamic from "next/dynamic";
const CallPanel = dynamic(() => import("./CallPanel"));
type Room = {
  id: string;
  kind: string;
  title: string;
  description: string;
  role: string;
  muted: boolean;
  archived: boolean;
  unread: number;
  members: number;
};
type Message = {
  id: string;
  seq: string;
  sender_id: string;
  alias: string;
  body: string;
  reply_to: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  pinned: boolean;
  reactions: { emoji: string; user_id: string }[];
};
type Detail = {
  room: Room;
  messages: Message[];
  members: { user_id: string; alias: string; role: string }[];
};
function forgetConversation(){const url=new URL(window.location.href);url.searchParams.delete('conversation');window.history.replaceState(null,'',url);}
export default function Conversations({
  section,
  userId,
}: {
  section: string;
  userId: string;
}) {
  const tr = useTranslation(),
    kind =
      section === "groups"
        ? "group"
        : section === "channels"
          ? "channel"
          : "direct";
  const [rooms, setRooms] = useState<Room[]>([]),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [create, setCreate] = useState(false),
    [settings, setSettings] = useState(false),
    [search, setSearch] = useState(""),
    [messageSearch, setMessageSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [text, setText] = useState(""),
    [reply, setReply] = useState<Message | null>(null),
    [edit, setEdit] = useState<Message | null>(null),
    [invite, setInvite] = useState(""),
    [feedback, setFeedback] = useState(""),
    [blocks, setBlocks] = useState<{ blocked_id: string }[]>([]);
  const selection = useRef(""),
    cursor = useRef(""),
    pending = useRef<{
      body: string;
      replyTo: string | null;
      clientId: string;
    } | null>(null),
    scroller = useRef<HTMLDivElement>(null),
    stick = useRef(true),
    composer = useRef<HTMLTextAreaElement>(null);
  const refresh = useCallback(async () => {
    const current = selection.current;
    const [list, blockList, view] = await Promise.all([
      api("conversations"),
      api("conversations/blocks"),
      current
        ? api(
            `conversations/${current}${cursor.current ? "?before=" + cursor.current : ""}`,
          )
        : Promise.resolve(null),
    ]);
    setRooms(list.rooms);
    setBlocks(blockList.blocks);
    if (current === selection.current && view) {
      setDetail(view);
      if (!document.hidden && view.messages.length)
        await api(`conversations/${current}/read`, "POST", {
          seq: view.messages.at(-1).seq,
        });
    }
  }, []);
  const act = async (fn: () => Promise<void>) => {
    setError("");
    setFeedback("");
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const restored=new URLSearchParams(window.location.search).get('conversation')||'';
    const valid=/^[0-9a-f-]{36}$/i.test(restored)?restored:'';
    setSelected(valid);
    selection.current = valid;
    cursor.current = "";
    setDetail(null);
    setText("");
    setCreate(false);
    setSettings(false);
    setReply(null);
    setEdit(null);
    setSearch("");
    setMessageSearch("");
    setInvite("");
  }, [section]);
  useEffect(() => {
    let live = true,
      inFlight = false;
    const poll = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        await refresh();
      } catch (e) {
        if (e instanceof Error && e.message === "Conversation unavailable") {
          forgetConversation();
          selection.current = "";
          setSelected("");
          setDetail(null);
        }
        if (live)
          setError(
            e instanceof Error ? e.message : "Could not refresh conversations",
          );
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 5000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [refresh]);
  useEffect(() => {
    if (stick.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [detail?.messages]);
  const open = (rid: string) => {
    const url=new URL(window.location.href);url.searchParams.set('conversation',rid);window.history.replaceState(null,'',url);
    selection.current = rid;
    cursor.current = "";
    setSelected(rid);
    setDetail(null);
    setSettings(false);
    setInvite("");
    setText("");
    setReply(null);
    setEdit(null);
    setSearch("");
    setMessageSearch("");
    stick.current = true;
    void act(async () => {});
  };
  const chooseReply = (m: Message) => {
    setReply(m);
    setEdit(null);
    composer.current?.focus();
  };
  const send = () =>
    act(async () => {
      const value = text.trim();
      if (!value) return;
      if (edit)
        await api(`conversations/${selected}/messages/${edit.id}`, "PATCH", {
          body: value,
        });
      else {
        if (
          !pending.current ||
          pending.current.body !== value ||
          pending.current.replyTo !== (reply?.id || null)
        )
          pending.current = {
            body: value,
            replyTo: reply?.id || null,
            clientId: crypto.randomUUID(),
          };
        await api(
          `conversations/${selected}/messages`,
          "POST",
          pending.current,
        );
        pending.current = null;
      }
      setText("");
      setReply(null);
      setEdit(null);
      cursor.current = "";
      stick.current = true;
    });
  const room = detail?.room,
    manage = room && ["owner", "admin"].includes(room.role),
    canSend = room && (room.kind !== "channel" || manage),
    Icon =
      kind === "group" ? Users : kind === "channel" ? Megaphone : MessageCircle;
  return (
    <section
      className={`social-shell panel ${selected ? "social-open" : ""}`}
      aria-label={tr("Conversations")}
    >
      <aside className="social-list">
        <div className="social-list-title">
          <Icon size={22} />
          <h2>
            {tr(
              section === "groups"
                ? "Groups"
                : section === "channels"
                  ? "Channels"
                  : "Chats",
            )}
          </h2>
          <button
            className="icon-button"
            aria-label={tr("Create conversation")}
            onClick={() => {
              setCreate(!create);
              setInvite("");
            }}
          >
            <Plus size={20} />
          </button>
        </div>
        <p className="social-hint">
          {tr("Connect using account IDs and private invitations.")}
        </p>
        <label className="social-search">
          <Search size={16} />
          <input
            aria-label={tr("Search conversations")}
            placeholder={tr("Search conversations")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="social-toggle">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          {tr("Show archived")}
        </label>
        {create && (
          <div className="social-create">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void act(async () => {
                  const r = await api("conversations", "POST", {
                    kind,
                    title: String(data.get("title")),
                    description: String(data.get("description") || ""),
                    ...(kind === "direct"
                      ? { recipient: String(data.get("recipient")) }
                      : {}),
                  });
                  setCreate(false);
                  open(r.id);
                });
              }}
            >
              <label>
                {tr("Conversation name")}
                <input
                  className="form-control"
                  name="title"
                  required
                  maxLength={80}
                />
              </label>
              {kind === "direct" ? (
                <label>
                  {tr("Recipient account ID")}
                  <input
                    className="form-control"
                    name="recipient"
                    required
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                </label>
              ) : (
                <label>
                  {tr("Description")}
                  <textarea
                    className="form-control"
                    name="description"
                    maxLength={500}
                  />
                </label>
              )}
              <Button disabled={busy}>{tr("Create")}</Button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const code = String(new FormData(e.currentTarget).get("code"));
                void act(async () => {
                  const r = await api("conversations/join", "POST", { code });
                  setCreate(false);
                  open(r.id);
                });
              }}
            >
              <label>
                {tr("Private invitation code")}
                <input
                  className="form-control"
                  name="code"
                  required
                  autoComplete="off"
                />
              </label>
              <Button variant="outline-light" disabled={busy}>
                {tr("Join conversation")}
              </Button>
              <p className="social-hint">
                {tr(
                  "Joining shares your alias and account ID with members and gives you access to existing history.",
                )}
              </p>
            </form>
          </div>
        )}
        <nav aria-label={tr("Conversation list")}>
          {rooms
            .filter(
              (r) =>
                r.kind === kind &&
                r.archived === archived &&
                r.title.toLowerCase().includes(search.toLowerCase()),
            )
            .map((r) => (
              <button
                key={r.id}
                className={`social-room ${selected === r.id ? "selected" : ""}`}
                onClick={() => open(r.id)}
              >
                <span className="social-avatar">
                  <Icon size={21} />
                </span>
                <span>
                  <strong>{r.title}</strong>
                  <small>
                    {tr(
                      r.kind === "direct"
                        ? "Private conversation"
                        : r.kind === "channel"
                          ? "Broadcast channel"
                          : "Private group",
                    )}{" "}
                    · {r.members} {tr("members")}
                  </small>
                </span>
                {r.unread > 0 && (
                  <span
                    className="social-unread"
                    aria-label={`${r.unread} ${tr("Unread messages")}`}
                  >
                    {r.unread}
                  </span>
                )}
              </button>
            ))}
          {!rooms.some((r) => r.kind === kind && r.archived === archived) && (
            <div className="social-empty-list">
              {tr("No conversations yet. Create one or join by invitation.")}
            </div>
          )}
        </nav>
        <details className="social-blocks">
          <summary>
            {tr("Blocked accounts")} ({blocks.length})
          </summary>
          {blocks.map((b) => (
            <div key={b.blocked_id}>
              <code>{b.blocked_id}</code>
              <button
                className="subtle-button"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await api("conversations/blocks", "DELETE", {
                      account: b.blocked_id,
                    });
                  })
                }
              >
                {tr("Unblock")}
              </button>
            </div>
          ))}
        </details>
      </aside>
      <div className="social-main">
        {error && (
          <div className="error-banner" role="alert">
            {tr(error)}
            <button
              className="icon-button"
              aria-label={tr("Dismiss error")}
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {feedback && (
          <div className="notice" role="status">
            {tr(feedback)}
          </div>
        )}
        {!selected ? (
          <div className="social-welcome">
            <img
              className="social-brand-art"
              src="/brand/infinity-art-v2.webp"
              width="200"
              height="200"
              alt=""
            />
            <h2>{tr("A little closer, wherever you are.")}</h2>
            <p>
              {tr(
                "Start a conversation, gather your group, or share updates in a channel.",
              )}
            </p>
            <Button onClick={() => setCreate(true)}>
              <Plus size={16} />
              {tr("Create conversation")}
            </Button>
          </div>
        ) : !detail ? (
          <p className="p-4" role="status">
            {tr("Loading conversation…")}
          </p>
        ) : (
          <>
            <header className="social-header">
              <button
                className="icon-button"
                aria-label={tr("Back to conversations")}
                onClick={() => {
                  forgetConversation();
                  selection.current = "";
                  setSelected("");
                  setDetail(null);
                }}
              >
                <ArrowLeft size={20} />
              </button>
              <span className="social-avatar">
                <Icon size={23} />
              </span>
              <div>
                <h2 title={room!.title}>{room!.title}</h2>
                <small>
                  {detail.members.length} {tr("members")} ·{" "}
                  {tr(
                    room!.kind === "channel"
                      ? "Broadcast channel"
                      : "Private conversation",
                  )}
                </small>
              </div>
              <CallPanel
                key={selected}
                roomId={selected}
                userId={userId}
                title={room!.title}
                kind={room!.kind}
                role={room!.role}
              />
              <button
                className="icon-button"
                aria-label={tr("Conversation settings")}
                aria-expanded={settings}
                onClick={() => setSettings(!settings)}
              >
                <Settings2 size={20} />
              </button>
            </header>
            <div className="social-privacy">
              <ShieldCheck size={14} />
              {tr(
                "Service-managed messages. Black Infinity can access chat content. Vault encryption does not apply.",
              )}
            </div>
            {settings ? (
              <div className="social-settings">
                <h3>{tr("Conversation settings")}</h3>
                <p>{room!.description}</p>
                <div className="d-flex gap-2 flex-wrap">
                  <Button
                    variant="outline-light"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await api(
                          `conversations/${selected}/preferences`,
                          "PATCH",
                          { muted: !room!.muted, archived: room!.archived },
                        );
                      })
                    }
                  >
                    {tr(room!.muted ? "Unmute" : "Mute")}
                  </Button>
                  <Button
                    variant="outline-light"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await api(
                          `conversations/${selected}/preferences`,
                          "PATCH",
                          { muted: room!.muted, archived: !room!.archived },
                        );
                      })
                    }
                  >
                    {tr(room!.archived ? "Unarchive" : "Archive")}
                  </Button>
                </div>
                {manage && (
                  <form
                    key={selected}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void act(async () => {
                        await api(`conversations/${selected}`, "PATCH", {
                          title: String(d.get("title")),
                          description: String(d.get("description")),
                        });
                        setFeedback("Conversation updated");
                      });
                    }}
                  >
                    <label>
                      {tr("Conversation name")}
                      <input
                        className="form-control"
                        name="title"
                        defaultValue={room!.title}
                        maxLength={80}
                        required
                      />
                    </label>
                    <label>
                      {tr("Description")}
                      <textarea
                        className="form-control"
                        name="description"
                        maxLength={500}
                        defaultValue={room!.description}
                      />
                    </label>
                    <Button disabled={busy}>{tr("Save changes")}</Button>
                  </form>
                )}
                {manage && room!.kind !== "direct" && (
                  <div>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          setInvite(
                            (
                              await api(
                                `conversations/${selected}/invites`,
                                "POST",
                                {},
                              )
                            ).code,
                          );
                        })
                      }
                    >
                      {tr("Create single-use invitation")}
                    </Button>
                    <p>{tr("Expires in 24 hours. Share privately.")}</p>
                    {invite && (
                      <label>
                        {tr("Private invitation code")}
                        <input
                          className="form-control"
                          readOnly
                          value={invite}
                          onFocus={(e) => e.target.select()}
                        />
                      </label>
                    )}
                    <button
                      className="subtle-button"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await api(
                            `conversations/${selected}/invites`,
                            "DELETE",
                            {},
                          );
                          setInvite("");
                          setFeedback("Invitations revoked");
                        })
                      }
                    >
                      {tr("Revoke invitations")}
                    </button>
                  </div>
                )}
                <h3>{tr("Members")}</h3>
                {detail.members.map((m) => (
                  <div className="social-member" key={m.user_id}>
                    <span>
                      <strong>{m.alias}</strong>
                      <small>
                        {tr(m.role)} · <code>{m.user_id}</code>
                      </small>
                    </span>
                    {room!.role === "owner" && m.user_id !== userId && (
                      <select
                        aria-label={`${tr("Role for")} ${m.alias}`}
                        value={m.role}
                        disabled={busy}
                        onChange={(e) => {
                          const role = e.target.value;
                          if (
                            role === "owner" &&
                            !confirm(tr("Transfer ownership to this member?"))
                          )
                            return;
                          void act(async () => {
                            await api(
                              `conversations/${selected}/members`,
                              "PATCH",
                              { userId: m.user_id, role },
                            );
                          });
                        }}
                      >
                        <option value="member">{tr("member")}</option>
                        <option value="admin">{tr("admin")}</option>
                        <option value="owner">
                          {tr("Transfer ownership")}
                        </option>
                        <option value="remove">{tr("Remove member")}</option>
                      </select>
                    )}
                  </div>
                ))}
                {room!.kind === "direct" && (
                  <Button
                    variant="outline-danger"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const peer = detail.members.find(
                          (m) => m.user_id !== userId,
                        );
                        if (peer) {
                          await api("conversations/blocks", "POST", {
                            account: peer.user_id,
                          });
                          setFeedback("Account blocked");
                        }
                      })
                    }
                  >
                    {tr("Block account")}
                  </Button>
                )}
                <Button
                  variant="outline-danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !confirm(
                        tr(
                          room!.role === "owner"
                            ? "Delete this conversation and its messages for every member?"
                            : "Leave this conversation?",
                        ),
                      )
                    )
                      return;
                    void act(async () => {
                      await api(
                        `conversations/${selected}${room!.role === "owner" ? "" : "/leave"}`,
                        room!.role === "owner" ? "DELETE" : "POST",
                        {},
                      );
                      forgetConversation();selection.current = "";
                      setSelected("");
                      setDetail(null);
                    });
                  }}
                >
                  {tr(
                    room!.role === "owner"
                      ? "Delete conversation"
                      : "Leave conversation",
                  )}
                </Button>
              </div>
            ) : (
              <>
                <label className="social-search m-3">
                  <Search size={15} />
                  <input
                    aria-label={tr("Search loaded messages")}
                    placeholder={tr("Search loaded messages")}
                    value={messageSearch}
                    onChange={(e) => setMessageSearch(e.target.value)}
                  />
                </label>
                <div
                  className="social-messages"
                  ref={scroller}
                  role="log"
                  aria-label={tr("Messages")}
                  aria-live="polite"
                  onScroll={() => {
                    const el = scroller.current!;
                    stick.current =
                      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                  }}
                >
                  {cursor.current && (
                    <Button
                      variant="outline-light"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          cursor.current = "";
                          stick.current = true;
                        })
                      }
                    >
                      {tr("Newest messages")}
                    </Button>
                  )}
                  {detail.messages.length === 50 && (
                    <Button
                      variant="outline-light"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          cursor.current = detail.messages[0].seq;
                          stick.current = false;
                        })
                      }
                    >
                      {tr("Load earlier messages")}
                    </Button>
                  )}
                  {!detail.messages.length && (
                    <div className="social-empty-list">
                      {tr(
                        room!.kind === "channel"
                          ? "Your channel is ready for its first update."
                          : "Say hello. This conversation starts with you.",
                      )}
                    </div>
                  )}
                  {detail.messages
                    .filter(
                      (m) =>
                        m.deleted_at ||
                        m.body
                          .toLowerCase()
                          .includes(messageSearch.toLowerCase()),
                    )
                    .map((m) => (
                      <article
                        key={m.id}
                        className={`social-message ${m.sender_id === userId ? "mine" : ""}`}
                      >
                        <div className="social-bubble">
                          <header>
                            <strong>{m.alias}</strong>
                            <time dateTime={m.created_at}>
                              {new Date(m.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                            {m.pinned && (
                              <Pin
                                size={13}
                                aria-label={tr("Pinned message")}
                              />
                            )}
                          </header>
                          {m.reply_to && (
                            <div className="social-quote">
                              {tr("Reply")}:{" "}
                              {detail.messages
                                .find((x) => x.id === m.reply_to)
                                ?.body.slice(0, 90) || tr("Earlier message")}
                            </div>
                          )}
                          <p dir="auto">
                            {m.deleted_at ? tr("Message removed") : m.body}
                          </p>
                          {m.edited_at && !m.deleted_at && (
                            <small>{tr("Edited")}</small>
                          )}
                          {!m.deleted_at && (
                            <div className="social-message-actions">
                              <button onClick={() => chooseReply(m)}>
                                {tr("Reply")}
                              </button>
                              {m.sender_id === userId && (
                                <button
                                  onClick={() => {
                                    setEdit(m);
                                    setReply(null);
                                    setText(m.body);
                                    composer.current?.focus();
                                  }}
                                >
                                  {tr("Edit")}
                                </button>
                              )}
                              {(m.sender_id === userId || manage) && (
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    if (confirm(tr("Remove this message?")))
                                      void act(async () => {
                                        await api(
                                          `conversations/${selected}/messages/${m.id}`,
                                          "DELETE",
                                        );
                                      });
                                  }}
                                >
                                  {tr("Delete")}
                                </button>
                              )}
                              {manage && (
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void act(async () => {
                                      await api(
                                        `conversations/${selected}/messages/${m.id}/pin`,
                                        "POST",
                                        {},
                                      );
                                    })
                                  }
                                >
                                  {tr(m.pinned ? "Unpin" : "Pin")}
                                </button>
                              )}
                              <button
                                disabled={busy}
                                onClick={() => {
                                  const reason = prompt(tr("Report reason"));
                                  if (reason)
                                    void act(async () => {
                                      await api(
                                        `conversations/${selected}/messages/${m.id}/report`,
                                        "POST",
                                        { reason },
                                      );
                                      setFeedback(
                                        "Report submitted for review",
                                      );
                                    });
                                }}
                              >
                                {tr("Report")}
                              </button>
                            </div>
                          )}
                          {!m.deleted_at && (
                            <div className="social-reactions">
                              {["👍", "❤️", "🎉", "👀"].map((emoji) => (
                                <button
                                  key={emoji}
                                  aria-label={`${tr("React")} ${emoji}`}
                                  aria-pressed={m.reactions.some(
                                    (r) =>
                                      r.emoji === emoji && r.user_id === userId,
                                  )}
                                  disabled={busy}
                                  onClick={() =>
                                    void act(async () => {
                                      await api(
                                        `conversations/${selected}/messages/${m.id}/reaction`,
                                        "POST",
                                        { emoji },
                                      );
                                    })
                                  }
                                >
                                  {emoji}{" "}
                                  {m.reactions.filter((r) => r.emoji === emoji)
                                    .length || ""}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                </div>
                {canSend ? (
                  <form
                    className="social-composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    {(reply || edit) && (
                      <div className="social-compose-context">
                        {tr(edit ? "Editing message" : "Replying to")}:{" "}
                        {(edit || reply)!.body.slice(0, 80)}
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={tr("Cancel")}
                          onClick={() => {
                            setReply(null);
                            setEdit(null);
                            setText("");
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                    <label className="visually-hidden" htmlFor="message-body">
                      {tr("Message")}
                    </label>
                    <textarea
                      id="message-body"
                      ref={composer}
                      placeholder={tr(
                        room!.kind === "channel"
                          ? "Write a channel update…"
                          : "Write a message…",
                      )}
                      maxLength={4000}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          if (!busy && text.trim()) void send();
                        }
                      }}
                    />
                    <Button
                      disabled={busy || !text.trim()}
                      aria-label={tr(edit ? "Save message" : "Send message")}
                    >
                      <Send size={19} />
                      <span>{tr(edit ? "Save" : "Send")}</span>
                    </Button>
                    <small>
                      {text.length}/4000 · {tr("Shift+Enter for a new line")}
                    </small>
                  </form>
                ) : (
                  <div className="social-readonly">
                    {tr("Only channel owners and administrators can publish.")}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
