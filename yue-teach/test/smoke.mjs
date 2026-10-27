import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const root = mkdtempSync(join(tmpdir(), "yueteach-smoke-"));
const packaged = process.argv[2];
try {
  const executable = resolve(
    packaged ||
      (process.platform === "win32"
        ? "yue-teach/node_modules/electron/dist/electron.exe"
        : "yue-teach/node_modules/electron/dist/electron"),
  );
  const env = {
    ...process.env,
    YUETEACH_DESKTOP_DATA: root,
    YUETEACH_SMOKE: "1",
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_CACHE_HOME: join(root, "cache"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((res, reject) => {
    const child = spawn(
      executable,
      [
        ...(!packaged ? [resolve("yue-teach")] : []),
        ...(process.platform === "linux"
          ? ["--no-sandbox", "--ozone-platform=headless"]
          : []),
      ],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (b) => (output += b));
    child.stderr.on("data", (b) => (output += b));
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("Smoke timeout " + output.slice(-2000)));
    }, 40000);
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return reject(Error(`Desktop exit ${code}: ${output.slice(-2000)}`));
      try {
        readFileSync(join(root, "smoke.json"));
        res();
      } catch {
        reject(Error("No smoke result: " + output.slice(-3000)));
      }
    });
  });
  const result = JSON.parse(readFileSync(join(root, "smoke.json"), "utf8"));
  assert.ok(result.heading);
  assert.equal(result.isolated, true);
  assert.ok(Number(result.node.split(".")[0]) >= 24);
  assert.equal(result.profile.qualification, "初中政治");
  await assert.rejects(
    fetch(result.port + "/api/state", { signal: AbortSignal.timeout(1500) }),
  );
  console.log(
    "Packaged desktop smoke passed: embedded Node24+, actual renderer, service stops on exit.",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
