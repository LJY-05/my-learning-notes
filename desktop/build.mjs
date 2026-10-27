import { build } from "esbuild";
import { mkdir, copyFile, cp, rm } from "node:fs/promises";
import { resolve } from "node:path";
const out = resolve("desktop/generated");
await mkdir(out, { recursive: true });
const options = {
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  logLevel: "info",
  define: { "import.meta.url": "__studybuddy_bundle_url" },
  banner: {
    js: 'const __studybuddy_bundle_url = require("node:url").pathToFileURL(__filename).href;',
  },
};
await build({
  ...options,
  entryPoints: ["server/index.ts"],
  outfile: out + "/server.cjs",
});
await build({
  ...options,
  entryPoints: ["desktop/migrate.ts"],
  outfile: out + "/migrate.cjs",
});
await copyFile("server/001_init.sql", out + "/001_init.sql");
await copyFile(
  "public/StudyBuddy_备考计划_结合实习课表调整版.xlsx",
  out + "/plan.xlsx",
);
await rm(out + "/web", { recursive: true, force: true });
await cp("dist", out + "/web", { recursive: true });
console.log(
  "Desktop assets prepared; credentials and user databases are excluded.",
);
