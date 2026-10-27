import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/sqlite-core";
import { tables as typedTables } from "./schema.js";
import {
  type State,
  stateSchema,
  emptyState,
  assertRelations,
} from "../shared/domain.js";
const tables = {
  tasks: "StudyTask",
  plans: "StudyPlan",
  topics: "KnowledgeTopic",
  sessions: "StudySession",
  reviews: "ReviewEvent",
  wrongs: "WrongQuestion",
  exams: "ExamPractice",
  interviews: "InterviewPractice",
  teaching: "TeachingSchedule",
  conversations: "ChatConversation",
  messages: "ChatMessage",
  logs: "AIActionLog",
  batches: "ImportBatch",
  proposals: "RescheduleProposal",
} as const;
export class Store {
  db: DatabaseSync;
  constructor(path = process.env.DATABASE_PATH || "data/studybuddy.sqlite") {
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    this.db.exec(
      readFileSync(new URL("./001_init.sql", import.meta.url), "utf8"),
    );
    if (!this.db.prepare("SELECT id FROM Metadata").get())
      this.save(emptyState());
  }
  read(): State {
    return readState(this.db);
  }
  save(input: State, expected?: number) {
    const s = stateSchema.parse(input);
    assertRelations(s);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const revision = this.db
        .prepare("SELECT revision FROM Metadata WHERE id=1")
        .get();
      if (expected !== undefined && Number(revision?.revision) !== expected)
        throw Error("数据已更新，请刷新后重试");
      for (const key of [
        ...Object.keys(tables),
      ].reverse() as (keyof typeof tables)[])
        this.db.exec(`DELETE FROM ${tables[key]}`);
      this.db
        .prepare("INSERT OR REPLACE INTO UserSettings VALUES (?,?)")
        .run("default", JSON.stringify(s.settings));
      for (const [key, table] of Object.entries(tables) as [
        keyof typeof tables,
        string,
      ][]) {
        for (const row of s[key]) {
          const extra: Record<string, unknown> = {};
          if (key === "tasks") {
            const t = row as State["tasks"][number];
            extra.date = t.date;
            extra.status = t.status;
          }
          if (["topics", "sessions", "reviews"].includes(key))
            extra.taskId = (row as State["reviews"][number]).taskId;
          if (key === "reviews")
            extra.stage = (row as State["reviews"][number]).stage;
          if (key === "messages")
            extra.conversationId = (
              row as State["messages"][number]
            ).conversationId;
          if (key === "teaching")
            extra.date = (row as State["teaching"][number]).date;
          if (key === "batches")
            extra.hash = (row as State["batches"][number]).hash;
          const keys = ["id", "data", ...Object.keys(extra)];
          this.db
            .prepare(
              `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
            )
            .run(
              row.id,
              JSON.stringify(row),
              ...(Object.values(extra) as (string | number)[]),
            );
        }
      }
      this.db
        .prepare("INSERT OR REPLACE INTO Metadata VALUES(1,?)")
        .run(s.revision);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  mutate<T>(fn: (s: State) => T) {
    const s = this.read(),
      revision = s.revision;
    const result = fn(s);
    s.revision++;
    this.save(s, revision);
    return result;
  }
  close() {
    this.db.close();
  }
}

export function readState(db: DatabaseSync): State {
  const s = emptyState();
  s.revision = Number(
    db.prepare("SELECT revision FROM Metadata WHERE id=1").get()!.revision,
  );
  s.settings = JSON.parse(
    String(
      db.prepare("SELECT data FROM UserSettings WHERE id=?").get("default")!
        .data,
    ),
  );
  for (const [key, table] of Object.entries(tables))
    Object.assign(s, {
      [key]: db
        .prepare(
          new QueryBuilder()
            .select({
              data: typedTables[key as keyof typeof typedTables].data,
            })
            .from(typedTables[key as keyof typeof typedTables])
            .orderBy(sql`rowid`)
            .toSQL().sql,
        )
        .all()
        .map((r) => JSON.parse(String(r.data))),
    });
  return stateSchema.parse(s);
}
