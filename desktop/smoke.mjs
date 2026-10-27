import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const executable = resolve(
  process.argv[2] ||
    (process.platform === "win32"
      ? "desktop/release/win-unpacked/StudyBuddy.exe"
      : "desktop/node_modules/electron/dist/electron"),
);
const source = process.argv.includes("--source");
const root = mkdtempSync(join(tmpdir(), "studybuddy-app-smoke-"));
async function launch() {
  const args = [
    ...(source ? [resolve("desktop")] : []),
    ...(process.platform === "linux"
      ? ["--no-sandbox", "--ozone-platform=headless"]
      : []),
    "--smoke-test",
  ];
  const env = {
    ...process.env,
    STUDYBUDDY_DESKTOP_DATA_PATH: root,
    XDG_CONFIG_HOME: join(root, "xdg-config"),
    XDG_CACHE_HOME: join(root, "xdg-cache"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((res, rej) => {
    const p = spawn(executable, args, {
      env,
      windowsHide: true,
      stdio: "ignore",
    });
    const timer = setTimeout(() => {
      p.kill();
      rej(Error("Desktop smoke timed out"));
    }, 45000);
    p.once("error", (e) => {
      clearTimeout(timer);
      rej(e);
    });
    p.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const error = existsSync(join(root, "desktop-smoke.json"))
          ? readFileSync(join(root, "desktop-smoke.json"), "utf8")
          : "no result";
        rej(Error("Desktop smoke failed: " + error));
      } else res();
    });
  });
  const result = JSON.parse(
    readFileSync(join(root, "desktop-smoke.json"), "utf8"),
  );
  if (
    !result.ok ||
    result.origin !== "studybuddy://studybuddy" ||
    Number(result.node.split(".")[0]) < 24
  )
    throw Error("Invalid desktop runtime result");
  try {
    await fetch(`http://127.0.0.1:${result.port}/api/state`, {
      signal: AbortSignal.timeout(1000),
    });
    throw Error("Backend still running after application exit");
  } catch (e) {
    if (e.message === "Backend still running after application exit") throw e;
  }
  return result;
}
try {
  const first = await launch();
  const second = await launch();
  if (
    first.previouslySaved ||
    !second.previouslySaved ||
    !second.storagePersisted
  )
    throw Error("Desktop restart persistence failed");
  console.log(
    JSON.stringify({
      desktopSmoke: "passed",
      embeddedNode: second.node,
      stableOrigin: second.origin,
      persistence: true,
      backendStopsOnExit: true,
    }),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
