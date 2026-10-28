import type { MetadataRoute } from "next";
import { database } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  const posts = (
    await (
      await database()
    ).query(
      "SELECT slug,locale,created_at FROM posts WHERE published ORDER BY created_at DESC LIMIT 1000",
    )
  ).rows;
  return [
    ...["", "/trust", "/pricing", "/blog", "/terms", "/retention"].map((p) => ({
      url: origin + p,
    })),
    ...posts.map((p) => ({
      url: origin + "/blog/" + p.slug + "?locale=" + p.locale,
      lastModified: new Date(p.created_at),
    })),
  ];
}
