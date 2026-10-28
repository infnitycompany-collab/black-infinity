import { NextRequest, NextResponse } from "next/server";
import { database, one, id } from "@/lib/db";
import { limit, origin } from "@/lib/security";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tag: string }> },
) {
  const { tag } = await params;
  if (!/^[A-Za-z0-9_-]{16}$/.test(tag))
    return NextResponse.redirect(new URL("/login", origin()));
  await limit("campaign-visit", 500, 60);
  const c = await one(
    "SELECT c.id,u.referral_code FROM campaigns c JOIN users u ON u.id=c.user_id JOIN partners p ON p.user_id=u.id WHERE c.tag=$1 AND p.status='approved' AND u.deleted_at IS NULL AND NOT u.suspended",
    [tag],
  );
  if (!c) return NextResponse.redirect(new URL("/login", origin()));
  const seen = req.cookies.get("bi_campaign_seen")?.value;
  if (seen !== tag)
    await (
      await database()
    ).query("INSERT INTO campaign_visits(id,campaign_id) VALUES($1,$2)", [
      id(),
      c.id,
    ]);
  const r = NextResponse.redirect(
    new URL(`/login?register=1&ref=${c.referral_code}`, origin()),
  );
  r.cookies.set("bi_campaign_seen", tag, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin().startsWith("https:"),
    maxAge: 30 * 86400,
    path: "/",
  });
  return r;
}
