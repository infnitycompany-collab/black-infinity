import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { verifyConversations } from "./conversations";
test("focused communication and media-call verification", async ({
  page,
  browser,
}) => {
  const invites = JSON.parse(await readFile(".data/e2e-invites.json", "utf8"));
  const register = async (p: Page, code: string, alias: string) => {
    const cdp = await p.context().newCDPSession(p);
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
    await p.getByLabel("Invitation code").fill(code);
    await p.getByRole("checkbox").check();
    await p
      .getByRole("button", { name: "Create account with a passkey" })
      .click();
    await expect(p.getByText("Your account recovery codes.")).toBeVisible();
    const saved = p.waitForEvent("download");
    await p.getByRole("button", { name: "Save recovery codes" }).click();
    await saved;
    await p.getByRole("button", { name: "Continue to your space" }).click();
    await expect(
      p.getByRole("heading", { name: "Your space, at a glance." }),
    ).toBeVisible();
  };
  const offset=process.env.BI_SOCIAL_ONLY==='1'?0:3;
  await register(page, invites[offset], "Infinity Owner");
  const context = await browser.newContext(),
    other = await context.newPage();
  await register(other, invites[offset+1], "Private Member");
  await verifyConversations(page, other);
  await context.close();
});
