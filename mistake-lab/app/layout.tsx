import type { Metadata } from "next";
import { Suspense } from "react";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "./globals.css";
import "./atelier.css";
import { LabProvider } from "@/components/store";
export const metadata: Metadata = {
  title: "MISTAKE LAB — 让每一次错误，成为下一步",
  description: "独立的智能错题学习工作台。采集、理解、复习，让知识真正属于你。",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <LabProvider>
          <Suspense
            fallback={<div className="loading">正在打开 MISTAKE LAB…</div>}
          >
            {children}
          </Suspense>
        </LabProvider>
      </body>
    </html>
  );
}
