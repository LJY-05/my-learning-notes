import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseWorkbook, applyImport } from "./importer.js";
import { Store } from "./db.js";
import { propose, confirm } from "./scheduler.js";
import { runTool, executePending } from "./tools.js";
import { MockProvider } from "./providers.js";
import {
  emptyState,
  finishTask,
  stateSchema,
  assertRelations,
  dateSchema,
  type Task,
} from "../shared/domain.js";
const bytes = readFileSync(
  "public/StudyBuddy_备考计划_结合实习课表调整版.xlsx",
);
const parsed = parseWorkbook(bytes, "正式计划.xlsx");
function fixture() {
  const s = emptyState();
  applyImport(s, parsed);
  return s;
}
function task(id: string, minutes: number | null = 20): Task {
  return {
    id,
    subject: "教综",
    module: "测试章节",
    title: id,
    date: "2026-10-29",
    originalDate: "2026-10-29",
    estimatedMinutes: minutes,
    actualMinutes: 15,
    priority: "高",
    status: "未开始",
    source: "测试",
    note: "",
    mastery: "未评估",
    kind: "背诵",
    deleted: false,
    completedAt: null,
    deadline: null,
    version: 1,
  };
}
test("正式Excel的9张表、56天、317项任务准确导入，未知时长和状态不虚构", () => {
  const s = fixture();
  assert.equal(parsed.sheets.length, 9);
  assert.equal(parsed.days.length, 56);
  assert.equal(s.tasks.length, 317);
  assert.equal(s.tasks.filter((t) => t.status === "已完成").length, 0);
  assert.ok(s.tasks.every((t) => t.estimatedMinutes === null));
  assert.equal(
    s.plans
      .find((p) => p.name === "28天背诵计划")!
      .rows.filter((r) => /^D\d+$/.test(r[0])).length,
    28,
  );
  assert.equal(s.settings.subjectTwoTotal, null);
  assert.equal(s.exams.length, 0);
  assert.equal(s.reviews.length, 0);
  stateSchema.parse(s);
  assertRelations(s);
});
test("相同文件和内容不重复导入，不覆盖用户已完成和手动编辑", () => {
  const s = fixture();
  s.tasks[0].title = "用户修改";
  finishTask(s, s.tasks.find((t) => t.kind === "背诵")!.id);
  assert.equal(applyImport(s, parsed).duplicate, true);
  assert.equal(
    applyImport(s, { ...parsed, hash: "different-file-same-rows" }).created,
    0,
  );
  assert.equal(s.tasks.length, 317);
  assert.equal(s.tasks[0].title, "用户修改");
  assert.equal(s.tasks[0].status, "已完成");
});
test("课表只确认至11月5日，周四高负荷，周二周五强化日", () => {
  const s = fixture();
  assert.equal(s.teaching.find((t) => t.date === "2026-10-29")!.load, "高负荷");
  assert.equal(s.teaching.find((t) => t.date === "2026-10-30")!.load, "强化日");
  assert.equal(
    s.teaching.find((t) => t.date === "2026-11-05")!.confirmed,
    true,
  );
  assert.equal(
    s.teaching.find((t) => t.date === "2026-11-06")!.confirmed,
    false,
  );
});
test("完成背诵生成五个唯一复习事件，重复完成不增加事件和学习记录", () => {
  const s = emptyState();
  s.tasks.push(task("a"));
  finishTask(s, "a", "2026-10-23");
  finishTask(s, "a", "2026-10-24");
  assert.equal(s.reviews.length, 5);
  assert.equal(s.sessions.length, 1);
  assert.deepEqual(
    s.reviews.map((r) => r.date),
    ["2026-10-24", "2026-10-26", "2026-10-30", "2026-11-06", "2026-11-22"],
  );
});
test("排期遵守时间预算，高负荷日不排真题，缺时长和超量任务全部保留", () => {
  const s = emptyState();
  s.tasks = [
    task("a", 20),
    task("b", 30),
    { ...task("exam", 20), kind: "真题" },
    task("unknown", null),
  ];
  s.teaching = [
    {
      id: "teach",
      date: "2026-10-29",
      load: "高负荷",
      availableMinutes: 40,
      lessons: "1、2、4、7、8节",
      confirmed: true,
      note: "",
    },
  ];
  const p = propose(s, "2026-10-29", 120);
  assert.equal(p.minutes, 40);
  assert.deepEqual(p.selected, ["a"]);
  assert.ok(p.deferred.includes("b"));
  assert.ok(p.deferred.includes("exam"));
  assert.deepEqual(p.unknown, ["unknown"]);
  assert.equal(new Set([...p.selected, ...p.deferred, ...p.unknown]).size, 4);
  s.revision++;
  s.proposals.push(p);
  confirm(s, p);
  assert.equal(s.tasks.find((t) => t.id === "b")!.date, "2026-10-30");
  assert.throws(() => confirm(s, p), /已执行/);
});
test("过期候选与任务冲突被拒绝，完成记录不受覆盖", () => {
  const s = emptyState();
  s.tasks = [task("a")];
  const p = propose(s, "2026-10-29", 60);
  s.revision += 2;
  assert.throws(() => confirm(s, p), /数据已/);
  s.revision = p.revision;
  finishTask(s, "a");
  assert.throws(() => confirm(s, p), /状态冲突/);
  assert.equal(s.tasks[0].status, "已完成");
});
test("AI写工具仅生成待确认记录，执行需显式用户确认且不可重放", () => {
  const s = emptyState();
  s.tasks = [task("a")];
  const r = runTool(s, "complete_task", { id: "a" }) as any;
  assert.equal(s.tasks[0].status, "未开始");
  assert.equal(r.requiresConfirmation, true);
  s.revision++;
  executePending(s, r.pendingAction.id);
  assert.equal(s.tasks[0].status, "已完成");
  assert.throws(() => executePending(s, r.pendingAction.id), /不存在或已执行/);
  assert.throws(() =>
    runTool(s, "propose_reschedule", { date: "2026-02-31", minutes: -1 }),
  );
  assert.equal(
    (runTool(s, "confirm_reschedule", { id: "fake" }) as any)
      .requiresConfirmation,
    true,
  );
});
test("Mock真实读取任务与课表并生成候选，不声称已经调整", async () => {
  const s = fixture();
  let streamed = "";
  const reply = await new MockProvider().reply(
    s,
    {
      text: "今天只有两个小时，帮我重新安排",
      date: "2026-10-29",
      conversationId: "test",
    },
    (t) => (streamed += t),
  );
  assert.equal(reply, streamed);
  assert.ok(reply.includes("候选"));
  assert.ok(!reply.includes("已经修改成功"));
  assert.equal(s.proposals.length, 1);
  assert.ok(s.proposals[0].unknown.length > 0);
  assert.ok(s.tasks.every((t) => t.date === t.originalDate));
});
test("SQLite重启保持完整数据、备份恢复保留关联，过期写入和无效数据回滚", () => {
  const dir = mkdtempSync(join(tmpdir(), "studybuddy-db-"));
  try {
    const file = join(dir, "db.sqlite");
    let db = new Store(file);
    db.mutate((s) => applyImport(s, parsed));
    db.mutate((s) => finishTask(s, s.tasks.find((t) => t.kind === "背诵")!.id));
    const before = db.read();
    db.close();
    db = new Store(file);
    assert.deepEqual(db.read(), before);
    assert.throws(() => db.save({ ...before, revision: 0 }, 0), /数据已/);
    const invalid = structuredClone(before);
    invalid.reviews.push({ ...invalid.reviews[0], id: "duplicate" });
    assert.throws(() => db.save(invalid), /重复复习/);
    assert.deepEqual(db.read(), before);
    const restored = stateSchema.parse(JSON.parse(JSON.stringify(before)));
    db.save(restored, before.revision);
    assert.deepEqual(db.read(), before);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("日期与备份结构严格校验，拒绝丢失关联与重复ID", () => {
  assert.equal(dateSchema.safeParse("2026-02-31").success, false);
  const s = fixture();
  s.tasks.push(s.tasks[0]);
  assert.throws(() => assertRelations(s), /重复ID/);
  assert.equal(stateSchema.safeParse({ version: 2, tasks: [] }).success, false);
});
