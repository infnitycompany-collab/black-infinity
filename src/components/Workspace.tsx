"use client";
import { useTranslation, LanguageSwitch } from "@/lib/locale";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  LockKeyhole,
  Film,
  Star,
  ListVideo,
  Share2,
  Gift,
  Globe2,
  Bell,
  ShieldCheck,
  Settings2,
  Trash2,
  Upload,
  Search,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Play,
  FileVideo,
  FileAudio,
  MoreHorizontal,
  X,
  Check,
  Download,
  LogOut,
  Menu,
  HardDrive,
  Fingerprint,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  MessageCircle,
  Users,
  Megaphone,
} from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { Brand } from "./PublicSite";
import { Button } from "./ui";
import DelegatedAdmin from "./DelegatedAdmin";
import { api, bytes, download, coverImage } from "@/lib/client";
const Conversations = dynamic(() => import("./Conversations"), {
  loading: () => <p role="status">Loading conversations…</p>,
});
import {
  createVault,
  unlockVault,
  prepareFile,
  encryptChunk,
  openFile,
  wrapForRecipient,
  VAULT_CHUNK,
  fingerprint,
  keyFingerprint,
} from "@/lib/vault";
const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["library", "All media", FolderOpen],
  ["vault", "Private vault", LockKeyhole],
  ["favorites", "Favorites", Star],
  ["playlists", "Playlists", ListVideo],
  ["shared", "Shared with you", Share2],
  ["chats", "Chats", MessageCircle],
  ["groups", "Groups", Users],
  ["channels", "Channels", Megaphone],
  ["trash", "Trash", Trash2],
] as const;
const extra = [
  ["rewards", "Rewards & referrals", Gift],
  ["partners", "Webmaster portal", Globe2],
  ["connections", "Connections", Globe2],
  ["privacy", "Privacy & security", ShieldCheck],
  ["settings", "Settings", Settings2],
] as const;
type Media = {
  id: string;
  user_id: string;
  mode: string;
  name: string;
  mime: string;
  size: number;
  status: string;
  metadata: any;
  favorite: boolean;
  deleted_at: string | null;
  position: number;
  folder_id: string | null;
  share_wrapped?: { key: string };
};
const titles: Record<string, [string, string]> = {
  chats: [
    "Conversations that feel closer.",
    "Private invitations. Thoughtful connections.",
  ],
  groups: ["Bring your people together.", "A shared space for your community."],
  channels: [
    "Your voice. Your audience.",
    "Publish updates with clear member controls.",
  ],
  overview: [
    "Your space, at a glance.",
    "A little less noise. A little more room for what matters.",
  ],
  library: [
    "Your media. Beautifully together.",
    "Everything you keep, ready when you are.",
  ],
  vault: [
    "A space only you can unlock.",
    "Encrypted on your device. Your keys stay with you.",
  ],
  favorites: ["The ones you come back to.", "Your favorites, one play away."],
  playlists: [
    "Set the mood.",
    "Bring your managed media together in playlists.",
  ],
  shared: [
    "Good things, shared thoughtfully.",
    "Media others have invited you to enjoy.",
  ],
  trash: [
    "Room to reconsider.",
    "Trashed files still count toward your storage.",
  ],
  rewards: [
    "Good things come around.",
    "Invite thoughtfully. Earn a little extra room.",
  ],
  partners: [
    "Grow something worthwhile.",
    "Your affiliate workspace. Transparent from the start.",
  ],
  connections: [
    "Your world, connected.",
    "Only the connections you choose. Clear boundaries included.",
  ],
  privacy: [
    "Your privacy. Your controls.",
    "See what’s connected. Decide what stays.",
  ],
  settings: [
    "Make it feel like you.",
    "A quieter workspace, just the way you like it.",
  ],
  notifications: ["A little heads-up.", "Your updates, without the noise."],
  admin: [
    "Behind the infinity.",
    "Operate the beta with clear controls and an audit trail.",
  ],
};
export default function Workspace({ section }: { section: string }) {
  const tr = useTranslation();

  const router = useRouter(),
    [me, setMe] = useState<any>(null),
    [media, setMedia] = useState<Media[]>([]),
    [folders, setFolders] = useState<any[]>([]),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [mode, setMode] = useState("all"),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState<string | null>(null),
    [selected, setSelected] = useState<Media | null>(null),
    [privateKey, setPrivateKey] = useState<CryptoKey | null>(null),
    [names, setNames] = useState<Record<string, string>>({}),
    [locale, setLocale] = useState("en"),
    [theme, setTheme] = useState("dark"),
    [upload, setUpload] = useState<{
      name: string;
      percent: number;
      status: string;
    } | null>(null),
    [playing, setPlaying] = useState<{
      url: string;
      name: string;
      mime: string;
      id: string;
    } | null>(null),
    [notices, setNotices] = useState<any[]>([]);
  const video = useRef<HTMLVideoElement>(null),
    cancel = useRef(false);
  useEffect(() => {
    if (!modal && !playing) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(
      modal ? ".app-dialog" : ".player-overlay",
    );
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]',
        ) || [],
      );
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setPlaying(null);
        navigator.serviceWorker?.controller?.postMessage({ type: "LOCK" });
      }
      if (e.key === "Tab") {
        const list = focusables(),
          first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [modal, playing]);
  const run = async (fn: () => Promise<any>) => {
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      return null;
    }
  };
  const reload = useCallback(async () => {
    try {
      const [account, library, fs, ns] = await Promise.all([
        api("me"),
        api("media"),
        api("folders"),
        api("notifications"),
      ]);
      setMe(account);
      setMedia(library.media);
      setFolders(fs.folders);
      setNotices(ns.notifications);
    } catch (e) {
      if (e instanceof Error && /Sign in|Session/.test(e.message))
        router.replace("/login");
      else
        setError(e instanceof Error ? e.message : "Could not load your space");
    }
  }, [router]);
  useEffect(() => {
    reload();
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() =>
          setNotice("Browser installation is unavailable on this connection."),
        );
    const lang = localStorage.getItem("bi-language") || "en",
      t = localStorage.getItem("bi-theme") || "dark";
    setLocale(lang);
    setTheme(t);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    document.documentElement.dataset.bsTheme = t;
    const timer = setInterval(() => {
      if (!document.hidden)
        api("notifications")
          .then((d) => setNotices(d.notifications))
          .catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [reload]);
  useEffect(() => {
    if (!me) return;
    const events = new EventSource("/api/v1/notifications/events");
    events.addEventListener("inbox", () => {
      api("notifications")
        .then((d) => setNotices(d.notifications))
        .catch(() => {});
    });
    return () => events.close();
  }, [me?.user.id]);
  useEffect(() => {
    if (!privateKey) return;
    let active = true;
    Promise.all(
      media
        .filter((m) => m.mode === "vault" && m.metadata)
        .map(async (m) => {
          try {
            const f = await openFile(
              m.id,
              m.metadata,
              privateKey,
              m.share_wrapped?.key,
            );
            return [m.id, f.name] as const;
          } catch {
            return [m.id, "Unable to decrypt"] as const;
          }
        }),
    ).then((entries) => {
      if (active) setNames(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [media, privateKey]);
  function lock() {
    setPrivateKey(null);
    setNames({});
    setPlaying(null);
    navigator.serviceWorker?.controller?.postMessage({ type: "LOCK" });
    setNotice("Your vault is locked on this device.");
  }
  function name(m: Media) {
    return m.mode === "vault" ? names[m.id] || "Encrypted media" : m.name;
  }
  async function makeVault() {
    const v = await createVault();
    await api("vault", "POST", { publicKey: v.publicKey, wrapped: v.wrapped });
    download("black-infinity-vault-recovery.txt", v.recovery, "text/plain");
    setPrivateKey(v.privateKey);
    setModal(null);
    setNotice(
      "Vault created. Keep the downloaded recovery kit secure—it is the only way to unlock your vault on another device.",
    );
    await reload();
  }
  async function unlock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const recovery = String(
      new FormData(e.currentTarget).get("recovery") || "",
    ).trim();
    await run(async () => {
      const key = await unlockVault(recovery, me.user.vaultWrapped);
      setPrivateKey(key);
      setModal(null);
      setNotice("Vault unlocked on this device.");
    });
  }
  async function sendFile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget),
      file = form.get("file") as File,
      privacy = String(form.get("mode"));
    if (!file?.size) return;
    if (privacy === "vault" && !privateKey) {
      setError("Unlock or set up the vault before uploading.");
      return;
    }
    cancel.current = false;
    setModal(null);
    const result = await run(async () => {
      setUpload({
        name: file.name,
        percent: 0,
        status: "Checking file integrity…",
      });
      const digest = await fingerprint(file);
      const resumeKey = `bi-upload:${me.user.id}:${privacy}:${digest}`;
      let mid = sessionStorage.getItem(resumeKey),
        prepared: Awaited<ReturnType<typeof prepareFile>> | null = null,
        uploaded: number[] = [];
      if (mid) {
        const existing = await api(`media/${mid}/status`);
        if (existing.status !== "uploading") mid = null;
        else {
          uploaded = existing.chunks;
          if (privacy === "vault") {
            const opened = await openFile(mid, existing.metadata, privateKey!);
            if (opened.fingerprint !== digest)
              throw new Error(
                "This file differs from the original upload. Start a new upload.",
              );
            prepared = { key: opened.key, metadata: existing.metadata };
          }
        }
      }
      if (!mid) {
        mid = crypto.randomUUID();
        if (privacy === "vault")
          prepared = await prepareFile(
            file,
            mid,
            me.user.vaultPublicKey,
            digest,
          );
        await api("media", "POST", {
          id: mid,
          mode: privacy,
          name: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
          metadata: prepared?.metadata || null,
        });
        sessionStorage.setItem(resumeKey, mid);
      }
      for (let i = 0; i < Math.ceil(file.size / VAULT_CHUNK); i++) {
        if (cancel.current) {
          setUpload({
            name: file.name,
            percent: Math.round(((i * VAULT_CHUNK) / file.size) * 100),
            status:
              "Paused. Reselect this exact file to resume. Unlock the vault first for encrypted uploads.",
          });
          return;
        }
        if (!uploaded.includes(i)) {
          const chunk = await file
            .slice(i * VAULT_CHUNK, (i + 1) * VAULT_CHUNK)
            .arrayBuffer();
          const data = prepared
            ? await encryptChunk(
                prepared.key,
                prepared.metadata.prefix,
                mid,
                i,
                file.size,
                chunk,
              )
            : chunk;
          const r = await fetch(`/api/v1/media/${mid}/chunks/${i}`, {
            method: "PUT",
            body: data,
          });
          if (!r.ok) throw new Error((await r.json()).error);
        }
        setUpload({
          name: file.name,
          percent: Math.min(
            99,
            Math.round((((i + 1) * VAULT_CHUNK) / file.size) * 100),
          ),
          status: "Uploading securely…",
        });
      }
      await api(`media/${mid}/complete`, "POST", {});
      sessionStorage.removeItem(resumeKey);
      setUpload({
        name: file.name,
        percent: 100,
        status: "Ready in your library",
      });
      await reload();
    });
    if (result === null)
      setUpload((previous) =>
        previous
          ? {
              ...previous,
              status: "Upload interrupted. Reselect the same file to resume.",
            }
          : null,
      );
  }
  async function play(m: Media) {
    await run(async () => {
      if (m.mode === "managed") {
        setPlaying({
          url: `/api/v1/media/${m.id}/stream`,
          name: name(m),
          mime: m.mime,
          id: m.id,
        });
        return;
      }
      if (!privateKey) {
        setModal("unlock");
        return;
      }
      if (!navigator.serviceWorker?.controller)
        throw new Error(
          "Reload once to enable encrypted streaming on this browser.",
        );
      const f = await openFile(
        m.id,
        m.metadata,
        privateKey,
        m.share_wrapped?.key,
      );
      const channel = new MessageChannel();
      const url = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Encrypted playback setup timed out")),
          5000,
        );
        channel.port1.onmessage = (e) => {
          clearTimeout(timeout);
          resolve(e.data.url);
        };
        navigator.serviceWorker.controller!.postMessage(
          {
            type: "VAULT_OPEN",
            id: m.id,
            key: f.key,
            prefix: m.metadata.prefix,
            size: Number(m.size),
            mime: f.mime,
          },
          [channel.port2],
        );
      });
      setPlaying({ url, name: f.name, mime: f.mime, id: m.id });
    });
  }
  const mine = media.filter((m) => m.user_id === me?.user.id && !m.deleted_at),
    total = me?.usage?.bytes || 0;
  const filtered = media
    .filter((m) => (section === "trash" ? m.deleted_at : !m.deleted_at))
    .filter((m) =>
      section === "vault"
        ? m.mode === "vault"
        : section === "favorites"
          ? m.favorite
          : section === "shared"
            ? m.user_id !== me?.user.id
            : true,
    )
    .filter((m) => mode === "all" || m.mode === mode || m.folder_id === mode)
    .filter((m) => name(m).toLowerCase().includes(search.toLowerCase()));
  const title = titles[section] || titles.overview,
    unread = notices.filter((n) => !n.read_at).length;
  const ar: Record<string, string> = {
    Overview: "نظرة عامة",
    "All media": "كل الوسائط",
    "Private vault": "الخزنة الخاصة",
    Favorites: "المفضلة",
    Playlists: "قوائم التشغيل",
    "Shared with you": "تمت مشاركته معك",
    Trash: "سلة المحذوفات",
    "Rewards & referrals": "المكافآت والدعوات",
    "Webmaster portal": "بوابة الشركاء",
    Connections: "الاتصالات",
    "Privacy & security": "الخصوصية والأمان",
    Settings: "الإعدادات",
  };
  if (!me)
    return (
      <main className="workspace-loading">
        <div className="loading-mark">∞</div>
        <h1>{tr("Opening your space…")}</h1>
        {error ? <p role="alert">{error}</p> : null}
        <Link href="/login">{tr("Sign in")}</Link>
      </main>
    );
  return (
    <div
      className={`workspace ${mobile ? "nav-open" : ""}`}
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <a href="#workspace-main" className="skip-link">
        {tr("Skip to content")}
      </a>
      <aside className="sidebar">
        <Brand />
        <button className="space-switch" onClick={() => setModal("account")}>
          <span className="avatar">
            {me.user.alias.slice(0, 1).toUpperCase()}
          </span>
          <span>
            {me.user.alias}
            <small>{tr("Personal workspace")}</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-caption">{tr("YOUR SPACE")}</div>
        <nav aria-label={tr("Workspace")}>
          {tr(
            nav.map(([key, label, Icon]) => (
              <Link
                onClick={() => setMobile(false)}
                key={key}
                href={key === "overview" ? "/app" : `/app/${key}`}
                className={`nav-item ${section === key ? "active" : ""}`}
              >
                <Icon size={18} />
                {tr(locale === "ar" ? ar[label] : label)}
                {tr(
                  key === "vault" ? (
                    <span className="nav-lock">
                      <LockKeyhole size={11} />
                    </span>
                  ) : key === "library" ? (
                    <span className="nav-count">{tr(mine.length)}</span>
                  ) : null,
                )}
              </Link>
            )),
          )}
          <div className="nav-caption mt-4">{tr("BEYOND THE LIBRARY")}</div>
          {tr(
            extra.map(([key, label, Icon]) => (
              <Link
                onClick={() => setMobile(false)}
                key={key}
                href={`/app/${key}`}
                className={`nav-item ${section === key ? "active" : ""}`}
              >
                <Icon size={18} />
                {tr(locale === "ar" ? ar[label] : label)}
                {tr(
                  key === "rewards" ? (
                    <span className="new-tag">{tr("NEW")}</span>
                  ) : null,
                )}
              </Link>
            )),
          )}
          {["owner", "support", "moderator"].includes(me.user.role) ? (
            <Link
              className={`nav-item ${section === "admin" ? "active" : ""}`}
              href="/app/admin"
            >
              <Settings2 size={18} />
              {tr("Admin console")}
            </Link>
          ) : null}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-title">
            <HardDrive size={15} /> {tr("Your storage")}
            {tr(" ")}
            <span>{tr(Math.round((total / me.usage.limit) * 100))}%</span>
          </div>
          <div className="storage-track">
            <i
              style={{
                width: `${Math.min(100, (total / me.usage.limit) * 100)}%`,
              }}
            />
          </div>
          <small>
            {tr(bytes(total))} {tr("of")}
            {tr(bytes(me.usage.limit))} {tr("used")}
          </small>
          <Link href="/pricing">
            {tr("A little more room")}
            <ArrowUpRight size={14} />
          </Link>
          <div className="sidebar-privacy">
            <span className="status-dot" /> {tr("A private space. By design.")}
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <button
            className="icon-button mobile-menu"
            aria-label={tr("Toggle navigation")}
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            {tr("Your space")}
            <span>/</span>
            <strong>
              {tr(
                section === "overview"
                  ? "Overview"
                  : nav.find((n) => n[0] === section)?.[1] ||
                      extra.find((n) => n[0] === section)?.[1] ||
                      "Updates",
              )}
            </strong>
          </div>
          <div className="header-actions">
            <span className="beta-badge">
              <span className="status-dot" /> {tr("PRIVATE BETA")}
            </span>
            <Link
              href="/app/notifications"
              className="icon-button notification-button"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            >
              <Bell size={19} />
              {tr(unread ? <i /> : null)}
            </Link>
            <button
              className="avatar small-avatar"
              aria-label={tr("Account menu")}
              onClick={() => setModal("account")}
            >
              {me.user.alias.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>
        <main id="workspace-main" className="workspace-main" key={section}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {tr(
                  locale === "ar"
                    ? "مساحتك الخاصة"
                    : "A LITTLE SPACE. ALL YOURS.",
                )}
              </div>
              <h1>
                {locale === "ar" && section === "overview"
                  ? `مرحباً، ${me.user.alias}.`
                  : tr(title[0])}
              </h1>
              <p>{tr(title[1])}</p>
            </div>
            <Button
              className="upload-button"
              onClick={() => setModal("upload")}
            >
              <Plus size={18} />
              {tr(locale === "ar" ? "رفع الوسائط" : "Upload media")}
            </Button>
          </div>
          {error ? (
            <div className="error-banner" role="alert">
              <AlertTriangle size={17} />
              {error}
              <button
                aria-label={tr("Dismiss error")}
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          {notice ? (
            <div className="notice" role="status">
              <CheckCircle2 size={18} />
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label={tr("Dismiss notice")}
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          ) : null}
          {section === "overview" ? (
            <>
              <section className="welcome-card">
                <div>
                  <span className="eyebrow">
                    <LockKeyhole size={13} />{" "}
                    {tr("YOUR WORLD, A LITTLE MORE PRIVATE")}
                  </span>
                  <h2>
                    {tr("Keep what matters.")}
                    <br />
                    <span>{tr("Leave the noise behind.")}</span>
                  </h2>
                  <p>
                    {tr("One considered home for your media.")}
                    <br />
                    {tr("Yours to keep, play, and share.")}
                  </p>
                  <button
                    className="btn btn-light btn-sm"
                    onClick={() => setModal("upload")}
                  >
                    {tr("Bring something in")}
                    <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="welcome-art" aria-hidden="true">
                  <span>∞</span>
                  <i className="art-dot dot-one" />
                  <i className="art-dot dot-two" />
                  <span className="art-label">
                    <ShieldCheck size={13} /> {tr("PRIVATE BY INTENTION")}
                  </span>
                </div>
              </section>
              <div className="row g-3 stats-row">
                <div className="col-sm-4">
                  <Stat
                    icon={FolderOpen}
                    label="Your library"
                    value={`${mine.length}`}
                    detail="media files, all together"
                  />
                </div>
                <div className="col-sm-4">
                  <Stat
                    icon={LockKeyhole}
                    label="Private vault"
                    value={`${mine.filter((m) => m.mode === "vault").length}`}
                    detail={
                      privateKey
                        ? "unlocked on this device"
                        : "encrypted files, your keys"
                    }
                  />
                </div>
                <div className="col-sm-4">
                  <Stat
                    icon={HardDrive}
                    label="Room to grow"
                    value={bytes(Math.max(0, me.usage.limit - total))}
                    detail={`available on your ${me.user.plan} plan`}
                  />
                </div>
              </div>
              <section className="library-section">
                <div className="section-title">
                  <h2>
                    {tr("Recently added")}
                    <span>{tr(mine.length)}</span>
                  </h2>
                  <Link href="/app/library">
                    {tr("View library")}
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
                <MediaGrid
                  items={mine.slice(0, 4)}
                  name={name}
                  play={play}
                  select={(m) => {
                    setSelected(m);
                    setModal("details");
                  }}
                  toggle={(m) =>
                    run(async () => {
                      await api(`media/${m.id}`, "PATCH", {
                        favorite: !m.favorite,
                      });
                      await reload();
                    })
                  }
                />
              </section>
              <div className="row g-3 mt-1">
                <div className="col-md-7">
                  <div className="bottom-card">
                    <div className="icon-bubble">
                      <ShieldCheck />
                    </div>
                    <div>
                      <h3>{tr("Your privacy isn’t an extra.")}</h3>
                      <p>
                        {tr("Understand your keys, sessions, and sharing.")}
                      </p>
                      <Link href="/app/privacy">
                        {tr("Explore your privacy controls")}
                        <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
                <div className="col-md-5">
                  <div className="bottom-card reward-teaser">
                    <Gift size={27} />
                    <div>
                      <h3>{tr("Good things come around.")}</h3>
                      <p>{tr("Invite a friend. Earn a little more room.")}</p>
                      <Link href="/app/rewards">
                        {tr("Meet your rewards")}
                        <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : ["library", "vault", "favorites", "shared", "trash"].includes(
              section,
            ) ? (
            <>
              <div className="library-toolbar">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    aria-label={tr("Search media")}
                    placeholder={
                      locale === "ar" ? "ابحث في مساحتك…" : "Search your space…"
                    }
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <kbd>⌕</kbd>
                </label>
                <select
                  aria-label={tr("Filter media")}
                  className="form-select filter-select"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="all">{tr("All media")}</option>
                  <option value="managed">{tr("Managed streaming")}</option>
                  <option value="vault">{tr("Encrypted vault")}</option>
                  {folders.map((f) => (
                    <option value={f.id} key={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-outline-light btn-sm"
                  onClick={() => setModal("folder")}
                >
                  <Plus size={15} /> {tr("Folder")}
                </button>
              </div>
              {section === "vault" ? (
                <div className="vault-banner">
                  <LockKeyhole size={22} />
                  <div>
                    <strong>
                      {tr(
                        privateKey
                          ? "Unlocked on this device"
                          : "Your keys. Your content.",
                      )}
                    </strong>
                    <p>
                      {me.user.vaultPublicKey
                        ? "Unlock with your separate vault recovery kit."
                        : "Create your vault and save its recovery kit before uploading encrypted files."}
                    </p>
                  </div>
                  <button
                    className="btn btn-outline-light btn-sm"
                    onClick={() =>
                      privateKey
                        ? lock()
                        : me.user.vaultPublicKey
                          ? setModal("unlock")
                          : setModal("create-vault")
                    }
                  >
                    {privateKey
                      ? "Lock vault"
                      : me.user.vaultPublicKey
                        ? "Unlock vault"
                        : "Set up vault"}
                  </button>
                </div>
              ) : null}
              <MediaGrid
                items={filtered}
                name={name}
                play={play}
                select={(m) => {
                  setSelected(m);
                  setModal("details");
                }}
                toggle={(m) =>
                  run(async () => {
                    await api(`media/${m.id}`, "PATCH", {
                      favorite: !m.favorite,
                    });
                    await reload();
                  })
                }
              />
            </>
          ) : ["chats", "groups", "channels"].includes(section) ? (
            <Conversations section={section} userId={me.user.id} />
          ) : section === "rewards" ? (
            <Rewards me={me} run={run} />
          ) : section === "partners" ? (
            <Partners me={me} run={run} />
          ) : section === "privacy" ? (
            <Privacy me={me} run={run} lock={lock} setModal={setModal} />
          ) : section === "connections" ? (
            <Connections me={me} run={run} />
          ) : section === "playlists" ? (
            <Playlists media={mine} play={play} run={run} />
          ) : section === "notifications" ? (
            <section className="panel p-4">
              <div className="section-title">
                <h2>{tr("Your inbox")}</h2>
                <button
                  className="subtle-button"
                  onClick={() =>
                    run(async () => {
                      await api("notifications", "PATCH", {});
                      await reload();
                    })
                  }
                >
                  {tr("Mark all read")}
                </button>
              </div>
              {tr(
                notices.length ? (
                  notices.map((n) => (
                    <div
                      className={`notification-row ${!n.read_at ? "unread" : ""}`}
                      key={n.id}
                    >
                      <div className="icon-bubble">
                        <Bell size={18} />
                      </div>
                      <div>
                        <strong>{tr(n.message)}</strong>
                        <small>
                          {tr(new Date(n.created_at).toLocaleString())}
                        </small>
                      </div>
                      {tr(!n.read_at ? <span className="status-dot" /> : null)}
                    </div>
                  ))
                ) : (
                  <Empty
                    icon={Bell}
                    title={tr("All quiet, in a good way.")}
                    text="Upload, sharing, and security updates will appear here."
                  />
                ),
              )}
            </section>
          ) : section === "settings" ? (
            <section className="panel settings-panel">
              <h2>{tr("The little details.")}</h2>
              <label htmlFor="theme">{tr("Appearance")}</label>
              <select
                id="theme"
                className="form-select"
                value={theme}
                onChange={(e) => {
                  setTheme(e.target.value);
                  localStorage.setItem("bi-theme", e.target.value);
                  document.documentElement.dataset.bsTheme = e.target.value;
                }}
              >
                <option value="dark">{tr("Midnight · Dark")}</option>
                <option value="light">{tr("Daylight · Light")}</option>
              </select>
              <label htmlFor="language">{tr("Language / اللغة")}</label>
              <select
                id="language"
                className="form-select"
                value={locale}
                onChange={(e) => {
                  setLocale(e.target.value);
                  localStorage.setItem("bi-language", e.target.value);
                  document.documentElement.dir =
                    e.target.value === "ar" ? "rtl" : "ltr";
                  document.documentElement.lang = e.target.value;
                  window.dispatchEvent(new Event("bi-locale"));
                }}
              >
                <option value="en">{tr("English")}</option>
                <option value="ar">العربية</option>
              </select>
              <h3 className="mt-4">{tr("Install your space")}</h3>
              <p>
                {tr(
                  "Android and supported desktop browsers: use the browser’s Install app menu. iPhone and iPad: Share → Add to Home Screen. Background tasks depend on your operating system.",
                )}
              </p>
              <Link href="/trust">
                {tr("Read the trust center")}
                <ArrowUpRight size={14} />
              </Link>
            </section>
          ) : section === "admin" ? (
            <Admin run={run} />
          ) : (
            <Empty
              icon={FolderOpen}
              title={tr("Page not found")}
              text="Choose a page from your workspace navigation."
            />
          )}
          <footer className="workspace-footer">
            <span>
              <ShieldCheck size={13} />{" "}
              {tr("Private by intention. Transparent by design.")}
            </span>
            <Link href="/trust">
              {tr("Trust center")}
              <ArrowUpRight size={12} />
            </Link>
          </footer>
        </main>
      </div>
      {upload ? (
        <div className="upload-progress" role="status">
          <div>
            <Upload size={18} />
            <strong>
              {tr(
                upload.percent === 100
                  ? "Upload complete"
                  : "Bringing it into your space",
              )}
            </strong>
            <button
              className="icon-button"
              aria-label={tr("Pause upload or dismiss")}
              onClick={() => {
                cancel.current = true;
                if (upload.percent === 100) setUpload(null);
              }}
            >
              <X size={15} />
            </button>
          </div>
          <p>{upload.name}</p>
          <progress max={100} value={upload.percent} />
          <small>
            {tr(upload.status)} · {tr(upload.percent)}%
          </small>
        </div>
      ) : null}
      {modal ? (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="app-dialog"
          >
            {error ? (
              <div className="error-banner" role="alert">
                {error}
              </div>
            ) : null}
            <button
              className="icon-button dialog-close"
              aria-label={tr("Close dialog")}
              onClick={() => setModal(null)}
            >
              <X />
            </button>
            {modal === "upload" ? (
              <>
                <div className="icon-bubble">
                  <Upload />
                </div>
                <h2 id="dialog-title">{tr("Make room for something good.")}</h2>
                <p>
                  {tr("Choose an audio or video file. Up to 1 GB in the beta.")}
                </p>
                <form onSubmit={sendFile}>
                  <label htmlFor="file">{tr("Your media")}</label>
                  <input
                    id="file"
                    className="form-control"
                    type="file"
                    name="file"
                    accept="video/*,audio/*"
                    required
                  />
                  <label htmlFor="upload-mode">{tr("Privacy mode")}</label>
                  <select
                    id="upload-mode"
                    className="form-select"
                    name="mode"
                    defaultValue={section === "vault" ? "vault" : "managed"}
                  >
                    <option value="managed">
                      {tr("Managed · server can process this media")}
                    </option>
                    <option value="vault">
                      {tr("E2EE vault · only your devices decrypt")}
                    </option>
                  </select>
                  <p className="small mt-3">
                    {tr(
                      "Reselect the exact same file to resume an interrupted upload. Unlock your vault first for encrypted uploads. Files are checked before encrypted chunks reuse their original nonce.",
                    )}
                  </p>
                  {!privateKey ? (
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={() =>
                        setModal(
                          me.user.vaultPublicKey ? "unlock" : "create-vault",
                        )
                      }
                    >
                      {tr("Set up or unlock your encrypted vault first →")}
                    </button>
                  ) : null}
                  <button className="btn btn-primary w-100 mt-3" type="submit">
                    {tr("Upload to your space")}
                    <ArrowRight size={16} />
                  </button>
                </form>
              </>
            ) : modal === "create-vault" ? (
              <>
                <div className="icon-bubble">
                  <LockKeyhole />
                </div>
                <h2 id="dialog-title">
                  {tr("Your vault starts with your keys.")}
                </h2>
                <p>
                  {tr(
                    "A recovery kit will download to this device. Store it securely outside Black Infinity. It unlocks your vault; we cannot replace it.",
                  )}
                </p>
                <div className="notice">
                  {tr(
                    "Experimental encryption format. Independent review is required before public release.",
                  )}
                </div>
                <button
                  className="btn btn-primary w-100"
                  onClick={() => run(makeVault)}
                >
                  {tr("Create vault & save recovery kit")}
                  <Download size={17} />
                </button>
              </>
            ) : modal === "unlock" ? (
              <>
                <h2 id="dialog-title">{tr("Unlock your private vault.")}</h2>
                <p>
                  {tr(
                    "Keys stay in memory on this device. Lock the vault when you’re done.",
                  )}
                </p>
                <form onSubmit={unlock}>
                  <label htmlFor="recovery">{tr("Vault recovery kit")}</label>
                  <input
                    className="form-control"
                    type="password"
                    name="recovery"
                    id="recovery"
                    required
                    autoComplete="off"
                    placeholder={tr("BI-RECOVERY-1.…")}
                  />
                  <button className="btn btn-primary w-100 mt-3">
                    {tr("Unlock on this device")}
                    <LockKeyhole size={16} />
                  </button>
                </form>
              </>
            ) : modal === "folder" ? (
              <>
                <h2 id="dialog-title">{tr("A place for your collection.")}</h2>
                <p>
                  {tr(
                    "Folder labels are visible to the service. Don’t put private details in them.",
                  )}
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    run(async () => {
                      await api("folders", "POST", { name: f.get("name") });
                      setModal(null);
                      await reload();
                    });
                  }}
                >
                  <label htmlFor="folder-name">{tr("Folder label")}</label>
                  <input
                    className="form-control"
                    id="folder-name"
                    name="name"
                    required
                    maxLength={80}
                  />
                  <button className="btn btn-primary w-100 mt-3">
                    {tr("Create folder")}
                  </button>
                </form>
              </>
            ) : modal === "details" && selected ? (
              <>
                <h2 id="dialog-title">{name(selected)}</h2>
                <p>
                  {tr(bytes(Number(selected.size)))} ·{tr(" ")}
                  {tr(
                    selected.mode === "vault"
                      ? "Client-encrypted vault"
                      : "Managed streaming",
                  )}
                  {tr(" ")}· {tr(selected.status)}
                </p>
                {selected.user_id === me.user.id ? (
                  <>
                    <label htmlFor="move-folder">{tr("Folder")}</label>
                    <select
                      id="move-folder"
                      className="form-select mb-3"
                      value={selected.folder_id || ""}
                      onChange={(e) =>
                        run(async () => {
                          await api(`media/${selected.id}`, "PATCH", {
                            folderId: e.target.value || null,
                          });
                          setSelected({
                            ...selected,
                            folder_id: e.target.value || null,
                          });
                          await reload();
                        })
                      }
                    >
                      <option value="">{tr("No folder")}</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-outline-light w-100 mb-2"
                      onClick={() => setModal("share")}
                    >
                      <Share2 size={16} /> {tr("Share with a member")}
                    </button>
                    {tr(
                      selected.mode === "managed" ? (
                        <button
                          className="btn btn-outline-light w-100 mb-2"
                          onClick={() =>
                            run(async () => {
                              const result = await api(
                                `media/${selected.id}/external`,
                                "POST",
                                {},
                              );
                              await navigator.clipboard.writeText(result.url);
                              setNotice(
                                "Playback link copied. Anyone with it can play for 10 minutes. The server receives the player’s IP.",
                              );
                              setModal(null);
                            })
                          }
                        >
                          <ExternalLink size={16} />{" "}
                          {tr("Copy temporary player link")}
                        </button>
                      ) : null,
                    )}
                    {tr(
                      selected.mode === "managed" ? (
                        <button
                          className="btn btn-outline-light w-100 mb-2"
                          onClick={() =>
                            run(async () => {
                              await api(
                                `media/${selected.id}/process`,
                                "POST",
                                { height: 720 },
                              );
                              setNotice(
                                "720p compatible version queued. The worker will check processing and storage allowances.",
                              );
                              setModal(null);
                            })
                          }
                        >
                          {tr("Create compatible 720p version")}
                        </button>
                      ) : null,
                    )}
                    <button
                      className="btn btn-outline-danger w-100"
                      onClick={() =>
                        run(async () => {
                          await api(`media/${selected.id}`, "PATCH", {
                            trash: !selected.deleted_at,
                          });
                          setModal(null);
                          await reload();
                        })
                      }
                    >
                      {tr(
                        selected.deleted_at ? "Restore media" : "Move to trash",
                      )}
                    </button>
                  </>
                ) : (
                  <p>
                    {tr(
                      "Shared with you. Only the owner can change this media.",
                    )}
                  </p>
                )}
              </>
            ) : modal === "share" && selected ? (
              <>
                <h2 id="dialog-title">{tr("Share on your terms.")}</h2>
                <p>
                  {tr(
                    "Ask the recipient for their member code. Shared downloads cannot be erased remotely.",
                  )}
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    run(async () => {
                      const { recipient } = await api(
                        `recipient?code=${encodeURIComponent(String(f.get("code")))}`,
                      );
                      let wrappedKey = null;
                      if (selected.mode === "vault") {
                        if (!privateKey)
                          throw new Error("Unlock your vault first");
                        if (!recipient.vault_public_key)
                          throw new Error(
                            "Recipient must set up a vault first",
                          );
                        const actual = await keyFingerprint(
                          recipient.vault_public_key,
                        );
                        if (
                          String(f.get("fingerprint") || "").trim() !== actual
                        )
                          throw new Error(
                            "Recipient key fingerprint does not match. Verify it through a trusted channel.",
                          );
                        const file = await openFile(
                          selected.id,
                          selected.metadata,
                          privateKey,
                        );
                        wrappedKey = await wrapForRecipient(
                          file.key,
                          recipient.vault_public_key,
                        );
                      }
                      await api("shares", "POST", {
                        mediaId: selected.id,
                        recipientId: recipient.id,
                        days: Number(f.get("days")),
                        wrappedKey,
                      });
                      setNotice(
                        "Invitation sent. Manage access in Privacy & security.",
                      );
                      setModal(null);
                    });
                  }}
                >
                  <label htmlFor="recipient-code">{tr("Member code")}</label>
                  <input
                    id="recipient-code"
                    name="code"
                    className="form-control"
                    required
                  />
                  <label htmlFor="expiry">{tr("Expires after")}</label>
                  {selected.mode === "vault" ? (
                    <>
                      <label htmlFor="recipient-fingerprint">
                        Verified recipient key fingerprint
                      </label>
                      <input
                        id="recipient-fingerprint"
                        name="fingerprint"
                        className="form-control"
                        required
                        minLength={43}
                        maxLength={43}
                        pattern="[A-Za-z0-9_-]{43}"
                        autoComplete="off"
                      />
                      <p className="small mt-2">
                        Get this from the recipient’s Privacy & security page
                        through a trusted channel. A member code alone does not
                        verify their key.
                      </p>
                    </>
                  ) : null}
                  <select id="expiry" name="days" className="form-select">
                    <option value="1">{tr("1 day")}</option>
                    <option value="7">{tr("7 days")}</option>
                    <option value="30">{tr("30 days")}</option>
                  </select>
                  <button className="btn btn-primary w-100 mt-3">
                    {tr("Share securely")}
                    <Share2 size={16} />
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2 id="dialog-title">
                  {tr("Your space,")}
                  {me.user.alias}.
                </h2>
                <p className="small">
                  {tr("Member code:")}
                  <code>{me.user.referralCode}</code>
                </p>
                <button
                  className="btn btn-outline-light w-100 mb-2"
                  onClick={() =>
                    run(async () => {
                      await navigator.clipboard.writeText(me.user.referralCode);
                      setNotice("Member code copied");
                      setModal(null);
                    })
                  }
                >
                  <Copy size={16} /> {tr("Copy member code")}
                </button>
                <button
                  className="btn btn-outline-light w-100 mb-2"
                  onClick={() => {
                    lock();
                    setModal(null);
                  }}
                >
                  {tr("Lock vault on this device")}
                </button>
                <button
                  className="btn btn-outline-danger w-100"
                  onClick={() =>
                    run(async () => {
                      lock();
                      await api("auth/logout", "POST", {});
                      location.href = "/login";
                    })
                  }
                >
                  <LogOut size={16} /> {tr("Sign out")}
                </button>
              </>
            )}
          </section>
        </div>
      ) : null}
      {playing ? (
        <div className="player-overlay">
          <header>
            <div>
              <span className="eyebrow">{tr("NOW IN YOUR SPACE")}</span>
              <h2>{playing.name}</h2>
            </div>
            <button
              className="icon-button"
              aria-label={tr("Close player")}
              onClick={() => {
                if (playing.url.startsWith("/__vault/"))
                  navigator.serviceWorker.controller?.postMessage({
                    type: "VAULT_CLOSE",
                    handle: playing.url.split("/")[2],
                  });
                setPlaying(null);
              }}
            >
              <X />
            </button>
          </header>
          <video
            ref={video}
            src={playing.url}
            controls
            autoPlay
            playsInline
            onLoadedMetadata={() => {
              const m = media.find((m) => m.id === playing.id);
              if (m?.position && video.current)
                video.current.currentTime = m.position;
            }}
            onPause={() => {
              if (
                video.current &&
                media.find((m) => m.id === playing.id)?.user_id === me.user.id
              )
                api(`media/${playing.id}`, "PATCH", {
                  position: video.current.currentTime,
                }).catch(() => {});
            }}
            onError={() =>
              setError(
                "This browser could not play the file. The codec may be unsupported, or access may have expired.",
              )
            }
            aria-label={playing.name}
          />
          <div className="player-tools">
            <a
              className="btn btn-outline-light btn-sm"
              href={playing.url}
              download={playing.name}
            >
              <Download size={15} />
              {tr("Download your file")}
            </a>
            <label>
              {tr("Playback speed")}
              {tr(" ")}
              <select
                aria-label={tr("Playback speed")}
                className="form-select"
                defaultValue="1"
                onChange={(e) => {
                  if (video.current)
                    video.current.playbackRate = Number(e.target.value);
                }}
              >
                {tr(
                  [0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                    <option key={s} value={s}>
                      {tr(s)}×
                    </option>
                  )),
                )}
              </select>
            </label>
            <span>
              <ShieldCheck size={14} />
              {tr(" ")}
              {tr(
                playing.url.startsWith("/__vault/")
                  ? "Decrypted on this device"
                  : "Authorized managed playback",
              )}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
function Stat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof FolderOpen;
  label: string;
  value: string;
  detail: string;
}) {
  const tr = useTranslation();

  return (
    <div className="stat-card">
      <div className="stat-label">
        <span>{tr(label)}</span>
        <Icon size={17} />
      </div>
      <strong>{tr(value)}</strong>
      <small>{tr(detail)}</small>
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof FolderOpen;
  title: string;
  text: string;
}) {
  const tr = useTranslation();

  return (
    <div className="empty-state">
      <div className="empty-art">
        <Icon size={33} strokeWidth={1.3} />
        <i />
      </div>
      <h2>{tr(title)}</h2>
      <p>{tr(text)}</p>
    </div>
  );
}
function MediaGrid({
  items,
  name,
  play,
  select,
  toggle,
}: {
  items: Media[];
  name: (m: Media) => string;
  play: (m: Media) => void;
  select: (m: Media) => void;
  toggle: (m: Media) => void;
}) {
  const tr = useTranslation();

  if (!items.length)
    return (
      <Empty
        icon={FolderOpen}
        title={tr("A little room for your first favorite.")}
        text="Upload your first audio or video. This space will grow with you."
      />
    );
  return (
    <div className="media-grid">
      {items.map((m, i) => (
        <MediaCard
          key={m.id}
          m={m}
          i={i}
          name={name}
          play={play}
          select={select}
          toggle={toggle}
        />
      ))}
    </div>
  );
}
type Run = (fn: () => Promise<any>) => Promise<any>;
function Rewards({ me, run }: { me: any; run: Run }) {
  const tr = useTranslation();

  const [data, setData] = useState<any>(null),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    run(async () => setData(await api("rewards")));
  }, []);
  const link =
    typeof location === "undefined"
      ? ""
      : `${location.origin}/login?register=1&ref=${me.user.referralCode}`;
  return (
    <>
      <div className="row g-4">
        <div className="col-lg-8">
          <section className="welcome-card reward-hero">
            <div>
              <span className="eyebrow">
                <Gift size={14} /> {tr("MORE ROOM. SHARED GOOD.")}
              </span>
              <h2>
                {tr("A friend joins.")}
                <br />
                <span>{tr("You both get a little more.")}</span>
              </h2>
              <p>
                {tr("Earn 1 GB for 30 days when a referral qualifies.")}
                <br />
                {tr("No cash value. No endless promises.")}
              </p>
              <button
                className="btn btn-light"
                onClick={() =>
                  run(async () => {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                  })
                }
              >
                <Copy size={16} />
                {tr(copied ? "Link copied" : "Copy your invitation link")}
              </button>
            </div>
            <div className="reward-symbol" aria-hidden="true">
              ✧
            </div>
          </section>
        </div>
        <div className="col-lg-4">
          <div className="panel reward-level">
            <span className="eyebrow">{tr("YOUR CURRENT LEVEL")}</span>
            <Gift size={36} />
            <h2>{tr(data?.level || "Explorer")}</h2>
            <p>
              {tr(data?.qualified || 0)} {tr("qualified referrals")}
            </p>
            <div className="storage-track">
              <i
                style={{
                  width: `${Math.min(100, ((data?.qualified || 0) / 3) * 100)}%`,
                }}
              />
            </div>
            <small>{tr("3 qualified referrals unlock Connector")}</small>
          </div>
        </div>
      </div>
      <section className="panel p-4 mt-4">
        <h2>{tr("Thoughtful rewards. Clear rules.")}</h2>
        <div className="row g-4 mt-1">
          {tr(
            [
              [
                "01",
                "A real invitation",
                "Your friend joins the invited beta with a passkey. No real name required.",
              ],
              [
                "02",
                "A little time to settle",
                "Their account and one retained upload must both be at least seven days old.",
              ],
              [
                "03",
                "A little more space",
                "You each receive 1 GB for 30 days, subject to the published campaign caps.",
              ],
            ].map(([n, title, text]) => (
              <div className="col-md-4" key={n}>
                <span className="step-number">{tr(n)}</span>
                <h3>{tr(title)}</h3>
                <p>{tr(text)}</p>
              </div>
            )),
          )}
        </div>
        <p className="small">
          {tr(
            "Five rewarded referrals per rolling 30 days. Maximum 5 GB active bonus storage. Beta campaign budget: $5/month; campaigns pause before making unfunded awards. No rewards for clicks, ad views, or repeated logins.",
          )}
        </p>
      </section>
      <section className="panel p-4 mt-4">
        <h2>{tr("Your credit history")}</h2>
        {tr(
          data?.entries?.length ? (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>{tr("Reward")}</th>
                    <th>{tr("Credit")}</th>
                    <th>{tr("Status")}</th>
                    <th>{tr("Expires")}</th>
                  </tr>
                </thead>
                <tbody>
                  {tr(
                    data.entries.map((r: any) => (
                      <tr key={r.id}>
                        <td>{tr(r.kind)}</td>
                        <td>
                          {tr(r.gb)} {tr("GB")}
                        </td>
                        <td>{tr(r.state)}</td>
                        <td>
                          {tr(
                            r.expires_at
                              ? new Date(r.expires_at).toLocaleDateString()
                              : "—",
                          )}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              {tr("No credits earned yet. Qualified rewards will appear here.")}
            </p>
          ),
        )}
      </section>
      <section className="panel p-4 mt-4">
        <h2>{tr("Something doesn’t look right?")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              await api("appeals", "POST", { message: f.get("message") });
              alert("Your appeal has been recorded for review.");
            });
          }}
        >
          <label htmlFor="appeal">{tr("Tell us what happened")}</label>
          <textarea
            id="appeal"
            name="message"
            className="form-control"
            required
            minLength={10}
            maxLength={2000}
          />
          <button className="btn btn-outline-light mt-3">
            {tr("Submit an appeal")}
          </button>
        </form>
      </section>
    </>
  );
}
function Partners({ me, run }: { me: any; run: Run }) {
  const tr = useTranslation();

  const [data, setData] = useState<any>(null),
    [qr, setQr] = useState("");
  const load = async () => setData(await api("partners"));
  useEffect(() => {
    run(load);
  }, []);
  return (
    <>
      <div className="notice">
        <ShieldCheck size={20} />
        <div>
          <strong>{tr("Cash commissions unavailable.")}</strong>
          <p>
            {tr(
              "No withdrawable balances accrue. Proposed commissions require verified payouts, eligibility, terms, and funding.",
            )}
          </p>
        </div>
      </div>
      <div className="row g-4">
        <div className="col-lg-8">
          <section className="panel p-4">
            <span className="eyebrow">{tr("THE WEBMASTER PROGRAM")}</span>
            <h2 className="mt-3">
              {tr("A partnership with clear boundaries.")}
            </h2>
            <p>
              {tr(
                "Approved partners get campaign links, QR codes, promotional copy, and conversion reporting. Customer identities and private media stay private.",
              )}
            </p>
            {tr(
              data?.partner ? (
                <>
                  <span className="badge text-bg-secondary">
                    {tr("Application:")}
                    {tr(data.partner.status)}
                  </span>
                  {tr(
                    data.partner.status === "approved" ? (
                      <form
                        className="mt-4"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          run(async () => {
                            await api("campaigns", "POST", {
                              name: f.get("name"),
                            });
                            await load();
                          });
                        }}
                      >
                        <label htmlFor="campaign-name">
                          {tr("New campaign name")}
                        </label>
                        <input
                          id="campaign-name"
                          name="name"
                          className="form-control"
                          required
                          maxLength={80}
                        />
                        <button className="btn btn-primary mt-3">
                          {tr("Create campaign")}
                        </button>
                      </form>
                    ) : (
                      <p className="mt-3">
                        {tr(
                          "Your application is waiting for an administrator’s review.",
                        )}
                      </p>
                    ),
                  )}
                </>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    run(async () => {
                      await api("partners", "POST", {
                        website: f.get("website"),
                        note: f.get("note"),
                      });
                      await load();
                    });
                  }}
                >
                  <label htmlFor="website">{tr("Your website")}</label>
                  <input
                    id="website"
                    name="website"
                    type="url"
                    className="form-control"
                    placeholder={tr("https://your-site.example")}
                    required
                  />
                  <label htmlFor="partner-note">
                    {tr("How will you introduce Black Infinity?")}
                  </label>
                  <textarea
                    id="partner-note"
                    name="note"
                    className="form-control"
                    maxLength={1000}
                  />
                  <button className="btn btn-primary mt-3">
                    {tr("Apply to the program")}
                    <ArrowUpRight size={16} />
                  </button>
                </form>
              ),
            )}
          </section>
        </div>
        <div className="col-lg-4">
          <section className="panel p-4">
            <span className="eyebrow">{tr("PROPOSED, NOT ACTIVE")}</span>
            <h2 className="commission-number">
              10<span>%</span>
            </h2>
            <p>
              {tr(
                "Of eligible settled revenue for the first three paid months.",
              )}
            </p>
            <ul className="plain-list">
              <li>{tr("45-day minimum hold")}</li>
              <li>{tr("Refunds, fees, and taxes excluded")}</li>
              <li>{tr("No self-referrals or click payments")}</li>
              <li>{tr("No double rewards per conversion")}</li>
            </ul>
          </section>
        </div>
      </div>
      <section className="panel p-4 mt-4">
        <h2>{tr("Your campaigns")}</h2>
        {data?.campaigns?.length ? (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>{tr("Campaign")}</th>
                  <th>{tr("Tracked visits")}</th>
                  <th>{tr("Link")}</th>
                  <th>{tr("QR")}</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c: any) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{tr(c.visits)}</td>
                    <td>
                      <button
                        className="subtle-button"
                        onClick={() =>
                          run(async () =>
                            navigator.clipboard.writeText(
                              `${location.origin}/r/${c.tag}`,
                            ),
                          )
                        }
                      >
                        {tr("Copy link")}
                      </button>
                    </td>
                    <td>
                      <button
                        className="subtle-button"
                        onClick={() =>
                          run(async () => {
                            const QR = await import("qrcode");
                            setQr(
                              await QR.toDataURL(
                                `${location.origin}/r/${c.tag}`,
                                { width: 220 },
                              ),
                            );
                          })
                        }
                      >
                        {tr("Generate")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>
            {tr("No campaigns yet. Approved partners can create one here.")}
          </p>
        )}
        {tr(
          qr ? (
            <img
              src={qr}
              width={220}
              height={220}
              alt={tr("Campaign referral QR code")}
            />
          ) : null,
        )}
        <button
          className="btn btn-outline-light btn-sm mt-2"
          onClick={() =>
            download(
              "black-infinity-campaigns.json",
              JSON.stringify(data?.campaigns || [], null, 2),
            )
          }
        >
          <Download size={15} /> {tr("Export campaign statement")}
        </button>
      </section>
      <section className="panel p-4 mt-4">
        <h2>{tr("Approved promotional copy")}</h2>
        <p>
          {tr(
            "“A private home for your media. Black Infinity offers an encrypted vault and clearly labeled managed streaming. Invitation-only beta.”",
          )}
        </p>
        <p className="small">
          {tr(
            "Required disclosure: “I may receive a benefit for qualifying referrals.” Never claim guaranteed earnings, complete anonymity, or independently certified encryption.",
          )}
        </p>
      </section>
    </>
  );
}
function Privacy({
  me,
  run,
  lock,
  setModal,
}: {
  me: any;
  run: Run;
  lock: () => void;
  setModal: (m: string) => void;
}) {
  const tr = useTranslation();

  const [data, setData] = useState<any>(null),
    [shares, setShares] = useState<any[]>([]);
  const [keyId, setKeyId] = useState("");
  useEffect(() => {
    if (me.user.vaultPublicKey)
      keyFingerprint(me.user.vaultPublicKey)
        .then(setKeyId)
        .catch(() => {});
  }, [me.user.vaultPublicKey]);
  const load = async () => {
    const [p, s] = await Promise.all([api("privacy"), api("shares")]);
    setData(p);
    setShares(s.shares);
  };
  useEffect(() => {
    run(load);
  }, []);
  return (
    <>
      <section className="privacy-summary">
        <div className="icon-bubble">
          <ShieldCheck size={26} />
        </div>
        <div>
          <span className="eyebrow">{tr("A CLEARER PICTURE")}</span>
          <h2>{tr("You’re in control here.")}</h2>
          <p>
            {tr(
              "No real name required. No trackers inside. Your vault keys belong to you.",
            )}
          </p>
        </div>
        <Link href="/trust">
          {tr("Read the full promise")}
          <ArrowUpRight size={15} />
        </Link>
      </section>
      <div className="row g-4 mt-1">
        <div className="col-lg-6">
          <section className="panel p-4 h-100">
            <div className="section-title">
              <h2>
                <LockKeyhole size={18} /> {tr("Your encrypted vault")}
              </h2>
              {keyId ? (
                <div className="key-fingerprint">
                  <label>Your public key fingerprint</label>
                  <code>{keyId}</code>
                  <button
                    className="subtle-button d-block"
                    onClick={() =>
                      run(async () => navigator.clipboard.writeText(keyId))
                    }
                  >
                    Copy fingerprint
                  </button>
                </div>
              ) : null}
              <span className="badge text-bg-secondary">
                {me.user.vaultPublicKey ? "Configured" : "Not set up"}
              </span>
            </div>
            <p>
              {tr(
                "A separate recovery kit unlocks your media. Account recovery codes do not decrypt it. Keep both secure.",
              )}
            </p>
            <button
              className="btn btn-outline-light"
              onClick={() =>
                setModal(me.user.vaultPublicKey ? "unlock" : "create-vault")
              }
            >
              {me.user.vaultPublicKey ? "Unlock vault" : "Create vault"}
            </button>
            <button className="subtle-button ms-3" onClick={lock}>
              {tr("Lock now")}
            </button>
          </section>
        </div>
        <div className="col-lg-6">
          <section className="panel p-4 h-100">
            <h2>
              <Fingerprint size={18} /> {tr("Passkeys")}
            </h2>
            <p>
              {tr(data?.passkeys?.length || 0)}{" "}
              {tr(
                "passkeys registered. Device verification is required at sign-in.",
              )}
            </p>
            <button
              className="btn btn-outline-light"
              onClick={() =>
                run(async () => {
                  const options = await api("auth/passkey/options", "POST", {});
                  const response = await startRegistration({
                    optionsJSON: options,
                  });
                  await api("auth/passkey/verify", "POST", response);
                  await load();
                })
              }
            >
              {tr("Add another passkey")}
            </button>
            <button
              className="subtle-button d-block mt-3"
              onClick={() =>
                run(async () => {
                  const result = await api(
                    "privacy/recovery-codes",
                    "POST",
                    {},
                  );
                  download(
                    "black-infinity-account-recovery.txt",
                    result.codes.join("\n"),
                    "text/plain",
                  );
                })
              }
            >
              Replace account recovery codes
            </button>
            {data?.passkeys?.map((p: any) => (
              <div className="setting-row" key={p.id}>
                <small>{new Date(p.created_at).toLocaleDateString()}</small>
                <button
                  disabled={data.passkeys.length < 2}
                  className="subtle-button"
                  onClick={() =>
                    run(async () => {
                      await api(
                        `privacy/passkey/${encodeURIComponent(p.id)}`,
                        "DELETE",
                      );
                      lock();
                      location.href = "/login";
                    })
                  }
                >
                  Remove passkey & sign out
                </button>
              </div>
            ))}
            <p className="small mt-3">
              {tr(
                "Recovery email is optional and unavailable until verified mail delivery is configured.",
              )}
            </p>
          </section>
        </div>
      </div>
      <section className="panel p-4 mt-4">
        <h2>{tr("Active sessions")}</h2>
        {tr(
          data?.sessions?.map((s: any) => (
            <div className="setting-row" key={s.id}>
              <div>
                <strong>
                  {tr(s.current ? "This session" : "Another session")}
                </strong>
                <small>
                  {tr("Created")}
                  {tr(new Date(s.createdAt).toLocaleString())} {tr("· expires")}
                  {tr(" ")}
                  {tr(new Date(s.expiresAt).toLocaleDateString())}
                </small>
              </div>
              <button
                className="btn btn-outline-light btn-sm"
                onClick={() =>
                  run(async () => {
                    await api("privacy/revoke", "POST", { id: s.id });
                    if (s.current) location.href = "/login";
                    else await load();
                  })
                }
              >
                {tr("Revoke")}
              </button>
            </div>
          )),
        )}
      </section>
      <section className="panel p-4 mt-4">
        <h2>{tr("Sharing permissions")}</h2>
        {shares.length ? (
          shares.map((s) => (
            <div className="setting-row" key={s.id}>
              <div>
                <strong>
                  {s.mode === "vault" ? "Encrypted media" : s.name}
                </strong>
                <small>
                  {tr(
                    s.revoked_at
                      ? "Revoked"
                      : `Expires ${new Date(s.expires_at).toLocaleDateString()}`,
                  )}
                </small>
              </div>
              <button
                className="btn btn-outline-light btn-sm"
                disabled={Boolean(s.revoked_at)}
                onClick={() =>
                  run(async () => {
                    await api(`shares/${s.id}`, "DELETE");
                    await load();
                  })
                }
              >
                {tr("Revoke access")}
              </button>
            </div>
          ))
        ) : (
          <p>{tr("No outgoing shares.")}</p>
        )}
      </section>
      <section className="panel p-4 mt-4">
        <h2>{tr("Notification privacy")}</h2>
        <p>
          {tr(
            "Push messages never contain media names or decryption keys. Subscriptions:",
          )}
          {tr(data?.subscriptions || 0)}.
        </p>
        <button
          className="btn btn-outline-light me-2"
          disabled={!me.features.push}
          onClick={() =>
            run(async () => {
              const permission = await Notification.requestPermission();
              if (permission !== "granted")
                throw new Error("Notifications were not permitted");
              const registration = await navigator.serviceWorker.ready;
              const key = Uint8Array.from(
                atob(me.pushKey.replace(/-/g, "+").replace(/_/g, "/")),
                (c) => c.charCodeAt(0),
              );
              const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: key,
              });
              await api("push", "POST", subscription.toJSON());
              await load();
            })
          }
        >
          {tr(me.features.push ? "Enable Web Push" : "Web Push not configured")}
        </button>
        <button
          className="subtle-button"
          onClick={() =>
            run(async () => {
              await api("privacy/push", "DELETE");
              const registration = await navigator.serviceWorker.ready;
              await (
                await registration.pushManager.getSubscription()
              )?.unsubscribe();
              await load();
            })
          }
        >
          {tr("Remove subscriptions")}
        </button>
      </section>
      <section className="panel p-4 mt-4">
        <h2>{tr("Your data, in your hands.")}</h2>
        <p>
          {tr(
            "Export your account records to this signed-in browser. Vault data stays encrypted and requires your recovery kit.",
          )}
        </p>
        <a
          className="btn btn-outline-light"
          href="/api/v1/privacy/export"
          download
        >
          <Download size={16} /> {tr("Export account data")}
        </a>
      </section>
      <section className="panel p-4 mt-4 danger-panel">
        <h2>{tr("Leave on your terms.")}</h2>
        <p>
          {tr(
            "Deletion immediately revokes sessions and sharing. Active data is scheduled for removal by the worker; backup expiry and any lawful exceptions are described in retention.",
          )}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              await api("privacy/delete", "POST", {
                confirmation: f.get("confirmation"),
              });
              lock();
              location.href = "/";
            });
          }}
        >
          <label htmlFor="delete-confirm">{tr("Type DELETE MY ACCOUNT")}</label>
          <input
            id="delete-confirm"
            name="confirmation"
            className="form-control"
            required
            pattern="DELETE MY ACCOUNT"
            autoComplete="off"
          />
          <button className="btn btn-outline-danger mt-3">
            {tr("Delete my account")}
          </button>
        </form>
      </section>
    </>
  );
}
function Connections({ me, run }: { me: any; run: Run }) {
  const tr = useTranslation();

  const [telegramUrl, setTelegramUrl] = useState("");
  return (
    <>
      <div className="notice">
        <ShieldCheck size={20} />
        <p>
          {tr(
            "Connecting a provider can reveal your account identity to it. Importing plaintext into the vault does not retroactively encrypt the provider’s copy.",
          )}
        </p>
      </div>
      <section className="panel p-4 mb-4">
        <h2>{tr("Telegram account linking")}</h2>
        <p>
          {tr(
            "Imports arrive as managed media. Telegram and the import service can access plaintext during transfer. Cloud Bot API imports are limited to 20 MB.",
          )}
        </p>
        <button
          className="btn btn-outline-light"
          disabled={!me.features.telegram}
          onClick={() =>
            run(async () => {
              const result = await api("connections/telegram", "POST", {
                consent: true,
              });
              setTelegramUrl(result.url);
            })
          }
        >
          {tr("I understand · generate connection link")}
        </button>
        {tr(
          telegramUrl ? (
            <p className="mt-3">
              <a
                className="text-link"
                href={telegramUrl}
                target="_blank"
                rel="noreferrer"
              >
                {tr("Open bot to finish linking")}
                <ExternalLink size={14} />
              </a>
            </p>
          ) : null,
        )}
        <button
          className="subtle-button ms-3"
          onClick={() =>
            run(async () => {
              await api("connections/telegram", "DELETE");
              setTelegramUrl("");
            })
          }
        >
          {tr("Disconnect Telegram")}
        </button>
      </section>
      <div className="row g-4">
        {[
          {
            name: "Telegram",
            symbol: "↗",
            status: me.features.telegram
              ? "Bot configured · explicit consent required"
              : "Not configured",
            text: "Explicit bot linking and permitted imports. Cloud chat and bot transfers are not end-to-end encrypted.",
            href: "https://telegram.org",
          },
          {
            name: "TeraBox",
            symbol: "T",
            status: "Direct integration unavailable",
            text: "No permitted playback adapter has been verified. Open TeraBox yourself or upload a file you are authorized to use.",
            href: "https://www.terabox.com",
          },
          {
            name: "Google Drive",
            symbol: "△",
            status: "Project documentation only",
            text: "The development workspace can use Drive and Sheets for documentation. This is not a user-media integration.",
            href: "https://drive.google.com",
          },
        ].map((c) => (
          <div className="col-lg-4" key={c.name}>
            <article className="panel connection-card">
              <div className="provider-symbol">{tr(c.symbol)}</div>
              <h2>{c.name}</h2>
              <span className="provider-state">{tr(c.status)}</span>
              <p>{tr(c.text)}</p>
              <a
                className="btn btn-outline-light w-100"
                href={c.href}
                target="_blank"
                rel="noreferrer"
              >
                {tr("Open provider directly")}
                <ExternalLink size={15} />
              </a>
              <small>
                {tr("Direct access exposes your IP to this provider.")}
              </small>
            </article>
          </div>
        ))}
      </div>
      <section className="panel p-4 mt-4">
        <h2>{tr("Media privacy relay")}</h2>
        <p>
          {tr(
            "Restricted to approved managed-media adapters. Not a general proxy. No direct fallback. Public provider activation remains disabled until permission, DNS pinning, egress restrictions, and cost controls pass verification.",
          )}
        </p>
      </section>
    </>
  );
}
function Playlists({
  media,
  play,
  run,
}: {
  media: Media[];
  play: (m: Media) => void;
  run: Run;
}) {
  const tr = useTranslation();

  const [lists, setLists] = useState<any[]>([]);
  const load = async () => setLists((await api("playlists")).playlists);
  useEffect(() => {
    run(load);
  }, []);
  return (
    <div className="row g-4">
      <div className="col-lg-5">
        <section className="panel p-4">
          <h2>{tr("A collection with a little intention.")}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                await api("playlists", "POST", {
                  name: f.get("name"),
                  mediaIds: f.getAll("media"),
                });
                await load();
              });
            }}
          >
            <label htmlFor="playlist-name">{tr("Playlist name")}</label>
            <input
              id="playlist-name"
              name="name"
              className="form-control"
              required
              maxLength={80}
            />
            <fieldset className="mt-4">
              <legend className="small">{tr("Choose managed media")}</legend>
              {media
                .filter((m) => m.mode === "managed")
                .map((m) => (
                  <label key={m.id} className="check-label">
                    <input type="checkbox" name="media" value={m.id} />
                    {m.name}
                  </label>
                ))}
            </fieldset>
            <button className="btn btn-primary mt-3">
              {tr("Create playlist")}
              <Plus size={16} />
            </button>
          </form>
        </section>
      </div>
      <div className="col-lg-7">
        {lists.length ? (
          lists.map((p) => (
            <section className="panel p-4 mb-3" key={p.id}>
              <h2>{p.name}</h2>
              {p.media_ids.map((mid: string) => {
                const m = media.find((m) => m.id === mid);
                return m ? (
                  <button
                    key={mid}
                    className="playlist-track"
                    onClick={() => play(m)}
                  >
                    <Play size={16} />
                    {m.name}
                    <span>{tr(bytes(Number(m.size)))}</span>
                  </button>
                ) : null;
              })}
            </section>
          ))
        ) : (
          <Empty
            icon={ListVideo}
            title={tr("Your next collection starts here.")}
            text="Choose managed audio and video to create your first playlist."
          />
        )}
      </div>
    </div>
  );
}
function Admin({ run }: { run: Run }) {
  const tr = useTranslation();
  const editor = useRef<HTMLFormElement>(null),
    [cover, setCover] = useState(""),
    [preview, setPreview] = useState({ title: "", body: "" });

  const [data, setData] = useState<any>(null),
    [invite, setInvite] = useState("");
  const load = async () => setData(await api("admin"));
  useEffect(() => {
    run(load);
  }, []);
  if (!data)
    return (
      <section className="panel p-4">
        <p>
          {tr(
            "Loading owner console. Recent passkey verification is required.",
          )}
        </p>
      </section>
    );
  if (data.role !== "owner")
    return <DelegatedAdmin data={data} run={run} reload={load} />;
  return (
    <>
      <div className="row g-3">
        <div className="col-md-4">
          <Stat
            icon={Fingerprint}
            label="Beta accounts"
            value={`${data.users.filter((u: any) => !u.deleted_at).length} / 25`}
            detail="invitation-only registration"
          />
        </div>
        <div className="col-md-4">
          <Stat
            icon={Gift}
            label="Reward liability"
            value={`$${(Number(data.rewardLiability.cents) / 100).toFixed(2)}`}
            detail="$5 monthly promotion budget"
          />
        </div>
        <div className="col-md-4">
          <Stat
            icon={Globe2}
            label="Relay usage"
            value={bytes(Number(data.relayUsage.bytes))}
            detail="50 GB global monthly ceiling"
          />
        </div>
      </div>
      <div className="notice mt-4">
        <AlertTriangle size={20} />
        <div>
          <strong>{tr("Release gates remain closed.")}</strong>
          <p>
            {tr(
              "Live payments, cash commissions, public provider adapters, crypto certification, and verified production backups are not enabled.",
            )}
          </p>
        </div>
      </div>
      <section className="panel p-4 mt-4">
        <div className="section-title">
          <h2>{tr("Invitations & accounts")}</h2>
          <button
            className="btn btn-primary btn-sm"
            onClick={() =>
              run(async () => {
                setInvite((await api("admin/invites", "POST", {})).invite);
              })
            }
          >
            <Plus size={16} /> {tr("Create invitation")}
          </button>
        </div>
        {invite ? (
          <div className="notice">
            <code>{invite}</code>
            <button
              className="subtle-button"
              onClick={() =>
                run(async () => navigator.clipboard.writeText(invite))
              }
            >
              {tr("Copy")}
            </button>
          </div>
        ) : null}
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>{tr("Alias")}</th>
                <th>{tr("Role")}</th>
                <th>{tr("Plan")}</th>
                <th>{tr("Status")}</th>
                <th>{tr("Control")}</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u: any) => (
                <tr key={u.id}>
                  <td>{u.alias}</td>
                  <td>
                    <select
                      aria-label={`Role for ${u.alias}`}
                      className="form-select"
                      value={u.role}
                      disabled={u.role === "owner" || Boolean(u.deleted_at)}
                      onChange={(e) =>
                        run(async () => {
                          await api("admin/role", "PATCH", {
                            id: u.id,
                            role: e.target.value,
                          });
                          await load();
                        })
                      }
                    >
                      <option value="owner">Owner</option>
                      <option value="user">Member</option>
                      <option value="support">Support</option>
                      <option value="moderator">Moderator</option>
                    </select>
                  </td>
                  <td>{tr(u.plan)}</td>
                  <td>
                    {tr(
                      u.deleted_at
                        ? "Deletion requested"
                        : u.suspended
                          ? "Suspended"
                          : "Active",
                    )}
                  </td>
                  <td>
                    <button
                      disabled={u.role === "owner" || Boolean(u.deleted_at)}
                      className="subtle-button"
                      onClick={() =>
                        run(async () => {
                          await api("admin/user", "PATCH", {
                            id: u.id,
                            suspended: !u.suspended,
                          });
                          await load();
                        })
                      }
                    >
                      {tr(u.suspended ? "Restore" : "Suspend")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel p-4 mt-4">
        <h2>{tr("Partner applications")}</h2>
        {data.partners.length ? (
          data.partners.map((p: any) => (
            <div className="setting-row" key={p.user_id}>
              <div>
                <strong>{p.website}</strong>
                <p>{p.note}</p>
                <small>{tr(p.status)}</small>
              </div>
              <button
                className="btn btn-outline-light btn-sm"
                onClick={() =>
                  run(async () => {
                    await api("admin/partner", "PATCH", {
                      id: p.user_id,
                      status: "approved",
                    });
                    await load();
                  })
                }
              >
                {tr("Approve")}
              </button>
              <button
                className="subtle-button"
                onClick={() =>
                  run(async () => {
                    await api("admin/partner", "PATCH", {
                      id: p.user_id,
                      status: "rejected",
                    });
                    await load();
                  })
                }
              >
                {tr("Reject")}
              </button>
            </div>
          ))
        ) : (
          <p>{tr("No applications yet.")}</p>
        )}
      </section>
      <section className="panel p-4 mt-4">
        <h2>{tr("Journal editor")}</h2>
        <p>
          {tr("Plain text publishing. No executable HTML or arbitrary embeds.")}
        </p>
        <form
          ref={editor}
          onChange={(e) => {
            const f = new FormData(e.currentTarget);
            setPreview({
              title: String(f.get("title") || ""),
              body: String(f.get("body") || ""),
            });
          }}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              await api("admin/post", "POST", {
                slug: f.get("slug"),
                locale: f.get("locale"),
                title: f.get("title"),
                body: f.get("body"),
                published: f.get("published") === "on",
                cover: cover || undefined,
                coverAlt: String(f.get("coverAlt") || "") || undefined,
              });
              await load();
            });
          }}
        >
          <div className="row">
            <div className="col-md-8">
              <label htmlFor="post-title">{tr("Title")}</label>
              <input
                id="post-title"
                name="title"
                className="form-control"
                required
                minLength={3}
                maxLength={160}
              />
            </div>
            <div className="col-md-4">
              <label htmlFor="post-language">{tr("Language")}</label>
              <select id="post-language" name="locale" className="form-select">
                <option value="en">{tr("English")}</option>
                <option value="ar">العربية</option>
              </select>
            </div>
          </div>
          <label htmlFor="post-slug">{tr("Slug (reuse to update)")}</label>
          <input
            id="post-slug"
            name="slug"
            className="form-control"
            required
            pattern="[a-z0-9-]+"
          />
          <label htmlFor="post-body">{tr("Article")}</label>
          <textarea
            id="post-body"
            name="body"
            className="form-control"
            rows={7}
            required
            minLength={10}
          />
          <label htmlFor="post-cover">
            Public cover image (not private media)
          </label>
          <input
            id="post-cover"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="form-control"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) run(async () => setCover(await coverImage(file)));
            }}
          />
          <label htmlFor="post-cover-alt">Cover alternative text</label>
          <input
            id="post-cover-alt"
            name="coverAlt"
            className="form-control"
            maxLength={160}
          />
          <details className="mt-3">
            <summary>Preview draft</summary>
            {cover ? (
              <img
                className="blog-cover mt-3"
                src={cover}
                alt="Draft cover preview"
              />
            ) : null}
            <h3 className="mt-3">{preview.title}</h3>
            <p className="post-body">{preview.body}</p>
          </details>
          <label className="check-label">
            <input type="checkbox" name="published" /> {tr("Publish publicly")}
          </label>
          <button className="btn btn-primary mt-2">{tr("Save article")}</button>
        </form>
        <div className="mt-4">
          {data.posts.map((p: any) => (
            <p key={p.id}>
              {p.title} · {tr(p.locale)} ·{" "}
              {tr(p.published ? "Published" : "Draft")}
              <button
                className="subtle-button ms-3"
                onClick={() => {
                  if (!editor.current) return;
                  for (const field of [
                    "title",
                    "slug",
                    "body",
                    "locale",
                    "coverAlt",
                  ]) {
                    const input = editor.current.elements.namedItem(field) as
                      | HTMLInputElement
                      | HTMLTextAreaElement
                      | HTMLSelectElement
                      | null;
                    if (input)
                      input.value =
                        field === "coverAlt"
                          ? p.cover_alt || ""
                          : p[field] || "";
                  }
                  (
                    editor.current.elements.namedItem(
                      "published",
                    ) as HTMLInputElement
                  ).checked = p.published;
                  setCover(p.cover_data || "");
                  setPreview({ title: p.title, body: p.body });
                  editor.current.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Edit article
              </button>
            </p>
          ))}
        </div>
      </section>
      <section className="panel p-4 mt-4">
        <h2>{tr("Job queue")}</h2>
        <button
          className="btn btn-outline-light btn-sm"
          onClick={() =>
            run(async () => {
              await api("admin/worker-tick", "POST", {});
              await load();
            })
          }
        >
          {tr("Run one local worker tick")}
        </button>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>{tr("Kind")}</th>
                <th>{tr("Status")}</th>
                <th>{tr("Attempts")}</th>
                <th>{tr("Failure code")}</th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((j: any) => (
                <tr key={j.id}>
                  <td>{tr(j.kind)}</td>
                  <td>{tr(j.status)}</td>
                  <td>{tr(j.attempts)}</td>
                  <td>
                    {j.last_error || "—"}
                    {j.status === "failed" ? (
                      <button
                        className="subtle-button ms-2"
                        onClick={() =>
                          run(async () => {
                            await api("admin/job", "PATCH", { id: j.id });
                            await load();
                          })
                        }
                      >
                        Retry
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tr(!data.jobs.length ? <p>{tr("No queued jobs.")}</p> : null)}
      </section>
      <section className="panel p-4 mt-4">
        <h2>{tr("Appeals")}</h2>
        <details className="mt-3 mb-3">
          <summary>Review a fraudulent qualification</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                await api("admin/rewards/reverse", "POST", {
                  qualificationUserId: f.get("userId"),
                  reason: f.get("reason"),
                });
                await load();
              });
            }}
          >
            <label htmlFor="qualification-user">
              Qualification account UUID
            </label>
            <input
              id="qualification-user"
              name="userId"
              className="form-control"
              required
            />
            <label htmlFor="reversal-reason">Evidence and reason</label>
            <textarea
              id="reversal-reason"
              name="reason"
              className="form-control"
              minLength={10}
              maxLength={500}
              required
            />
            <button className="btn btn-outline-danger mt-3">
              Append reward reversals
            </button>
          </form>
        </details>
        {tr(
          data.appeals.map((a: any) => (
            <div className="setting-row" key={a.id}>
              <p>{tr(a.message)}</p>
              <small>{tr(a.status)}</small>
              <button
                className="subtle-button"
                onClick={() =>
                  run(async () => {
                    await api("admin/appeal", "PATCH", {
                      id: a.id,
                      status: "resolved",
                    });
                    await load();
                  })
                }
              >
                Resolve
              </button>
            </div>
          )),
        )}
        {tr(!data.appeals.length ? <p>{tr("No appeals yet.")}</p> : null)}
      </section>
      <section className="panel p-4 mt-4">
        <h2>{tr("Audit trail")}</h2>
        {tr(
          data.audit.map((a: any) => (
            <div className="setting-row" key={a.id}>
              <span>{tr(a.action)}</span>
              <small>{tr(new Date(a.created_at).toLocaleString())}</small>
            </div>
          )),
        )}
      </section>
    </>
  );
}

