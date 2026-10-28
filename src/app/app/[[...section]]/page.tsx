import Workspace from "@/components/Workspace";
export default async function App({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  return <Workspace section={section?.[0] || "overview"} />;
}
