import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
async function register(page: Page, code: string, alias: string) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  await page.goto("/login?register=1");
  await page.getByLabel("Your alias").fill(alias);
  await page.getByLabel("Invitation code").fill(code);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create account with a passkey" })
    .click();
  await expect(page.getByText("Your account recovery codes.")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save recovery codes" }).click();
  await download;
  await page.getByRole("button", { name: "Continue to your space" }).click();
  await expect(
    page.getByRole("heading", { name: "Your space, at a glance." }),
  ).toBeVisible();
  return { cdp, authenticatorId };
}
test("real passkeys, managed and encrypted playback, sharing, responsive pages and privacy controls", async ({
  page,
  browser,
}) => {
  const invites = JSON.parse(await readFile(".data/e2e-invites.json", "utf8"));
  for(const path of ['/manifest.webmanifest','/icon-192.png','/icon-512.png','/apple-touch-icon.png'])expect((await page.request.get(path)).ok()).toBeTruthy();
  const ownerAuth = await register(page, invites[0], "Infinity Owner");
  await page.getByRole("button", { name: "Upload media", exact: true }).click();
  await page
    .getByLabel("Your media", { exact: true })
    .setInputFiles(".data/test-video.mp4");
  await page.getByRole("button", { name: "Upload to your space" }).click();
  await expect(page.getByText("Ready in your library")).toBeVisible();
  await page.goto("/app/library");
  await page
    .getByRole("button", { name: "Play test-video.mp4", exact: true })
    .click();
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Close player" }).click();
  // Cross-account resource and admin authorization are checked with a separate real account.
  const second = await browser.newContext(),
    other = await second.newPage();
  await register(other, invites[1], "Private Member");
  const media = await page.request.get("/api/v1/media").then((r) => r.json());
  const mid = media.media[0].id;
  const headers = { origin: "http://localhost:3100" };
  const queued = await page.request.post(`/api/v1/media/${mid}/process`, {
    headers,
    data: { height: 720 },
  });
  expect(queued.ok()).toBeTruthy();
  const output = (await queued.json()).outputId;
  const tick = await page.request.post("/api/v1/admin/worker-tick", {
    headers,
    data: {},
  });
  expect(tick.ok()).toBeTruthy();
  const processed = await page.request
    .get("/api/v1/media")
    .then((r) => r.json());
  expect(processed.media.find((m: any) => m.id === output)?.status).toBe(
    "ready",
  );
  expect(
    (await other.request.get(`/api/v1/media/${mid}/stream`)).status(),
  ).toBe(404);
  expect((await other.request.get("/api/v1/admin")).status()).toBe(403);
  const csrf = await page.request.post("/api/v1/folders", {
    headers: { origin: "https://attacker.invalid" },
    data: { name: "Bad" },
  });
  expect(csrf.status()).toBe(403);
  await page.goto("/app/vault");
  await page.getByRole("button", { name: "Set up vault", exact: true }).click();
  const kitDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Create vault & save recovery kit" })
    .click();
  const kit = await kitDownload;
  const kitPath = await kit.path();
  const recovery = await readFile(kitPath!, "utf8");
  expect(recovery).toMatch(/^BI-RECOVERY-1\./);
  await expect(
    page.getByRole("button", { name: "Lock vault", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Upload media", exact: true }).click();
  await page
    .getByLabel("Your media", { exact: true })
    .setInputFiles(".data/test-video.mp4");
  await page.getByLabel("Privacy mode").selectOption("vault");
  await page.getByRole("button", { name: "Upload to your space" }).click();
  await expect(page.getByText("Ready in your library")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play test-video.mp4", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Play test-video.mp4", exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState),
      { timeout: 30000 },
    )
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Close player" }).click();
  const rows = await page.request.get("/api/v1/media").then((r) => r.json());
  const encrypted = rows.media.find((m: any) => m.mode === "vault");
  expect(encrypted.name).toBe("Encrypted media");
  expect(JSON.stringify(encrypted.metadata)).not.toContain("test-video");
  // Interrupt after the first authenticated chunk, reload, unlock, and resume with the same file/key.
  await page.route("**/chunks/1", (route) => route.abort());
  await page.getByRole("button", { name: "Upload media", exact: true }).click();
  await page
    .getByLabel("Your media", { exact: true })
    .setInputFiles(".data/resume-video.mp4");
  await page.getByLabel("Privacy mode").selectOption("vault");
  await page.getByRole("button", { name: "Upload to your space" }).click();
  await expect(page.locator(".error-banner").first()).toBeVisible();
  const unfinished = (
    await page.request.get("/api/v1/media").then((r) => r.json())
  ).media.find((m: any) => m.status === "uploading");
  expect(unfinished).toBeTruthy();
  const initialStatus = await page.request
    .get(`/api/v1/media/${unfinished.id}/status`)
    .then((r) => r.json());
  expect(initialStatus.chunks).toEqual([0]);
  await page.unroute("**/chunks/1");
  await page.reload();
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await page.getByLabel("Vault recovery kit").fill(recovery);
  await page.getByRole("button", { name: "Unlock on this device" }).click();
  await page.getByRole("button", { name: "Upload media", exact: true }).click();
  await page
    .getByLabel("Your media", { exact: true })
    .setInputFiles(".data/resume-video.mp4");
  await page.getByLabel("Privacy mode").selectOption("vault");
  await page.getByRole("button", { name: "Upload to your space" }).click();
  await expect(page.getByText("Ready in your library")).toBeVisible();
  expect(
    (
      await page.request
        .get(`/api/v1/media/${unfinished.id}/status`)
        .then((r) => r.json())
    ).chunks,
  ).toEqual([0, 1]);
  const cover = await sharp("public/icon.svg")
    .resize(600, 320)
    .jpeg()
    .toBuffer();
  const article = await page.request.post("/api/v1/admin/post", {
    headers,
    data: {
      slug: "privacy-in-practice",
      locale: "en",
      title: "Privacy in practice",
      body: "This article is published by the automated test through the real administrator API. <script>window.injected=true</script> is plain text, not executable HTML.",
      published: true,
      cover: "data:image/jpeg;base64," + cover.toString("base64"),
      coverAlt: "Black Infinity brand illustration",
    },
  });
  expect(article.ok()).toBeTruthy();
  await page.goto("/blog/privacy-in-practice");
  await expect(
    page.getByRole("heading", { name: "Privacy in practice" }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
  await expect(
    page.getByAltText("Black Infinity brand illustration"),
  ).toBeVisible();
  for (const [variant, width, height] of [
    ["desktop", 1440, 1080],
    ["tablet", 768, 1024],
    ["mobile", 375, 812],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `docs/screenshots/article-${variant}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  const recipient = await other.request.get("/api/v1/me").then((r) => r.json());
  // Verify recipient key fingerprints in the actual UI, then decrypt a recipient-wrapped file.
  await other.goto('/app/vault');await other.getByRole('button',{name:'Set up vault',exact:true}).click();const recipientDownload=other.waitForEvent('download');await other.getByRole('button',{name:'Create vault & save recovery kit'}).click();const recipientKit=await recipientDownload;const recipientRecovery=await readFile((await recipientKit.path())!,'utf8');await expect(other.getByRole('button',{name:'Lock vault',exact:true})).toBeVisible();await other.goto('/app/privacy');await expect(other.locator('.key-fingerprint code')).toHaveText(/[A-Za-z0-9_-]{43}/);const recipientFingerprint=(await other.locator('.key-fingerprint code').textContent())!;
  await page.goto('/app/vault');await page.getByRole('button',{name:'Unlock vault',exact:true}).click();await page.getByLabel('Vault recovery kit').fill(recovery);await page.getByRole('button',{name:'Unlock on this device'}).click();await page.getByRole('button',{name:'Details for test-video.mp4',exact:true}).click();await page.getByRole('button',{name:'Share with a member'}).click();await page.getByLabel('Member code',{exact:true}).fill(recipient.user.referralCode);await page.getByLabel('Verified recipient key fingerprint').fill('A'.repeat(43));await page.getByRole('button',{name:'Share securely'}).click();await expect(page.locator('.app-dialog .error-banner')).toContainText('fingerprint does not match');await page.getByLabel('Verified recipient key fingerprint').fill(recipientFingerprint);await page.getByRole('button',{name:'Share securely'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await other.goto('/app/vault');await other.getByRole('button',{name:'Unlock vault',exact:true}).click();await other.getByLabel('Vault recovery kit').fill(recipientRecovery);await other.getByRole('button',{name:'Unlock on this device'}).click();await other.getByRole('button',{name:'Play test-video.mp4',exact:true}).click();await expect.poll(()=>other.locator('video').evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2);await other.getByRole('button',{name:'Close player'}).click();
  const response = await page.request.post("/api/v1/shares", {
    headers: { origin: "http://localhost:3100" },
    data: { mediaId: mid, recipientId: recipient.user.id, days: 1 },
  });
  expect(response.ok()).toBeTruthy();
  expect(
    (
      await other.request.get(`/api/v1/media/${mid}/stream`, {
        headers: { range: "bytes=0-99" },
      })
    ).status(),
  ).toBe(206);
  const shares = await page.request.get("/api/v1/shares").then((r) => r.json());
  await page.request.delete(`/api/v1/shares/${shares.shares[0].id}`, {
    headers: { origin: "http://localhost:3100" },
  });
  expect(
    (await other.request.get(`/api/v1/media/${mid}/stream`)).status(),
  ).toBe(404);
  await mkdir("docs/screenshots", { recursive: true });
  const pages = [
    "chats",
    "groups",
    "channels",
    "overview",
    "library",
    "vault",
    "favorites",
    "playlists",
    "shared",
    "trash",
    "rewards",
    "partners",
    "connections",
    "privacy",
    "settings",
    "notifications",
    "admin",
  ];
  for (const section of pages) {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(section === "overview" ? "/app" : `/app/${section}`);
    await expect(page.locator(".page-heading h1")).toBeVisible();
    await page.screenshot({
      path: `docs/screenshots/${section}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `docs/screenshots/${section}-mobile.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `docs/screenshots/${section}-tablet.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/app");
  await page.screenshot({
    path: "docs/screenshots/overview-tablet.png",
    fullPage: true,
  });
  await page.goto("/app/settings");
  await page.locator("#language").selectOption("ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.goto("/app");
  await page.screenshot({
    path: "docs/screenshots/overview-arabic-tablet.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "docs/screenshots/overview-arabic-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({width:1440,height:1080});await page.screenshot({path:'docs/screenshots/overview-arabic-desktop.png',fullPage:true});
  await page.goto("/app/settings");
  await page.locator("#language").selectOption("en");
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/app");
  await page.locator('.workspace-main').evaluate(el=>Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>undefined))));
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  for (const path of [
    "/",
    "/trust",
    "/terms",
    "/retention",
    "/pricing",
    "/blog",
    "/login",
  ]) {
    await page.goto(path);
    await page.screenshot({
      path: `docs/screenshots/public-${path.slice(1) || "home"}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `docs/screenshots/public-${path.slice(1) || "home"}-mobile.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.screenshot({
      path: `docs/screenshots/public-${path.slice(1) || "home"}-tablet.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1080 });
  }
  await page.goto("/login?register=1");
  await expect(page.getByLabel("Your alias")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/register-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: "docs/screenshots/register-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({
    path: "docs/screenshots/register-tablet.png",
    fullPage: true,
  });
  await page.goto("/login");
  await page
    .getByRole("button", { name: "Lost access to your passkey?" })
    .click();
  await page.screenshot({
    path: "docs/screenshots/recover-tablet.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.screenshot({
    path: "docs/screenshots/recover-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: "docs/screenshots/recover-mobile.png",
    fullPage: true,
  });
  await page.context().setOffline(true);
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "A moment offline." }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/offline-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({width:1440,height:1080});await page.screenshot({path:'docs/screenshots/offline-desktop.png',fullPage:true});await page.setViewportSize({width:768,height:1024});await page.screenshot({path:'docs/screenshots/offline-tablet.png',fullPage:true});
  await page.context().setOffline(false);
  // Recovery rotation and last-passkey protection.
  await page.goto("/app/privacy");
  const keysBefore = await page.request
    .get("/api/v1/privacy")
    .then((r) => r.json());
  expect(
    (
      await page.request.delete(
        `/api/v1/privacy/passkey/${keysBefore.passkeys[0].id}`,
        { headers },
      )
    ).status(),
  ).toBe(409);
  const rotated = await page.request
    .post("/api/v1/privacy/recovery-codes", { headers, data: {} })
    .then((r) => r.json());
  expect(rotated.codes).toHaveLength(8);
  await ownerAuth.cdp.send("WebAuthn.removeVirtualAuthenticator", {
    authenticatorId: ownerAuth.authenticatorId,
  });
  await ownerAuth.cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.getByRole("button", { name: "Add another passkey" }).click();
  await expect
    .poll(
      async () =>
        (await page.request.get("/api/v1/privacy").then((r) => r.json()))
          .passkeys.length,
    )
    .toBe(2);
  expect(
    (
      await page.request.delete(
        `/api/v1/privacy/passkey/${keysBefore.passkeys[0].id}`,
        { headers },
      )
    ).ok(),
  ).toBeTruthy();
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with a passkey" }).click();
  await expect(page.locator(".page-heading h1")).toBeVisible();
  // Delegated roles cannot gain owner privileges or vault access.
  await page.request.patch("/api/v1/admin/role", {
    headers,
    data: { id: recipient.user.id, role: "support" },
  });
  expect((await other.request.get("/api/v1/me")).status()).toBe(401);
  await other.goto("/login");
  await other.getByRole("button", { name: "Continue with a passkey" }).click();
  await expect(other.locator(".page-heading h1")).toBeVisible();
  const delegated = await other.request
    .get("/api/v1/admin")
    .then((r) => r.json());
  expect(delegated.role).toBe("support");
  expect(delegated.managedMedia).toEqual([]);
  expect(
    (
      await other.request.post("/api/v1/admin/invites", { headers, data: {} })
    ).status(),
  ).toBe(403);
  const third = await browser.newContext(),
    moderator = await third.newPage();
  await register(moderator, invites[2], "Review Member");
  const moderatorUser = (
    await moderator.request.get("/api/v1/me").then((r) => r.json())
  ).user;
  await page.request.patch("/api/v1/admin/role", {
    headers,
    data: { id: moderatorUser.id, role: "moderator" },
  });
  await moderator.goto("/login");
  await moderator
    .getByRole("button", { name: "Continue with a passkey" })
    .click();
  await expect(moderator.locator(".page-heading h1")).toBeVisible();
  expect(
    (
      await moderator.request.get(`/api/v1/admin/managed/${encrypted.id}`)
    ).status(),
  ).toBe(404);
  for (const [actor, key] of [
    [other, "support"],
    [moderator, "moderator"],
  ] as const) {
    await actor.goto("/app/admin");
    await expect(
      actor.getByText(
        key === "support"
          ? "Support access: user-submitted appeals only. Owner operations and private media are excluded."
          : "Moderator access: managed media review and appeals. Vault content is excluded.",
      ),
    ).toBeVisible();
    for (const [variant, width, height] of [
      ["desktop", 1440, 1080],
      ["tablet", 768, 1024],
      ["mobile", 375, 812],
    ] as const) {
      await actor.setViewportSize({ width, height });
      await expect
        .poll(() =>
          actor.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await actor.screenshot({
        path: `docs/screenshots/${key}-${variant}.png`,
        fullPage: true,
      });
    }
  }
  await moderator.request.post("/api/v1/admin/moderate", {
    headers,
    data: { id: mid },
  });
  expect(
    (
      await page.request.patch(`/api/v1/media/${mid}`, {
        headers,
        data: { trash: false },
      })
    ).status(),
  ).toBe(403);
  await moderator.request.post("/api/v1/privacy/delete", {
    headers,
    data: { confirmation: "DELETE MY ACCOUNT" },
  });
  expect((await moderator.request.get("/api/v1/me")).status()).toBe(401);
  for (let i = 0; i < 3; i++)
    await page.request.post("/api/v1/admin/worker-tick", { headers, data: {} });
  const accounts = await page.request
    .get("/api/v1/admin")
    .then((r) => r.json());
  expect(accounts.users.find((u: any) => u.id === moderatorUser.id).alias).toBe(
    "Deleted account",
  );
  await third.close();
  await second.close();
});
