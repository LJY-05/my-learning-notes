import { z } from "zod";
import {
  type State,
  dateSchema,
  localDate,
  taskSchema,
  wrongSchema,
  finishTask,
  audit,
  uid,
  progress,
} from "../shared/domain.js";
import { propose } from "./scheduler.js";
const dateArg = z.object({ date: dateSchema.default(() => localDate()) });
const schemas = {
  get_today_tasks: dateArg,
  get_weekly_plan: dateArg,
  get_study_progress: z.object({}),
  get_timetable: dateArg,
  get_weak_topics: z.object({}),
  create_task: taskSchema.omit({
    id: true,
    version: true,
    deleted: true,
    completedAt: true,
    actualMinutes: true,
    originalDate: true,
  }),
  update_task: z.object({
    id: z.string(),
    patch: taskSchema
      .pick({
        title: true,
        date: true,
        estimatedMinutes: true,
        note: true,
        priority: true,
      })
      .partial(),
  }),
  complete_task: z.object({ id: z.string() }),
  propose_reschedule: z.object({
    date: dateSchema,
    minutes: z.number().int().min(0).max(1440),
  }),
  confirm_reschedule: z.object({ id: z.string() }),
  add_wrong_question: wrongSchema.omit({ id: true, history: true }),
  generate_weekly_review: dateArg,
};
export type ToolName = keyof typeof schemas;
export const toolDefinitions = Object.entries(schemas).map(
  ([name, schema]) => ({
    type: "function" as const,
    name,
    description: `StudyBuddy ${name}。读取真实数据；写入仅创建待确认操作，绝不直接修改。`,
    parameters: z.toJSONSchema(schema, { target: "draft-7" }) as Record<
      string,
      unknown
    >,
    strict: false,
  }),
);
export function runTool(s: State, name: string, input: unknown) {
  if (!(name in schemas)) throw Error("未知工具");
  const n = name as ToolName;
  const v = schemas[n].parse(input) as Record<string, any>;
  audit(s, "调用工具", name, "ai");
  switch (n) {
    case "get_today_tasks":
      return s.tasks.filter((t) => !t.deleted && t.date === v.date);
    case "get_weekly_plan": {
      const end = new Date(v.date + "T12:00:00");
      end.setDate(end.getDate() + 6);
      return s.tasks.filter(
        (t) => !t.deleted && t.date >= v.date && t.date <= localDate(end),
      );
    }
    case "get_study_progress":
      return {
        ...progress(s),
        subjectTwo: {
          completedQuestions: s.exams
            .filter((e) => e.subject === "道德与法治第二套题")
            .reduce((a, e) => a + e.total, 0),
          total: s.settings.subjectTwoTotal,
        },
        studyMinutes: s.sessions.reduce((a, x) => a + x.minutes, 0),
      };
    case "get_timetable":
      return (
        s.teaching.find((t) => t.date === v.date) || {
          confirmed: false,
          note: "此日期课表未确认",
        }
      );
    case "get_weak_topics":
      return s.wrongs.filter((w) => w.mastery !== "已掌握");
    case "generate_weekly_review":
      return {
        progress: progress(s),
        weak: s.wrongs
          .filter((w) => w.mastery !== "已掌握")
          .map((w) => w.title),
        completed: s.tasks
          .filter((t) => t.completedAt && t.completedAt.slice(0, 10) >= v.date)
          .map((t) => t.title),
        advice: "仅根据已记录数据复盘；没有练习成绩的章节不能判定已掌握。",
      };
    case "propose_reschedule": {
      const p = propose(s, v.date, v.minutes);
      s.proposals.push(p);
      return { requiresConfirmation: true, proposal: p };
    }
    case "confirm_reschedule":
      return {
        requiresConfirmation: true,
        proposalId: v.id,
        message: "请点击页面上的确认按钮；模型没有确认权限。",
      };
    default: {
      const pending = {
        id: uid(),
        name: n,
        input: v,
        revision: s.revision + 1,
      };
      s.logs.push({
        id: pending.id,
        at: new Date().toISOString(),
        action: "待确认工具",
        detail: JSON.stringify(pending),
        actor: "ai",
      });
      return { requiresConfirmation: true, pendingAction: pending };
    }
  }
}
export function executePending(s: State, id: string) {
  const log = s.logs.find((l) => l.id === id && l.action === "待确认工具");
  if (!log) throw Error("操作不存在或已执行");
  const pending = JSON.parse(log.detail);
  if (pending.revision !== s.revision)
    throw Error("数据已变化，请重新提出操作");
  const name = pending.name as ToolName;
  const v = schemas[name].parse(pending.input) as Record<string, any>;
  if (name === "create_task") {
    s.tasks.push(
      taskSchema.parse({
        ...v,
        id: uid(),
        originalDate: v.date,
        version: 1,
        actualMinutes: 0,
        deleted: false,
        completedAt: null,
      }),
    );
  } else if (name === "update_task") {
    const t = s.tasks.find((t) => t.id === v.id && !t.deleted);
    if (!t || t.status === "已完成")
      throw Error("任务不存在或已完成，不能由AI覆盖");
    Object.assign(t, v.patch);
    t.version++;
  } else if (name === "complete_task") finishTask(s, v.id);
  else if (name === "add_wrong_question")
    s.wrongs.push(wrongSchema.parse({ ...v, id: uid(), history: [] }));
  else throw Error("不支持的写入操作");
  log.action = "工具已确认执行";
  audit(s, "AI写入已确认", name, "user");
  return { executed: true, name };
}
