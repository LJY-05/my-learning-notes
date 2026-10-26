import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  taskSchema,
  finishTask,
  uid,
  stateSchema,
} from "../shared/domain.js";
import {
  recordTime,
  timeInputSchema,
  setActualTime,
  minutesTotal,
} from "../shared/time.js";
import {
  settled,
  elapsedSeconds,
  timeEntries,
  type FocusRun,
} from "../shared/focus.js";
import { Store } from "./db.js";
function fixture() {
  const s = emptyState();
  s.tasks.push(
    taskSchema.parse({
      id: "time-task",
      subject: "教综",
      module: "自定义",
      title: "AI调整后背诵",
      date: "2026-10-26",
      originalDate: "2026-10-26",
      estimatedMinutes: 0,
      actualMinutes: 0,
      priority: "高",
      status: "未开始",
      source: "AI",
      note: "",
      mastery: "未评估",
      kind: "背诵",
      deleted: false,
      completedAt: null,
      deadline: null,
      version: 1,
    }),
  );
  return s;
}
const input = (seconds = 61) => ({
  runId: uid(),
  taskId: "time-task",
  entries: [{ date: "2026-10-26", seconds }],
});
test("预计0规范为待补充，实际小数用时可独立保存，负值仍拒绝", () => {
  const s = fixture();
  assert.equal(s.tasks[0].estimatedMinutes, null);
  assert.equal(
    taskSchema.safeParse({ ...s.tasks[0], estimatedMinutes: -1 }).success,
    false,
  );
  setActualTime(s, s.tasks[0], 12.5, "2026-10-26");
  assert.equal(minutesTotal(s.sessions), 12.5);
  assert.equal(s.tasks[0].status, "未开始");
  stateSchema.parse(s);
});
test("计时按秒追加、重复提交幂等、完成打卡不重复累计时间", () => {
  const s = fixture();
  const v = input();
  recordTime(s, v);
  assert.equal(s.sessions[0].seconds, 61);
  assert.equal(s.tasks[0].actualMinutes, 1.02);
  recordTime(s, v);
  assert.equal(s.sessions.length, 1);
  finishTask(s, "time-task");
  assert.equal(minutesTotal(s.sessions), 1);
  assert.equal(s.reviews.length, 5);
  assert.throws(
    () =>
      recordTime(s, { ...v, entries: [{ date: "2026-10-26", seconds: 62 }] }),
    /冲突/,
  );
});
test("手动更正总量保留历史且不重复统计，后续计时追加到更正后的数值", () => {
  const s = fixture();
  recordTime(s, input(120));
  setActualTime(s, s.tasks[0], 1, "2026-10-26");
  assert.equal(s.sessions.length, 2);
  assert.equal(s.sessions[0].superseded, true);
  assert.equal(minutesTotal(s.sessions), 1);
  recordTime(s, input(60));
  assert.equal(s.tasks[0].actualMinutes, 2);
  assert.equal(minutesTotal(s.sessions), 2);
});
test("旧版未打卡实际分钟计时前保留，备份可往返计时与历史", () => {
  const s = fixture();
  s.tasks[0].actualMinutes = 20;
  recordTime(s, input(60));
  assert.equal(s.tasks[0].actualMinutes, 21);
  assert.equal(minutesTotal(s.sessions), 21);
  const db = new Store(":memory:");
  db.save(s);
  assert.deepEqual(db.read(), stateSchema.parse(s));
  db.close();
});
test("计时输入拒绝无效日期、负秒数、重复日期和超24小时", () => {
  for (const entries of [
    [{ date: "2026-02-31", seconds: 1 }],
    [{ date: "2026-10-26", seconds: 0 }],
    [{ date: "2026-10-26", seconds: 86401 }],
    [
      { date: "2026-10-26", seconds: 1 },
      { date: "2026-10-26", seconds: 2 },
    ],
  ])
    assert.equal(
      timeInputSchema.safeParse({ ...input(), entries }).success,
      false,
    );
  const s = fixture();
  s.tasks[0].deleted = true;
  assert.throws(() => recordTime(s, input()), /已删除/);
});
function run(start: number, mode: "up" | "down" = "up"): FocusRun {
  return {
    id: uid(),
    taskId: "time-task",
    title: "测试",
    mode,
    targetSeconds: 60,
    segments: {},
    startedAt: start,
  };
}
test("真实时间差避免后台计时漂移，暂停和刷新不包含休息时长", () => {
  const t = +new Date(2026, 9, 26, 12);
  let r = run(t);
  assert.equal(elapsedSeconds(r, t + 61000), 61);
  r = settled(r, t + 61000);
  assert.equal(elapsedSeconds(JSON.parse(JSON.stringify(r)), t + 100000), 61);
  r = { ...r, startedAt: t + 100000 };
  assert.equal(elapsedSeconds(r, t + 130000), 91);
});
test("倒计时到零自动封顶，过期刷新不将后台时间额外累计", () => {
  const t = +new Date(2026, 9, 26, 12);
  const r = run(t, "down");
  assert.equal(elapsedSeconds(r, t + 120000), 60);
  assert.deepEqual(timeEntries(r, t + 120000), [
    { date: "2026-10-26", seconds: 60 },
  ]);
});
test("跨午夜按实际学习日期拆分，不按原任务计划日期记账", () => {
  const t = +new Date(2026, 9, 26, 23, 59, 30);
  const r = run(t);
  assert.deepEqual(timeEntries(r, t + 90000), [
    { date: "2026-10-26", seconds: 30 },
    { date: "2026-10-27", seconds: 60 },
  ]);
  assert.equal(elapsedSeconds(r, t - 10000), 0);
});
