import { NextRequest, NextResponse } from "next/server";
import { body, equal, hash, limit } from "@/lib/security";
import { database, one } from "@/lib/db";
import {
  telegramConfigured,
  telegramCall,
  queueTelegramMedia,
} from "@/lib/telegram";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  if (
    !telegramConfigured() ||
    !equal(
      req.headers.get("x-telegram-bot-api-secret-token") || "",
      process.env.TELEGRAM_WEBHOOK_SECRET || "",
    )
  )
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await limit("telegram-webhook", 120, 60);
    const update = await body(req);
    if (!Number.isSafeInteger(update.update_id))
      return NextResponse.json({ error: "Invalid update" }, { status: 400 });
    const db = await database();
    const inserted = await db.query(
      "INSERT INTO telegram_updates(update_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING update_id",
      [update.update_id],
    );
    if (!inserted.rows.length) return NextResponse.json({ ok: true });
    const message = update.message;
    if (
      message?.chat?.type !== "private" ||
      String(message?.from?.id) !== String(message?.chat?.id)
    )
      return NextResponse.json({ ok: true });
    if (
      typeof message.text === "string" &&
      message.text.startsWith("/start ")
    ) {
      const code = message.text.slice(7).trim();
      const result = await db.query(
        "UPDATE telegram_links SET chat_id=$2,code_hash=NULL,code_expires_at=NULL WHERE code_hash=$1 AND code_expires_at>now() RETURNING user_id",
        [hash(code), String(message.chat.id)],
      );
      await telegramCall("sendMessage", {
        chat_id: message.chat.id,
        text: result.rows.length
          ? "Connected. Send audio/video up to 20 MB to import into managed streaming. These transfers are not E2EE."
          : "Link expired. Generate a new connection link in Black Infinity.",
      });
    } else {
      const link = await one(
        "SELECT user_id FROM telegram_links WHERE chat_id=$1",
        [String(message.chat.id)],
      );
      const file = message.document || message.video || message.audio;
      if (link && file) {
        try {
          await queueTelegramMedia(link.user_id, file);
          await telegramCall("sendMessage", {
            chat_id: message.chat.id,
            text: "Import queued in managed streaming. Private vault imports must be encrypted on your device.",
          });
        } catch {
          await telegramCall("sendMessage", {
            chat_id: message.chat.id,
            text: "Import unavailable. Use an audio/video file under 20 MB and check your storage allowance.",
          });
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 503 },
    );
  }
}
