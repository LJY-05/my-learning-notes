import { z } from "zod";
import { dateSchema, type State, type Task, uid, audit } from "./domain.js";
export const timeInputSchema = z
  .object({
    runId: z.string().uuid(),
    taskId: z.string().min(1),
    entries: z
      .array(
        z.object({
          date: dateSchema,
          seconds: z.number().int().min(1).max(86400),
        }),
      )
      .min(1)
      .max(32),
  })
  .refine(
    (v) =>
      new Set(v.entries.map((e) => e.date)).size === v.entries.length &&
      v.entries.reduce((a, e) => a + e.seconds, 0) <= 86400,
    "计时日期重复或总时长超过24小时",
  );
export type TimeInput = z.infer<typeof timeInputSchema>;
export function activeSessions(s: State) {
  return s.sessions.filter((x) => !x.superseded);
}
export function minutesTotal(rows: State["sessions"]) {
  return (
    Math.round(
      rows
        .filter((x) => !x.superseded)
        .reduce((a, x) => a + (x.seconds ?? x.minutes * 60), 0) / 6,
    ) / 10
  );
}
export function setActualTime(
  s: State,
  t: Task,
  minutes: number,
  date: string,
) {
  // Preserve original events as history when a user corrects the cumulative total.
  for (const row of s.sessions.filter(
    (x) => x.taskId === t.id && x.type !== "复习" && !x.superseded,
  ))
    row.superseded = true;
  s.sessions.push({
    id: uid(),
    taskId: t.id,
    date,
    minutes,
    seconds: Math.round(minutes * 60),
    source: "manual",
    type: "练习",
  });
  t.actualMinutes = minutes;
}
export function duplicateTime(s: State, v: TimeInput) {
  const prefix = `timer:${v.runId}:`;
  const previous = s.sessions.filter((x) => x.id.startsWith(prefix));
  if (!previous.length) return false;
  if (
    previous.length !== v.entries.length ||
    v.entries.some(
      (e) =>
        !previous.some(
          (p) =>
            p.taskId === v.taskId &&
            p.date === e.date &&
            p.seconds === e.seconds,
        ),
    )
  )
    throw Error("同一计时记录内容冲突，请勿更换任务或时长后重复保存");
  return true;
}
export function recordTime(s: State, v: TimeInput) {
  if (duplicateTime(s, v)) return { duplicate: true };
  const t = s.tasks.find((x) => x.id === v.taskId && !x.deleted);
  if (!t) throw Error("任务已删除或不存在，请恢复任务后保存；计时记录尚未丢失");
  const previous = activeSessions(s).filter(
    (x) => x.taskId === t.id && x.type !== "复习",
  );
  const baselineSeconds = !previous.length
    ? Math.round(t.actualMinutes * 60)
    : 0;
  const totalSeconds =
    previous.reduce((a, x) => a + (x.seconds ?? x.minutes * 60), 0) +
    baselineSeconds +
    v.entries.reduce((a, e) => a + e.seconds, 0);
  if (totalSeconds > 86400)
    throw Error("该任务累计用时将超过24小时，请拆分任务后再保存");
  if (baselineSeconds > 0)
    s.sessions.push({
      id: uid(),
      taskId: t.id,
      date: v.entries[0].date,
      minutes: t.actualMinutes,
      seconds: baselineSeconds,
      source: "manual",
      type: "练习",
    });
  for (const e of v.entries)
    s.sessions.push({
      id: `timer:${v.runId}:${e.date}`,
      taskId: t.id,
      date: e.date,
      minutes: e.seconds / 60,
      seconds: e.seconds,
      source: "timer",
      type: "计时",
    });
  t.actualMinutes = Math.round((totalSeconds / 60) * 100) / 100;
  t.version++;
  audit(
    s,
    "保存学习计时",
    `${t.title}：${v.entries.reduce((a, e) => a + e.seconds, 0)}秒，未自动打卡`,
  );
  return { duplicate: false, actualMinutes: t.actualMinutes };
}
