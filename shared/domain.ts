import { z } from "zod";
z.config(z.locales.zhCN());
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return !isNaN(+d) && d.toISOString().slice(0, 10) === s;
  }, "日期无效");
export const text = z.string().max(20000);
const id = z.string().min(1).max(160);
export const taskSchema = z.object({
  id,
  subject: z.string().min(1).max(100),
  module: text,
  title: z.string().min(1).max(2000),
  date: dateSchema,
  originalDate: dateSchema,
  estimatedMinutes: z.number().int().min(1).max(1440).nullable(),
  actualMinutes: z.number().int().min(0).max(1440),
  priority: z.enum(["高", "中", "低"]),
  status: z.enum(["未开始", "进行中", "已完成", "待确认"]),
  source: text,
  note: text,
  mastery: z.enum(["未评估", "生疏", "一般", "熟练"]),
  kind: z.enum(["背诵", "练习", "真题", "面试", "其他"]),
  deleted: z.boolean(),
  completedAt: z.string().nullable(),
  deadline: dateSchema.nullable(),
  version: z.number().int().min(1),
});
export type Task = z.infer<typeof taskSchema>;
export const reviewSchema = z.object({
  id,
  taskId: id,
  stage: z
    .number()
    .int()
    .refine((n) => [1, 3, 7, 14, 30].includes(n)),
  date: dateSchema,
  completedAt: z.string().nullable(),
  mastery: text,
});
export const wrongSchema = z.object({
  id,
  subject: text,
  module: text,
  title: z.string().min(1).max(4000),
  tags: text,
  reason: text,
  answer: text,
  explanation: text,
  aiExplanation: text,
  mastery: z.enum(["未掌握", "模糊", "已掌握"]),
  date: dateSchema,
  round: z.number().int().min(1).max(100),
  errors: z.number().int().min(1),
  relatedId: text,
  history: z.array(text),
});
export const examSchema = z
  .object({
    id,
    name: z.string().min(1),
    subject: text,
    region: text,
    year: text,
    date: dateSchema,
    startedAt: text,
    finishedAt: text,
    minutes: z.number().min(0).max(1440),
    total: z.number().int().positive(),
    correct: z.number().int().min(0),
    score: z.number().nullable(),
    wrongCount: z.number().int().min(0),
    review: text,
    chapter: text,
  })
  .refine(
    (x) => x.correct <= x.total && x.wrongCount <= x.total,
    "正确数或错题数不能超过总题数",
  );
