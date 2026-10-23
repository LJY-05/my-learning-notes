import { test } from "node:test";
import assert from "node:assert/strict";
import { initial, complete, postpone, progress, validate } from "./model";
test("原计划28天、六套真题，历史任务不自动完成", () => {
  const s = initial();
  assert.equal(s.plans.length, 28);
  assert.equal(s.plans[0].date, "2026-10-21");
  assert.equal(s.plans[27].date, "2026-11-17");
  assert.equal(s.plans.filter((p) => p.exam !== "—").length, 6);
  assert.equal(progress(s).done, 0);
});
test("按实际完成日期生成五次复习，重复完成不重复生成", () => {
  let s = complete(initial(), "D1", "2026-10-25");
  s = complete(s, "D1", "2026-10-26");
  assert.equal(s.reviews.length, 5);
  assert.equal(s.reviews[0].date, "2026-10-26");
  assert.equal(s.reviews[4].date, "2026-11-24");
});
test("延期保留原计划、历史、进度与复习", () => {
  const s = complete(initial(), "D1", "2026-10-23");
  const n = postpone(s, "D1", "2026-10-28");
  assert.equal(n.plans[0].date, "2026-10-21");
  assert.equal(n.records.D1.date, "2026-10-28");
  assert.equal(n.records.D1.history.length, 2);
  assert.deepEqual(progress(n), progress(s));
  assert.deepEqual(n.reviews, s.reviews);
  assert.equal(validate(n), true);
});
test("拒绝不完整备份", () => {
  assert.equal(validate({ version: 1 }), false);
  assert.equal(validate(initial()), true);
});
