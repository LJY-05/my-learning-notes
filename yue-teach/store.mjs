import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_PROFILE, SOURCES } from "./sources.mjs";
export function openStore(root) {
  mkdirSync(root, { recursive: true });
  const db = new DatabaseSync(join(root, "yueteach.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS articles (url TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS answers (day TEXT NOT NULL, qid TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(day,qid));
    CREATE TABLE IF NOT EXISTS marks (url TEXT PRIMARY KEY, payload TEXT NOT NULL);`);
  const get = (key, fallback) => {
    const r = db.prepare("SELECT value FROM kv WHERE key=?").get(key);
    return r ? JSON.parse(r.value) : fallback;
  };
  const set = (key, v) =>
    db
      .prepare("INSERT OR REPLACE INTO kv VALUES (?,?)")
      .run(key, JSON.stringify(v));
  const secretFile = join(root, "ai-config.json");
  return {
    db,
    root,
    get,
    set,
    profile: () => get("profile", DEFAULT_PROFILE),
    articles: () =>
      db
        .prepare("SELECT payload FROM articles ORDER BY fetched DESC")
        .all()
        .map((r) => JSON.parse(r.payload)),
    addArticle: (a) =>
      db
        .prepare("INSERT OR REPLACE INTO articles VALUES (?,?,?)")
        .run(a.url, JSON.stringify(a), new Date().toISOString()),
    sources: () =>
      SOURCES.map((s) => ({
        ...s,
        ...JSON.parse(
          db.prepare("SELECT payload FROM sources WHERE id=?").get(s.id)
            ?.payload || "{}",
        ),
      })),
    setSource: (id, v) =>
      db
        .prepare("INSERT OR REPLACE INTO sources VALUES (?,?)")
        .run(id, JSON.stringify(v)),
    config: () =>
      existsSync(secretFile)
        ? JSON.parse(readFileSync(secretFile, "utf8"))
        : {},
    saveConfig: (v) => {
      const temp = secretFile + "." + randomUUID();
      writeFileSync(temp, JSON.stringify(v), { mode: 0o600 });
      return import("node:fs").then((fs) => fs.renameSync(temp, secretFile));
    },
    daily: (day) => {
      const r = db.prepare("SELECT payload FROM daily WHERE day=?").get(day);
      return r ? JSON.parse(r.payload) : null;
    },
    setDaily: (day, v) =>
      db
        .prepare("INSERT OR REPLACE INTO daily VALUES (?,?)")
        .run(day, JSON.stringify(v)),
    answers: (day) =>
      db
        .prepare("SELECT qid,payload FROM answers WHERE day=?")
        .all(day)
        .map((r) => ({ qid: r.qid, ...JSON.parse(r.payload) })),
    allAnswers: () =>
      db
        .prepare("SELECT day,qid,payload FROM answers ORDER BY day DESC")
        .all()
        .map((r) => ({ day: r.day, qid: r.qid, ...JSON.parse(r.payload) })),
    answer: (day, qid, v) =>
      db
        .prepare("INSERT OR IGNORE INTO answers VALUES (?,?,?)")
        .run(day, qid, JSON.stringify(v)),
    marks: () =>
      db
        .prepare("SELECT url,payload FROM marks")
        .all()
        .map((r) => ({ url: r.url, ...JSON.parse(r.payload) })),
    mark: (url, v) =>
      db
        .prepare("INSERT OR REPLACE INTO marks VALUES (?,?)")
        .run(url, JSON.stringify(v)),
    close: () => db.close(),
  };
}