export const interviewSchema = z.object({
  id,
  title: z.string().min(1),
  date: dateSchema,
  objectives: text,
  keyPoints: text,
  process: text,
  script: text,
  material: text,
  selfReview: text,
  rating: z.number().int().min(0).max(5),
  minutes: z.number().min(0).max(1440),
});
export const teachingSchema = z.object({
  id,
  date: dateSchema,
  lessons: text,
  load: z.enum(["高负荷", "标准日", "强化日", "弹性日", "待确认"]),
  availableMinutes: z.number().int().min(0).max(1440),
  confirmed: z.boolean(),
  note: text,
});
export const settingsSchema = z.object({
  name: z.string().min(1).max(50),
  dailyMinutes: z.number().int().min(0).max(1440),
  theme: z.enum(["light", "dark"]),
  energy: z.enum(["专注", "普通", "疲惫"]),
  provider: z.enum(["mock", "openai", "off"]),
  reminders: z.boolean(),
  planStart: dateSchema,
  planEnd: dateSchema,
  subjectTwoTotal: z.number().int().positive().nullable(),
});
export const planSchema = z.object({
  id,
  name: text,
  type: z.enum(["每日", "每周", "月度", "参考", "规则"]),
  rows: z.array(z.array(z.string())),
  headers: z.array(text),
});
export const batchSchema = z.object({
  id,
  hash: text,
  name: text,
  at: text,
  taskCount: z.number().int(),
  warnings: z.array(text),
  sheets: z.array(z.object({ name: text, rows: z.number().int() })),
});
export const logSchema = z.object({
  id,
  at: text,
  action: text,
  detail: text,
  actor: z.enum(["user", "ai", "system"]),
});
export const messageSchema = z.object({
  id,
  conversationId: id,
  role: z.enum(["user", "assistant"]),
  content: text,
  at: text,
});
export const proposalSchema = z.object({
  id,
  date: dateSchema,
  minutes: z.number().int().min(0).max(1440),
  revision: z.number().int(),
  selected: z.array(id),
  deferred: z.array(id),
  unknown: z.array(id),
  before: z.array(
    z.object({ id, date: dateSchema, version: z.number().int() }),
  ),
  confirmed: z.boolean(),
  warnings: z.array(text),
});
export const sessionSchema = z.object({
  id,
  taskId: id,
  date: dateSchema,
  minutes: z.number().int().min(0).max(1440),
  type: z.enum(["首次学习", "复习", "练习"]),
});
export const stateSchema = z.object({
  version: z.literal(2),
  revision: z.number().int().min(0),
  settings: settingsSchema,
  tasks: z.array(taskSchema).max(20000),
  reviews: z.array(reviewSchema),
  wrongs: z.array(wrongSchema),
  exams: z.array(examSchema),
  interviews: z.array(interviewSchema),
  teaching: z.array(teachingSchema),
  plans: z.array(planSchema),
  batches: z.array(batchSchema),
  logs: z.array(logSchema),
  messages: z.array(messageSchema),
  proposals: z.array(proposalSchema),
  sessions: z.array(sessionSchema),
  topics: z.array(z.object({ id, taskId: id, title: text })),
  conversations: z.array(z.object({ id, title: text, at: text })),
});
export type State = z.infer<typeof stateSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type Wrong = z.infer<typeof wrongSchema>;
export type Exam = z.infer<typeof examSchema>;
export type Interview = z.infer<typeof interviewSchema>;
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + n);
  return localDate(d);
}
export function uid() {
  return crypto.randomUUID();
}
export function emptyState(): State {
  return {
    version: 2,
    revision: 0,
    settings: {
      name: "佳妍",
      dailyMinutes: 120,
      theme: "dark",
      energy: "普通",
      provider: "mock",
      reminders: true,
      planStart: "2026-10-23",
      planEnd: "2026-12-17",
      subjectTwoTotal: null,
    },
    tasks: [],
    reviews: [],
    wrongs: [],
    exams: [],
    interviews: [],
    teaching: [],
    plans: [],
    batches: [],
    logs: [],
    messages: [],
    proposals: [],
    sessions: [],
    topics: [],
    conversations: [],
  };
}
export function assertRelations(s: State) {
  for (const key of [
    "tasks",
    "reviews",
    "wrongs",
    "exams",
    "interviews",
    "teaching",
    "plans",
    "batches",
    "logs",
    "messages",
    "proposals",
    "sessions",
    "topics",
    "conversations",
  ] as const) {
    const ids = s[key].map((x) => x.id);
    if (new Set(ids).size !== ids.length) throw Error(`${key} 中存在重复ID`);
  }
  const ids = new Set(s.tasks.map((t) => t.id));
  for (const x of [...s.reviews, ...s.sessions, ...s.topics])
    if (!ids.has(x.taskId)) throw Error("存在失去关联的任务记录");
  if (
    new Set(s.reviews.map((x) => x.taskId + ":" + x.stage)).size !==
    s.reviews.length
  )
    throw Error("存在重复复习节点");
  for (const m of s.messages)
    if (!s.conversations.some((c) => c.id === m.conversationId))
      throw Error("对话关联无效");
  if (s.settings.planEnd < s.settings.planStart)
    throw Error("计划结束日期早于开始日期");
}
export function audit(
  s: State,
  action: string,
  detail: string,
  actor: "user" | "ai" | "system" = "user",
) {
  s.logs.push({
    id: uid(),
    at: new Date().toISOString(),
    action,
    detail,
    actor,
  });
}
export function finishTask(s: State, id: string, date = localDate()) {
  const t = s.tasks.find((t) => t.id === id && !t.deleted);
  if (!t) throw Error("任务不存在");
  if (t.status === "已完成") return;
  t.status = "已完成";
  t.completedAt = new Date().toISOString();
  t.version++;
  s.sessions.push({
    id: uid(),
    taskId: id,
    date,
    minutes: t.actualMinutes,
    type: t.kind === "背诵" ? "首次学习" : "练习",
  });
  if (t.kind === "背诵") {
    for (const stage of [1, 3, 7, 14, 30])
      if (!s.reviews.some((r) => r.taskId === id && r.stage === stage))
        s.reviews.push({
          id: `${id}:D${stage}`,
          taskId: id,
          stage,
          date: addDays(date, stage),
          completedAt: null,
          mastery: "未评估",
        });
  }
  audit(s, "完成任务", t.title);
}
export function progress(s: State, tasks = s.tasks.filter((t) => !t.deleted)) {
  const done = tasks.filter((t) => t.status === "已完成").length;
  return {
    total: tasks.length,
    done,
    rate: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
  };
}
