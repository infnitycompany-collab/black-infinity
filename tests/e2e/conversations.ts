import { expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { verifyCalls } from "./calls";
export async function verifyConversations(owner: Page, other: Page) {
  const headers = { origin: "http://localhost:3100" },
    account = await other.request.get("/api/v1/me").then((r) => r.json());
  await owner.goto("/app/groups");
  await owner
    .getByRole("button", { name: "Create conversation", exact: true })
    .first()
    .click();
  await owner
    .getByLabel("Conversation name", { exact: true })
    .fill("Infinity community");
  await owner.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    owner.getByRole("heading", { name: "Infinity community", exact: true }),
  ).toBeVisible();
  const list = await owner.request
      .get("/api/v1/conversations")
      .then((r) => r.json()),
    group = list.rooms.find((r: any) => r.title === "Infinity community").id;
  expect(
    (await other.request.get(`/api/v1/conversations/${group}`)).status(),
  ).toBe(404);
  const invitation = await owner.request
    .post(`/api/v1/conversations/${group}/invites`, { headers, data: {} })
    .then((r) => r.json());
  expect(
    (
      await other.request.post("/api/v1/conversations/join", {
        headers,
        data: { code: invitation.code },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await other.request.post("/api/v1/conversations/join", {
        headers,
        data: { code: invitation.code },
      })
    ).status(),
  ).toBe(404);
  await owner
    .getByLabel("Message", { exact: true })
    .fill("Welcome to our private group");
  await owner
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(
    owner.getByText("Welcome to our private group", { exact: true }),
  ).toBeVisible();
  const first = await other.request
      .get(`/api/v1/conversations/${group}`)
      .then((r) => r.json()),
    mid = first.messages[0].id;
  const message = {
    body: "Hello from another account",
    clientId: crypto.randomUUID(),
    replyTo: mid,
  };
  const sent = await other.request
    .post(`/api/v1/conversations/${group}/messages`, { headers, data: message })
    .then((r) => r.json());
  const retry = await other.request
    .post(`/api/v1/conversations/${group}/messages`, { headers, data: message })
    .then((r) => r.json());
  expect(retry.id).toBe(sent.id);
  expect(
    (
      await other.request.patch(
        `/api/v1/conversations/${group}/messages/${mid}`,
        { headers, data: { body: "Hacked" } },
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await other.request.post(
        `/api/v1/conversations/${group}/messages/${mid}/pin`,
        { headers, data: {} },
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.request.post(
        `/api/v1/conversations/${group}/messages/${mid}/pin`,
        { headers, data: {} },
      )
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await other.request.post(
        `/api/v1/conversations/${group}/messages/${mid}/reaction`,
        { headers, data: { emoji: "❤️" } },
      )
    ).ok(),
  ).toBeTruthy();
  await other.goto("/app/groups");
  await other.getByRole("button", { name: /Infinity community/ }).click();
  await expect(
    other.getByText("Welcome to our private group", { exact: true }),
  ).toBeVisible();
  const amended = await other.request.patch(
    `/api/v1/conversations/${group}/messages/${sent.id}`,
    { headers, data: { body: "Edited greeting" } },
  );
  expect(amended.ok()).toBeTruthy();
  const view = await other.request
    .get(`/api/v1/conversations/${group}`)
    .then((r) => r.json());
  expect(view.messages.find((m: any) => m.id === sent.id).body).toBe(
    "Edited greeting",
  );
  expect(view.messages.find((m: any) => m.id === mid).reactions[0].emoji).toBe(
    "❤️",
  );
  expect(
    (
      await other.request.post(`/api/v1/conversations/${group}/read`, {
        headers,
        data: { seq: view.messages.at(-1).seq },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await other.request.get("/api/v1/conversations").then((r) => r.json())
    ).rooms.find((r: any) => r.id === group).unread,
  ).toBe(0);
  const channel = await owner.request
    .post("/api/v1/conversations", {
      headers,
      data: { kind: "channel", title: "Infinity announcements" },
    })
    .then((r) => r.json());
  const code = await owner.request
    .post(`/api/v1/conversations/${channel.id}/invites`, { headers, data: {} })
    .then((r) => r.json());
  await other.request.post("/api/v1/conversations/join", {
    headers,
    data: { code: code.code },
  });
  expect(
    (
      await other.request.post(`/api/v1/conversations/${channel.id}/messages`, {
        headers,
        data: { body: "Unauthorized broadcast", clientId: crypto.randomUUID() },
      })
    ).status(),
  ).toBe(403);
  await owner.request.post(`/api/v1/conversations/${channel.id}/messages`, {
    headers,
    data: {
      body: "Community updates, thoughtfully delivered.",
      clientId: crypto.randomUUID(),
    },
  });
  await other.goto("/app/channels");
  await other.getByRole("button", { name: /Infinity announcements/ }).click();
  await expect(
    other.getByText("Only channel owners and administrators can publish."),
  ).toBeVisible();
  await owner.request.patch(`/api/v1/conversations/${channel.id}/members`, {
    headers,
    data: { userId: account.user.id, role: "admin" },
  });
  expect(
    (
      await other.request.post(`/api/v1/conversations/${channel.id}/messages`, {
        headers,
        data: { body: "Administrator update", clientId: crypto.randomUUID() },
      })
    ).ok(),
  ).toBeTruthy();
  await owner.request.patch(`/api/v1/conversations/${channel.id}/members`, {
    headers,
    data: { userId: account.user.id, role: "remove" },
  });
  expect(
    (await other.request.get(`/api/v1/conversations/${channel.id}`)).status(),
  ).toBe(404);
  expect(
    (
      await other.request.post(`/api/v1/conversations/${channel.id}/messages`, {
        headers,
        data: { body: "Removed member", clientId: crypto.randomUUID() },
      })
    ).status(),
  ).toBe(404);
  const direct = await owner.request
    .post("/api/v1/conversations", {
      headers,
      data: {
        kind: "direct",
        title: "Creative catch-up",
        recipient: account.user.id,
      },
    })
    .then((r) => r.json());
  expect(
    (
      await owner.request.post(`/api/v1/conversations/${direct.id}/messages`, {
        headers,
        data: {
          body: "Hello, welcome to Black Infinity!",
          clientId: crypto.randomUUID(),
        },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await other.request.post("/api/v1/conversations/blocks", {
        headers,
        data: {
          account: (await owner.request.get("/api/v1/me").then((r) => r.json()))
            .user.id,
        },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await owner.request.post(`/api/v1/conversations/${direct.id}/messages`, {
        headers,
        data: { body: "Blocked message", clientId: crypto.randomUUID() },
      })
    ).status(),
  ).toBe(403);
  await other.request.delete("/api/v1/conversations/blocks", {
    headers,
    data: {
      account: (await owner.request.get("/api/v1/me").then((r) => r.json()))
        .user.id,
    },
  });
  await owner.request.patch(`/api/v1/conversations/${group}/preferences`, {
    headers,
    data: { muted: true, archived: true },
  });
  expect(
    (
      await owner.request.get("/api/v1/conversations").then((r) => r.json())
    ).rooms.find((r: any) => r.id === group).archived,
  ).toBe(true);
  await owner.request.patch(`/api/v1/conversations/${group}/preferences`, {
    headers,
    data: { muted: false, archived: false },
  });
  expect(
    (
      await owner.request.post(`/api/v1/conversations/${group}/leave`, {
        headers,
        data: {},
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await other.request.delete(`/api/v1/conversations/${group}`, { headers })
    ).status(),
  ).toBe(403);
  await mkdir("docs/screenshots", { recursive: true });
  await verifyCalls(owner, other, channel.id, account.user.id);
  for (const [section, title] of [
    ["chats", "Creative catch-up"],
    ["groups", "Infinity community"],
    ["channels", "Infinity announcements"],
  ]) {
    await owner.goto(`/app/${section}`);
    await owner.getByRole("button", { name: new RegExp(title) }).click();
    await expect(
      owner.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    for (const [variant, width, height] of [
      ["desktop", 1440, 1080],
      ["tablet", 768, 1024],
      ["mobile", 375, 812],
    ] as const) {
      await owner.setViewportSize({ width, height });
      expect(
        await owner.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await owner.screenshot({
        path: `docs/screenshots/${section}-thread-${variant}.png`,
        animations: "disabled",
        fullPage: true,
      });
    }
  }
  await owner.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await owner
      .locator(".social-message")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await owner.setViewportSize({ width: 1440, height: 1080 });
  const accessibility = await new AxeBuilder({ page: owner })
    .include(".social-shell")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await owner.emulateMedia({ reducedMotion: "no-preference" });
  await owner.goto("/app/settings");
  await owner.locator("#language").selectOption("ar");
  await owner.goto("/app/channels");
  await owner.getByRole("button", { name: /Infinity announcements/ }).click();
  await expect(owner.locator("html")).toHaveAttribute("dir", "rtl");
  for (const [variant, width, height] of [
    ["desktop", 1440, 1080],
    ["tablet", 768, 1024],
    ["mobile", 375, 812],
  ] as const) {
    await owner.setViewportSize({ width, height });
    await owner.screenshot({
      path: `docs/screenshots/channels-arabic-${variant}.png`,
      animations: "disabled",
      fullPage: true,
    });
  }
  await owner.goto("/app/settings");
  await owner.locator("#language").selectOption("en");
  await owner.setViewportSize({ width: 1440, height: 1080 });
  await owner.goto("/app/library");
}
