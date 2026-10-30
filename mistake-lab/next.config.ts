import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  distDir: process.env.MISTAKE_LAB_TEST === "1" ? ".next-test" : ".next",
  turbopack: { root: process.cwd() },
};
export default config;
