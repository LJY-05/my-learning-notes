import { DatabaseSync, backup } from "node:sqlite";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  chmodSync,
  copyFileSync,
  realpathSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "dotenv";
import { readState } from "../server/db.js";
import { assertRelations } from "../shared/domain.js";
export function checkDatabase(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare("PRAGMA integrity_check").get();
    if (!integrity || Object.values(integrity)[0] !== "ok")
      throw Error("数据库完整性校验失败");
    const state = readState(db);
    assertRelations(state);
    return {
      tasks: state.tasks.length,
      completed: state.tasks.filter((t) => t.status === "已完成").length,
    };
  } finally {
    db.close();
  }
}
async function snapshot(source: string, target: string) {
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(db, target);
    chmodSync(target, 0o600);
  } finally {
    db.close();
  }
}
export function inspectProject(root: string) {
  const db = join(root, "data/studybuddy.sqlite");
  if (!existsSync(db))
    throw Error(
      "该文件夹没有 data/studybuddy.sqlite，请选择旧项目中包含 package.json 的文件夹。",
    );
  return { ...checkDatabase(db), hasConfig: existsSync(join(root, ".env")) };
}
export async function migrateProject(root: string, target: string) {
  const info = inspectProject(root);
  mkdirSync(target, { recursive: true });
  const source = join(root, "data/studybuddy.sqlite"),
    destination = join(target, "studybuddy.sqlite");
  if (
    existsSync(destination) &&
    realpathSync(source) === realpathSync(destination)
  )
    throw Error("不能将当前桌面数据导入到自身");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backups = join(target, "backups", stamp);
  mkdirSync(backups, { recursive: true });
  const temporary = join(
    target,
    "migration-" + crypto.randomUUID() + ".sqlite",
  );
  let replaced = false;
  const hadDatabase = existsSync(destination),
    hadConfig = existsSync(join(target, ".env"));
  try {
    await snapshot(source, temporary);
    checkDatabase(temporary);
    if (existsSync(destination))
      await snapshot(destination, join(backups, "studybuddy.sqlite"));
    if (existsSync(join(target, ".env"))) {
      copyFileSync(join(target, ".env"), join(backups, ".env"));
      chmodSync(join(backups, ".env"), 0o600);
    }
    // The caller stops the destination service first. Never copy a live WAL file blindly.
    rmSync(destination + "-wal", { force: true });
    rmSync(destination + "-shm", { force: true });
    renameSync(temporary, destination);
    replaced = true;
    if (info.hasConfig) {
      const envTemp = join(target, ".env.importing");
      writeFileSync(envTemp, readFileSync(join(root, ".env")), { mode: 0o600 });
      renameSync(envTemp, join(target, ".env"));
    }
    return { ...info, backups };
  } catch (error) {
    if (replaced) {
      rmSync(destination + "-wal", { force: true });
      rmSync(destination + "-shm", { force: true });
      if (hadDatabase)
        copyFileSync(join(backups, "studybuddy.sqlite"), destination);
      else rmSync(destination, { force: true });
      if (hadConfig) copyFileSync(join(backups, ".env"), join(target, ".env"));
      else rmSync(join(target, ".env"), { force: true });
    }
    throw error;
  } finally {
    rmSync(temporary, { force: true });
    rmSync(join(target, ".env.importing"), { force: true });
  }
}
export function readConfig(root: string): Record<string, string> {
  const file = join(root, ".env");
  return existsSync(file) ? parse(readFileSync(file)) : {};
}
export function configStatus(root: string) {
  const c = readConfig(root);
  return {
    deepseekConfigured: !!c.DEEPSEEK_API_KEY,
    openaiConfigured: !!c.OPENAI_API_KEY,
    deepseekModel: c.DEEPSEEK_MODEL || "deepseek-chat",
    openaiModel: c.OPENAI_MODEL || "gpt-4.1-mini",
  };
}
export function saveConfig(
  root: string,
  input: { provider: string; key: string; model: string; clear?: boolean },
) {
  if (
    !["deepseek", "openai"].includes(input.provider) ||
    typeof input.key !== "string" ||
    input.key.length > 2000 ||
    /[\r\n\0]/.test(input.key) ||
    typeof input.model !== "string" ||
    !/^[a-zA-Z0-9._:/-]{1,100}$/.test(input.model)
  )
    throw Error("配置格式无效，请检查密钥与模型名称");
  const c = readConfig(root),
    prefix = input.provider === "deepseek" ? "DEEPSEEK" : "OPENAI";
  if (input.clear) c[prefix + "_API_KEY"] = "";
  else if (input.key.trim()) c[prefix + "_API_KEY"] = input.key.trim();
  c[prefix + "_MODEL"] = input.model;
  mkdirSync(root, { recursive: true });
  const file = join(root, ".env");
  if (existsSync(file)) {
    const d = join(root, "backups", "config-" + Date.now());
    mkdirSync(d, { recursive: true });
    copyFileSync(file, join(d, ".env"));
    chmodSync(join(d, ".env"), 0o600);
  }
  const temp = file + ".saving";
  writeFileSync(
    temp,
    Object.entries(c)
      .filter(([k]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  renameSync(temp, file);
  return configStatus(root);
}
