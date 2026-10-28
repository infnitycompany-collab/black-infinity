import PublicSite from "@/components/PublicSite";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (!["trust", "pricing", "blog", "terms", "retention"].includes(page))
    notFound();
  return <PublicSite page={page} />;
}
