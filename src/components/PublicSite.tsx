"use client";
import { useTranslation, LanguageSwitch } from "@/lib/locale";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  LockKeyhole,
  Play,
  Globe2,
  Check,
  HardDrive,
} from "lucide-react";
import { useEffect, useState } from "react";
const Scene = dynamic(() => import("./InfinityScene"), { ssr: false });
export function Brand() {
  const tr = useTranslation();

  return (
    <Link href="/" className="brand">
      <span className="brand-icon">
        {/* A local vector keeps the identity crisp without loading the brand artwork. */}
        <img src="/brand/mark-v2.svg" width="36" height="36" alt="" />
      </span>
      <span>
        {tr("black")}
        <span className="brand-light">{tr("infinity")}</span>
        <small>{tr("YOUR PRIVATE MEDIA SPACE")}</small>
      </span>
    </Link>
  );
}
export default function PublicSite({
  page = "home",
  article,
}: {
  page?: string;
  article?: React.ReactNode;
}) {
  const tr = useTranslation();

  const [posts, setPosts] = useState<any[]>([]);
  useEffect(() => {
    if (page === "blog")
      fetch("/api/v1/posts")
        .then((r) => r.json())
        .then((d) => setPosts(d.posts || []));
  }, [page]);
  return (
    <div className="public-site">
      <header className="public-header">
        <Brand />
        <nav aria-label={tr("Main navigation")}>
          <LanguageSwitch />
          <Link href="/trust">{tr("Privacy")}</Link>
          <Link href="/pricing">{tr("Plans")}</Link>
          <Link href="/blog">{tr("Journal")}</Link>
          <Link className="btn btn-outline-light btn-sm" href="/login">
            {tr("Open your space")}
            <ArrowUpRight size={14} />
          </Link>
        </nav>
      </header>
      {page === "home" ? (
        <>
          <main>
            <section className="landing-hero container">
              <div className="eyebrow">
                <span className="status-dot" />{" "}
                {tr("AN INVITATION TO SOMETHING MORE PRIVATE")}
              </div>
              <h1>
                {tr("Your world.")}
                <br />
                {tr("Without the")}
                <span>{tr("noise.")}</span>
              </h1>
              <p>
                {tr("A beautiful home for the media that matters.")}
                <br />
                {tr("Keep it close. Play it smoothly. Share on your terms.")}
              </p>
              <div className="hero-buttons">
                <Link href="/login?register=1" className="btn btn-primary">
                  {tr("Create your private space")}
                  <ArrowRight size={17} />
                </Link>
                <Link href="/trust" className="text-link">
                  {tr("Meet your privacy controls")}
                  <ArrowUpRight size={16} />
                </Link>
              </div>
              <Scene />
              <div className="hero-caption">
                <LockKeyhole size={13} />{" "}
                {tr("CLIENT-ENCRYPTED VAULT · NO TRACKERS IN YOUR SPACE")}
              </div>
            </section>
            <section className="container feature-strip">
              <div>
                <ShieldCheck />
                <h2>{tr("Privacy you can understand.")}</h2>
                <p>
                  {tr(
                    "Two clear modes. Honest boundaries. You choose where your keys live.",
                  )}
                </p>
              </div>
              <div>
                <Play />
                <h2>{tr("Made for the play button.")}</h2>
                <p>
                  {tr(
                    "Your library, playlists, and playback position in one considered space.",
                  )}
                </p>
              </div>
              <div>
                <Globe2 />
                <h2>{tr("At home on every screen.")}</h2>
                <p>
                  {tr(
                    "From your phone to your desktop. Install from a supported browser.",
                  )}
                </p>
              </div>
            </section>
            <section className="container public-callout">
              <span className="eyebrow">{tr("SMALL BY DESIGN")}</span>
              <h2>{tr("A quieter kind of beta.")}</h2>
              <p>
                {tr(
                  "25 invited members. Thoughtful limits. Room to build this properly.",
                )}
              </p>
              <Link href="/login" className="btn btn-outline-light">
                {tr("Have an invitation?")}
                <ArrowUpRight size={16} />
              </Link>
            </section>
          </main>
        </>
      ) : page === "pricing" ? (
        <main className="container public-content">
          <span className="eyebrow">{tr("ROOM FOR YOUR WORLD")}</span>
          <h1>
            {tr("Keep the essentials.")}
            <br />
            <span>{tr("Make room for more.")}</span>
          </h1>
          <p>{tr("Proposed beta plans. Paid checkout is not enabled yet.")}</p>
          <div className="row g-4 mt-4">
            {[
              {
                name: "Free",
                price: "0",
                storage: "2 GB",
                minutes: 15,
                delivery: 10,
              },
              {
                name: "Plus",
                price: "2.99",
                storage: "20 GB",
                minutes: 120,
                delivery: 50,
              },
              {
                name: "Pro",
                price: "6.99",
                storage: "100 GB",
                minutes: 300,
                delivery: 200,
              },
            ].map((p, i) => (
              <div className="col-md-4" key={p.name}>
                <article className={`plan-card ${i === 1 ? "featured" : ""}`}>
                  <span className="eyebrow">{p.name}</span>
                  <h2>
                    ${tr(p.price)}
                    <small>{tr("/ month")}</small>
                  </h2>
                  <p>
                    {tr(p.storage)} {tr("private storage")}
                  </p>
                  <ul>
                    {tr(
                      [
                        "E2EE vault included",
                        `${p.minutes} processing minutes`,
                        `${p.delivery} GB monthly delivery`,
                        "1 GB beta file limit",
                        i
                          ? "Ad-free experience"
                          : "No trackers in your private space",
                      ].map((x) => (
                        <li key={x}>
                          <Check size={16} />
                          {tr(x)}
                        </li>
                      )),
                    )}
                  </ul>
                  <Link
                    className={`btn ${i ? "btn-outline-light" : "btn-primary"} w-100`}
                    href={i ? "/trust" : "/login"}
                  >
                    {tr(i ? "Not yet on sale" : "Enter the beta")}
                  </Link>
                </article>
              </div>
            ))}
          </div>
          <p className="small mt-4">
            {tr(
              "No automatic overages. Storage includes variants and trash. EGP prices await verified payment-provider fees. No lifetime or unlimited promises.",
            )}
          </p>
        </main>
      ) : page === "article" ? (
        article
      ) : page === "blog" ? (
        <main className="container public-content">
          <span className="eyebrow">{tr("THE INFINITY JOURNAL")}</span>
          <h1>
            {tr("Less noise.")}
            <br />
            <span>{tr("More understanding.")}</span>
          </h1>
          <p>
            {tr(
              "Product notes, practical privacy, and a better home for your media.",
            )}
          </p>
          <div className="row g-4 mt-4">
            {posts.length ? (
              posts.map((p) => (
                <div className="col-md-6" key={p.slug + p.locale}>
                  <article className="panel p-4">
                    <span className="eyebrow">
                      {tr(p.locale === "ar" ? "العربية" : "PRODUCT JOURNAL")}
                    </span>
                    {p.cover_data ? (
                      <img
                        className="blog-cover"
                        src={p.cover_data}
                        alt={p.cover_alt || p.title}
                      />
                    ) : null}
                    <h2 className="mt-3">
                      <Link href={`/blog/${p.slug}?locale=${p.locale}`}>
                        {p.title}
                      </Link>
                    </h2>
                    <p className="post-body">
                      {p.body.slice(0, 280)}
                      {p.body.length > 280 ? "…" : ""}
                    </p>
                    <Link
                      href={`/blog/${p.slug}?locale=${p.locale}`}
                      className="text-link"
                    >
                      Read article <ArrowUpRight size={14} />
                    </Link>
                  </article>
                </div>
              ))
            ) : (
              <div className="col-12">
                <div className="empty-state">
                  <HardDrive />
                  <h2>{tr("The first chapter is coming.")}</h2>
                  <p>
                    {tr(
                      "Published articles will appear here. There are no placeholder stories.",
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>
      ) : (
        <Trust page={page} />
      )}
      <footer className="public-footer container">
        <Brand />
        <p>{tr("Private by intention. Transparent by design.")}</p>
        <div>
          <Link href="/trust">{tr("Trust center")}</Link>
          <Link href="/terms">{tr("Terms")}</Link>
          <Link href="/retention">{tr("Retention")}</Link>
          <Link href="/login">{tr("Sign in")}</Link>
        </div>
        <small>
          © {tr(new Date().getFullYear())} {tr("Black Infinity · Private beta")}
        </small>
      </footer>
    </div>
  );
}
function Trust({ page }: { page: string }) {
  const tr = useTranslation();

  return (
    <main className="container public-content trust-content">
      <span className="eyebrow">{tr("TRUST IS EARNED")}</span>
      <h1>
        {tr(
          page === "terms"
            ? "Clear terms."
            : page === "retention"
              ? "Your data has a timeline."
              : "Your privacy. In plain sight.",
        )}
      </h1>
      <p className="lead">
        {tr(
          "Private content, minimal personal data, and clear controls. Our media relay hides your connection address from supported media sources, while Black Infinity’s infrastructure still receives your connection.",
        )}
      </p>
      <div className="notice">
        <ShieldCheck size={20} />
        <div>
          <strong>
            {tr("Development release · no independent security certification")}
          </strong>
          <p>
            {tr(
              "Encryption format review, production infrastructure checks, and legal review are release gates. No complete anonymity or “zero logs” claim.",
            )}
          </p>
        </div>
      </div>
      {[
        [
          "Conversation privacy",
          "Chat messages, groups and channels are service-managed. Black Infinity can access their content and membership. Vault encryption does not apply to chat. Joining a group reveals its existing history to you. Removing access cannot erase copies already read or downloaded.",
        ],
        [
          "Two modes. One informed choice.",
          "The E2EE vault encrypts your files and metadata on your device. Managed streaming allows server processing and external players. Administrators cannot recover vault keys. A downloaded copy cannot be revoked.",
        ],
        [
          "An alias is enough.",
          "Passkeys protect sign-in. No real name or phone number is required. Recovery email is optional and is not enabled until email verification is configured. Payments and providers may collect identifiers separately.",
        ],
        [
          "What remains visible",
          "Infrastructure receives your connection address. The service sees account identifiers, encrypted object sizes, timing, permissions, and usage. Malicious device software or compromised app delivery can undermine encryption.",
        ],
        [
          "A relay, not invisibility",
          "Only approved, permitted managed-media sources can be relayed. The upstream sees the relay IP but account tokens may still identify you. Unsupported providers are not silently opened directly. The relay is disabled until an approved adapter and egress controls pass verification.",
        ],
        [
          "No trackers inside",
          "No advertising scripts, third-party analytics, social widgets, or session replay in authenticated areas. Public advertising is currently disabled too. Fonts and application assets are served locally.",
        ],
        [
          "Retention targets",
          "Raw IP logs: at most 24 hours. Redacted operational logs: 30 days. Flagged security evidence: up to 30 days. Rotating backups: 30 days. These require deployment verification; this local build does not claim a verified production logging policy.",
        ],
        [
          "Leaving should be simple",
          "Deletion immediately revokes account sessions and sharing. The worker removes active private objects and personal records within seven days. Backups expire within 30 days. Disclosed billing or legal obligations may require limited retention.",
        ],
        [
          "Use with care",
          "Adult invited beta only. Upload content you have rights to use. Do not abuse referrals, bypass provider access controls, or upload unlawful content. The beta is provided without an uptime guarantee. Payments and cash rewards are unavailable.",
        ],
        [
          "Recovery is your responsibility",
          "Account recovery codes restore account access only. Your separate vault recovery kit unlocks encrypted content. Losing all copies can permanently lose access. Store your recovery kit securely outside this service.",
        ],
        [
          "Subprocessors and integrations",
          "Local development stores files and PostgreSQL data on this workstation. Production storage, hosting, push delivery, and optional provider integrations must be named here before public launch. Push services receive generic messages and delivery metadata, not media titles.",
        ],
        [
          "Report a concern",
          "The in-app privacy dashboard supports export and deletion. Signed-in users can submit an appeal. A verified public security contact and incident communication channel must be configured before public release.",
        ],
      ].map(([title, text]) => (
        <section className="trust-section" key={title}>
          <h2>{tr(title)}</h2>
          <p>{tr(text)}</p>
        </section>
      ))}
    </main>
  );
}
