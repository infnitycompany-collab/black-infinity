import { expect, type Page } from "@playwright/test";
async function capture(page: Page, name: string) {
  for (const [variant, width, height] of [
    ["desktop", 1440, 1080],
    ["tablet", 768, 1024],
    ["mobile", 375, 812],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `docs/screenshots/${name}-${variant}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
}
async function guest(owner: Page, alias: string, group: string) {
  const headers = { origin: "http://localhost:3100" },
    invite = await owner.request
      .post("/api/v1/admin/invites", { headers, data: {} })
      .then((r) => r.json());
  const context = await owner.context().browser()!.newContext(),
    p = await context.newPage(),
    cdp = await context.newCDPSession(p);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await p.goto("/login?register=1");
  await p.getByLabel("Your alias").fill(alias);
  await p.getByLabel("Invitation code").fill(invite.invite);
  await p.getByRole("checkbox").check();
  await p
    .getByRole("button", { name: "Create account with a passkey" })
    .click();
  await expect(p.getByText("Your account recovery codes.")).toBeVisible();
  const save = p.waitForEvent("download");
  await p.getByRole("button", { name: "Save recovery codes" }).click();
  await save;
  await p.getByRole("button", { name: "Continue to your space" }).click();
  await expect(
    p.getByRole("heading", { name: "Your space, at a glance." }),
  ).toBeVisible();
  const code = await owner.request
    .post(`/api/v1/conversations/${group}/invites`, { headers, data: {} })
    .then((r) => r.json());
  expect(
    (
      await p.request.post("/api/v1/conversations/join", {
        headers,
        data: { code: code.code },
      })
    ).ok(),
  ).toBeTruthy();
  return { page: p, context };
}
async function enter(
  page: Page,
  section: string,
  title: string,
  video: boolean,
  channel = false,
) {
  await page.context().grantPermissions(["camera", "microphone"], {
    origin: "http://localhost:3100",
  });
  await page.goto(`/app/${section}`);
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await page
    .getByRole("button", {
      name: channel ? "Open channel broadcast" : "Open voice and video call",
      exact: true,
    })
    .click();
  await page.getByRole("checkbox", { name: /Local development only/ }).check();
  await page
    .getByRole("button", {
      name: video
        ? "Join video call"
        : channel
          ? "Watch broadcast"
          : "Join voice call",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Leave call", exact: true }),
  ).toBeVisible();
}
export async function verifyCalls(
  owner: Page,
  other: Page,
  channelId: string,
  otherId: string,
) {
  const headers = { origin: "http://localhost:3100" };
  const direct=(await owner.request.get('/api/v1/conversations').then(r=>r.json())).rooms.find((r:any)=>r.title==='Creative catch-up').id;
  const prior=await owner.request.post(`/api/v1/conversations/${direct}/call`,{headers,data:{allowDirect:true}}).then(r=>r.json());
  const replacement=await owner.request.post(`/api/v1/conversations/${direct}/call`,{headers,data:{allowDirect:true}}).then(r=>r.json());
  await owner.request.post(`/api/v1/conversations/${direct}/call/leave`,{headers,data:{callId:prior.id,participationId:prior.participationId}});
  expect((await owner.request.get(`/api/v1/conversations/${direct}/call?participation=${replacement.participationId}`).then(r=>r.json())).joined).toBe(true);
  await owner.request.post(`/api/v1/conversations/${direct}/call/leave`,{headers,data:{callId:replacement.id,participationId:replacement.participationId}});
  await enter(owner, "chats", "Creative catch-up", true);
  await enter(other, "chats", "Creative catch-up", true);
  for (const page of [owner, other])
    await expect(
      page.locator(".call-tile figcaption").filter({ hasText: "connected" }),
    ).toHaveCount(1, { timeout: 30000 });
  const videoReceived = (page: Page) =>
    page
      .locator(".call-tile video")
      .last()
      .evaluate((v: HTMLVideoElement) => v.readyState >= 2 && v.videoWidth > 0);
  await expect.poll(() => videoReceived(owner), { timeout: 20000 }).toBe(true);
  await expect.poll(() => videoReceived(other), { timeout: 20000 }).toBe(true);
  await owner
    .getByRole("button", { name: "Mute microphone", exact: true })
    .click();
  await expect(
    owner.getByRole("button", { name: "Unmute microphone", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await owner
    .getByRole("button", { name: "Turn camera off", exact: true })
    .click();
  await expect(
    owner.getByRole("button", { name: "Turn camera on", exact: true }),
  ).toBeVisible();
  await owner
    .getByRole("button", { name: "Turn camera on", exact: true })
    .click();
  await expect.poll(() => videoReceived(other)).toBe(true);
  await owner
    .getByRole("button", { name: "Share screen", exact: true })
    .click();
  await expect(
    owner.getByRole("button", { name: "Stop sharing screen", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect.poll(() => videoReceived(other)).toBe(true);
  await expect
    .poll(
      () =>
        owner
          .locator(".call-tile video")
          .first()
          .evaluate(
            (v: HTMLVideoElement) =>
              v.readyState >= 2 &&
              !!(v.srcObject as MediaStream)?.getVideoTracks()[0]?.getSettings()
                .displaySurface,
          ),
      { timeout: 20000 },
    )
    .toBe(true);
  const screenWidth = await owner
    .locator(".call-tile video")
    .first()
    .evaluate((v: HTMLVideoElement) => v.videoWidth);
  await expect
    .poll(
      () =>
        other
          .locator(".call-tile video")
          .last()
          .evaluate((v: HTMLVideoElement) => v.videoWidth),
      { timeout: 20000 },
    )
    .toBe(screenWidth);
  await capture(owner, "private-call");
  await owner
    .getByRole("button", { name: "Stop sharing screen", exact: true })
    .click();
  await owner.getByRole("button", { name: "Leave call", exact: true }).click();
  await other.getByRole("button", { name: "Leave call", exact: true }).click();
  // Exercise the full four-person mesh with real passkeys and synthetic hardware.
  await enter(owner, "groups", "Infinity community", false);
  await enter(other, "groups", "Infinity community", false);
  await expect(
    other.locator(".call-tile figcaption").filter({ hasText: "connected" }),
  ).toHaveCount(1, { timeout: 30000 });
  await expect
    .poll(() =>
      other
        .locator(".call-tile video")
        .last()
        .evaluate(
          (v: HTMLVideoElement) =>
            v.srcObject instanceof MediaStream &&
            v.srcObject.getAudioTracks().length === 1,
        ),
    )
    .toBe(true);
  const group = (
    await owner.request.get("/api/v1/conversations").then((r) => r.json())
  ).rooms.find((r: any) => r.title === "Infinity community").id;
  const third = await guest(owner, "Group Guest Three", group),
    fourth = await guest(owner, "Group Guest Four", group);
  await enter(third.page, "groups", "Infinity community", true);
  await enter(fourth.page, "groups", "Infinity community", true);
  for (const page of [owner, other, third.page, fourth.page])
    await expect(
      page.locator(".call-tile figcaption").filter({ hasText: "connected" }),
    ).toHaveCount(3, { timeout: 30000 }).catch(async error=>{console.error('Group-call diagnostic',await page.locator('.call-panel').allTextContents(),await page.locator('.error-banner').allTextContents());throw error;});
  await capture(owner, "group-call");
  await third.page
    .getByRole("button", { name: "Leave call", exact: true })
    .click();
  await fourth.page
    .getByRole("button", { name: "Leave call", exact: true })
    .click();
  await third.context.close();
  await fourth.context.close();
  await owner.getByRole("button", { name: "Leave call", exact: true }).click();
  await other.getByRole("button", { name: "Leave call", exact: true }).click();
  const code = await owner.request
    .post(`/api/v1/conversations/${channelId}/invites`, { headers, data: {} })
    .then((r) => r.json());
  await other.request.post("/api/v1/conversations/join", {
    headers,
    data: { code: code.code },
  });
  expect(
    (
      await other.request.post(`/api/v1/conversations/${channelId}/call`, {
        headers,
        data: { allowDirect: true },
      })
    ).status(),
  ).toBe(403);
  await enter(owner, "channels", "Infinity announcements", true, true);
  await enter(other, "channels", "Infinity announcements", false, true);
  await expect(
    other.getByRole("button", { name: "Share screen", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(
      () =>
        other
          .locator(".call-tile video")
          .last()
          .evaluate(
            (v: HTMLVideoElement) => v.readyState >= 2 && v.videoWidth > 0,
          ),
      { timeout: 30000 },
    )
    .toBe(true);
  await capture(other, "channel-broadcast");
  await owner.request.patch(`/api/v1/conversations/${channelId}/members`, {
    headers,
    data: { userId: otherId, role: "remove" },
  });
  await expect(
    other.getByRole("button", { name: "Leave call", exact: true }),
  ).toHaveCount(0, { timeout: 15000 });
  await owner.getByRole("button", { name: "Leave call", exact: true }).click();
}
