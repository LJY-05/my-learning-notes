// Drizzle provides typed SQLite schema and SELECT construction; Node's native
// sqlite driver executes synchronously so write transactions cannot interleave.
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { State } from "../shared/domain.js";
export const taskTable = sqliteTable("StudyTask", {
  id: text().primaryKey(),
  date: text().notNull(),
  status: text().notNull(),
  data: text({ mode: "json" }).$type<State["tasks"][number]>().notNull(),
});
export const settingsTable = sqliteTable("UserSettings", {
  id: text().primaryKey(),
  data: text({ mode: "json" }).$type<State["settings"]>().notNull(),
});
export const metadataTable = sqliteTable("Metadata", {
  id: integer().primaryKey(),
  revision: integer().notNull(),
});
export const tables = {
  tasks: taskTable,
  plans: sqliteTable("StudyPlan", {
    id: text().primaryKey(),
    data: text({ mode: "json" }).$type<State["plans"][number]>().notNull(),
  }),
  topics: sqliteTable("KnowledgeTopic", {
    id: text().primaryKey(),
    taskId: text()
      .notNull()
      .references(() => taskTable.id),
    data: text({ mode: "json" }).$type<State["topics"][number]>().notNull(),
  }),
  sessions: sqliteTable("StudySession", {
    id: text().primaryKey(),
    taskId: text()
      .notNull()
      .references(() => taskTable.id),
    data: text({ mode: "json" }).$type<State["sessions"][number]>().notNull(),
  }),
  reviews: sqliteTable("ReviewEvent", {
    id: text().primaryKey(),
    taskId: text()
      .notNull()
      .references(() => taskTable.id),
    stage: integer().notNull(),
    data: text({ mode: "json" }).$type<State["reviews"][number]>().notNull(),
  }),
  wrongs: sqliteTable("WrongQuestion", {
    id: text().primaryKey(),
    data: text({ mode: "json" }).$type<State["wrongs"][number]>().notNull(),
  }),
  exams: sqliteTable("ExamPractice", {
    id: text().primaryKey(),
    data: text({ mode: "json" }).$type<State["exams"][number]>().notNull(),
  }),
  interviews: sqliteTable("InterviewPractice", {
    id: text().primaryKey(),
    data: text({ mode: "json" }).$type<State["interviews"][number]>().notNull(),
  }),
  teaching: sqliteTable("TeachingSchedule", {
    id: text().primaryKey(),
    date: text().notNull().unique(),
    data: text({ mode: "json" }).$type<State["teaching"][number]>().notNull(),
  }),
  conversations: sqliteTable("ChatConversation", {
    id: text().primaryKey(),
    data: text({ mode: "json" })
      .$type<State["conversations"][number]>()
      .notNull(),
  }),
  messages: sqliteTable("ChatMessage", {
    id: text().primaryKey(),
    conversationId: text().notNull(),
    data: text({ mode: "json" }).$type<State["messages"][number]>().notNull(),
  }),
  logs: sqliteTable("AIActionLog", {
    id: text().primaryKey(),
    data: text({ mode: "json" }).$type<State["logs"][number]>().notNull(),
  }),
  batches: sqliteTable("ImportBatch", {
    id: text().primaryKey(),
    hash: text().notNull().unique(),
    data: text({ mode: "json" }).$type<State["batches"][number]>().notNull(),
  }),
  proposals: sqliteTable("RescheduleProposal", {
    id: text().primaryKey(),
    data: text({ mode: "json" }).$type<State["proposals"][number]>().notNull(),
  }),
};
