import { notFound } from "next/navigation";
import { LabClient as Lab } from "@/components/lab-client";
export function generateStaticParams() {
  return ["library", "reader", "question", "review", "studio", "import"].map(
    (section) => ({ section }),
  );
}
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (
    !["library", "reader", "question", "review", "studio", "import"].includes(
      section,
    )
  )
    notFound();
  return <Lab section={section} />;
}