export function MediaCard({
  m,
  i,
  name,
  play,
  select,
  toggle,
}: { m: Media; i: number } & Omit<Parameters<typeof MediaGrid>[0], "items">) {
  const tr = useTranslation();
  return (
    <article className="media-card" key={m.id}>
      <button
        className={`media-art art-${i % 4} ${m.mode === "vault" ? "vault-art" : ""}`}
        onClick={() => play(m)}
        aria-label={`Play ${name(m)}`}
      >
        <div className="art-orb" />
        <span className="media-type">
          {tr(
            m.mode === "vault" ? (
              <LockKeyhole size={13} />
            ) : m.mime.startsWith("audio") ? (
              <FileAudio size={13} />
            ) : (
              <Film size={13} />
            ),
          )}
          {tr(" ")}
          {tr(m.mode === "vault" ? "PRIVATE VAULT" : "MANAGED")}
        </span>
        <span className="play-orb">
          <Play size={20} fill="currentColor" />
        </span>
        <span className="media-size">{tr(bytes(Number(m.size)))}</span>
      </button>
      <div className="media-info">
        <div>
          <h3 title={name(m)}>{name(m)}</h3>
          <small>
            {tr(
              m.mode === "vault"
                ? "End-to-end encrypted"
                : m.mime.split("/")[1]?.toUpperCase() || "MEDIA",
            )}
            {tr(" ")}
            <span>·</span>
            {tr(" ")}
            {tr(m.status === "ready" ? "Ready to play" : "Upload incomplete")}
          </small>
        </div>
        <button
          className="icon-button"
          aria-label={`Details for ${name(m)}`}
          onClick={() => select(m)}
        >
          <MoreHorizontal size={19} />
        </button>
      </div>
      <div className="media-card-bottom">
        <span>
          <span className="status-dot" />
          {tr(" ")}
          {tr(m.mode === "vault" ? "Your keys" : "Private storage")}
        </span>
        <button
          className={`icon-button ${m.favorite ? "is-favorite" : ""}`}
          aria-label={`${m.favorite ? "Unfavorite" : "Favorite"} ${name(m)}`}
          onClick={() => toggle(m)}
        >
          <Star size={15} fill={m.favorite ? "currentColor" : "none"} />
        </button>
      </div>
    </article>
  );
}
