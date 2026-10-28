import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chromium-headless-shell" });
const page = await browser.newPage();
const exceptions = [];
page.on("pageerror", (e) => exceptions.push(e.message));
const r = await page.goto("http://localhost:3200");
if (r.status() !== 200) throw new Error("Homepage unavailable");
const csp = r.headers()["content-security-policy"];
if (!csp?.includes("'nonce-") || csp.includes("'unsafe-eval'"))
  throw new Error("Production script CSP is incorrect");
await page.getByRole("button", { name: "التبديل إلى العربية" }).click();
await page.waitForFunction(() => document.documentElement.dir === "rtl");
await page.goto("http://localhost:3200/login");
await page.getByRole("heading", { name: "أهلاً بك في مساحتك." }).waitFor();
const me = await page.request.get("http://localhost:3200/api/v1/me");
if (me.status() !== 401)
  throw new Error("Anonymous account API access not rejected");
for (const asset of [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
])
  if (!(await page.request.get("http://localhost:3200" + asset)).ok())
    throw new Error("PWA asset unavailable");
if (exceptions.length) throw new Error("Client exception in production bundle");
await browser.close();
console.log(
  "Production bundle smoke passed: nonce CSP, client hydration, Arabic switching, login, anonymous access denial, and PWA assets.",
);
