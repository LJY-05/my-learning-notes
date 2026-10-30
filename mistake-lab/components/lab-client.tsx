"use client";
import dynamic from "next/dynamic";
// IndexedDB workspaces have no server snapshot. Mount after hydration instead of
// rendering seeded server counts against previously saved browser data.
const Workspace = dynamic(() => import("./lab").then((module) => module.Lab), {
  ssr: false,
  loading: () => (
    <main className="loading" aria-busy="true">
      正在打开 MISTAKE LAB 学习空间…
    </main>
  ),
});
export function LabClient({ section }: { section: string }) {
  return <Workspace section={section} />;
}
