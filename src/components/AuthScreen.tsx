"use client";
import { useTranslation, LanguageSwitch } from "@/lib/locale";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import {
  Fingerprint,
  ArrowRight,
  ShieldCheck,
  KeyRound,
  ArrowLeft,
  Download,
  Infinity as InfinityIcon,
} from "lucide-react";
import { Brand } from "./PublicSite";
import { api, download } from "@/lib/client";
export default function AuthScreen() {
  const tr = useTranslation();

  const [mode, setMode] = useState("login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("register"))
      setMode("register");
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      if (mode === "register") {
        const referral =
          new URLSearchParams(location.search).get("ref") || undefined;
        const options = await api("auth/register/options", "POST", {
          alias: f.get("alias"),
          invite: f.get("invite"),
          adult: f.get("adult") === "on",
          referral,
        });
        const response = await startRegistration({ optionsJSON: options });
        const result = await api("auth/register/verify", "POST", response);
        setCodes(result.recoveryCodes);
      } else if (mode === "recover") {
        await api("auth/recover", "POST", { code: f.get("code") });
        location.href = "/app/privacy";
      } else {
        const options = await api("auth/login/options", "POST", {});
        const response = await startAuthentication({ optionsJSON: options });
        await api("auth/login/verify", "POST", response);
        location.href = "/app";
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand />
        <div>
          <div className="eyebrow">
            <span className="status-dot" /> {tr("A SPACE THAT IS YOURS")}
          </div>
          <h1>
            {tr("Some things")}
            <br />
            {tr("are better")}
            <br />
            <span>{tr("kept close.")}</span>
          </h1>
          <p>
            {tr("Your films. Your memories. Your next big idea.")}
            <br />
            {tr("A private home for all of it.")}
          </p>
          <div className="auth-art" aria-hidden="true">
            <InfinityIcon strokeWidth={0.8} />
          </div>
        </div>
        <small>
          <ShieldCheck size={15} />{" "}
          {tr("No real names. No phone numbers. No noise.")}
        </small>
      </aside>
      <main className="auth-main">
        <LanguageSwitch />
        <Link href="/" className="back-link">
          <ArrowLeft size={16} /> {tr("Back to Black Infinity")}
        </Link>
        <div className="auth-card">
          {codes.length ? (
            <>
              <div className="icon-bubble">
                <KeyRound />
              </div>
              <h1>{tr("Your account recovery codes.")}</h1>
              <p>
                {tr(
                  "Each code works once. These recover your account, not your encrypted vault. Store them privately.",
                )}
              </p>
              <button
                className="btn btn-primary w-100"
                onClick={() => {
                  download(
                    "black-infinity-account-recovery.txt",
                    codes.join("\n"),
                    "text/plain",
                  );
                  setSaved(true);
                }}
              >
                <Download size={17} /> {tr("Save recovery codes")}
              </button>
              <details className="mt-3">
                <summary>{tr("Show codes on this device")}</summary>
                <pre className="recovery-codes">{tr(codes.join("\n"))}</pre>
              </details>
              <button
                disabled={!saved}
                className="btn btn-outline-light w-100 mt-3"
                onClick={() => (location.href = "/app")}
              >
                {tr("Continue to your space")}
                <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <>
              <div className="icon-bubble">
                <Fingerprint size={27} />
              </div>
              <span className="eyebrow">{tr("YOUR PRIVATE MEDIA SPACE")}</span>
              <h1>
                {tr(
                  mode === "register"
                    ? "Make yourself at home."
                    : mode === "recover"
                      ? "Find your way back."
                      : "Welcome to your space.",
                )}
              </h1>
              <p>
                {mode === "register"
                  ? "An alias, an invitation, and a passkey. That’s all."
                  : mode === "recover"
                    ? "Use one of your saved account recovery codes."
                    : "Sign in securely with your passkey. Your identity stays yours."}
              </p>
              <form onSubmit={submit} className="auth-form">
                {mode === "register" ? (
                  <>
                    <label htmlFor="alias">{tr("Your alias")}</label>
                    <input
                      id="alias"
                      name="alias"
                      className="form-control"
                      minLength={2}
                      maxLength={40}
                      placeholder={tr("What should we call you?")}
                      required
                      autoComplete="nickname"
                    />
                    <label htmlFor="invite">{tr("Invitation code")}</label>
                    <input
                      id="invite"
                      name="invite"
                      className="form-control"
                      required
                      minLength={20}
                      placeholder={tr("Your private invitation")}
                      autoComplete="off"
                    />
                    <label className="check-label">
                      <input type="checkbox" name="adult" required />{" "}
                      {tr("I’m 18 or older and accept the")}
                      <Link href="/terms">{tr("beta terms")}</Link>.
                    </label>
                  </>
                ) : mode === "recover" ? (
                  <>
                    <label htmlFor="code">{tr("Account recovery code")}</label>
                    <input
                      id="code"
                      name="code"
                      className="form-control"
                      required
                      minLength={32}
                      autoComplete="off"
                      type="password"
                    />
                  </>
                ) : null}
                {error ? (
                  <div role="alert" className="error-banner">
                    {error}
                  </div>
                ) : null}
                <button className="btn btn-primary w-100" disabled={busy}>
                  {tr(
                    busy
                      ? "Waiting for your device…"
                      : mode === "register"
                        ? "Create account with a passkey"
                        : mode === "recover"
                          ? "Recover account"
                          : "Continue with a passkey",
                  )}
                  {tr(" ")}
                  <Fingerprint size={18} />
                </button>
              </form>
              <div className="auth-divider">
                <span>{tr("PRIVATE BY INTENTION")}</span>
              </div>
              <p className="auth-switch">
                {tr(
                  mode === "login" ? (
                    <>
                      {tr("Have an invitation?")}
                      {tr(" ")}
                      <button
                        onClick={() => {
                          setMode("register");
                          setError("");
                        }}
                      >
                        {tr("Create your space")}
                        <ArrowUpRightIcon />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setMode("login");
                        setError("");
                      }}
                    >
                      {tr("Back to sign in")}
                    </button>
                  ),
                )}
              </p>
              {tr(
                mode === "login" ? (
                  <button
                    className="subtle-button"
                    onClick={() => setMode("recover")}
                  >
                    {tr("Lost access to your passkey?")}
                  </button>
                ) : null,
              )}
              <div className="auth-privacy">
                <ShieldCheck size={18} />
                <span>
                  {tr(
                    "Passkeys use your device’s screen lock. We never receive your fingerprint or face data.",
                  )}
                </span>
              </div>
            </>
          )}
        </div>
        <small className="auth-bottom">
          {tr("A quieter corner of the internet.")}
          {tr(" ")}
          <Link href="/trust">{tr("Read our privacy promise")}</Link>
        </small>
      </main>
    </div>
  );
}
function ArrowUpRightIcon() {
  const tr = useTranslation();

  return <span aria-hidden="true">↗</span>;
}
