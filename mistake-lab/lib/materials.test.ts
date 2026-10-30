import test from "node:test";
import assert from "node:assert/strict";
import { seed, type LabData } from "./data";
import {
  confirmMatch,
  draftMatches,
  matchKey,
  upgradeData,
  type AnswerEntry,
  parseOptions,
} from "./materials";
import { realSampleFixture } from "./real-sample-fixture";
function fixture() {
  const data = seed();
  const a: AnswerEntry = {
    id: "answer-test",
    book: data.questions[0].book,
    chapter: data.questions[0].chapter,
    questionNumber: "1",
    questionType: "解答题",
    answer: "独立答案",
    explanation: "独立解析",
    origin: "manual",
    revision: 1,
  };
  data.answers = [a];
  return data;
}
function propose(data: LabData) {
  data.matches = draftMatches(
    data,
    data.answers.map((a) => a.id),
  );
  return data.matches[0].id;
}
test("匹配键区分习题册与章节，并规范全角题号和前导零", () => {
  assert.equal(matchKey("书", "章", "第０１题"), matchKey("书", "章", "1"));
  assert.notEqual(matchKey("书", "第一章", "1"), matchKey("书", "第二章", "1"));
});
test("生成候选不会修改题目答案，只匹配同书同章同题号，不重复已有候选", () => {
  const d = fixture(),
    before = structuredClone(d.questions);
  propose(d);
  assert.equal(d.matches.length, 1);
  assert.equal(d.matches[0].questionId, "ml-1");
  assert.deepEqual(d.questions, before);
  assert.equal(draftMatches(d, ["answer-test"]).length, 0);
});
test("已有答案必须明确允许替换，确认只修改目标且保留原图与结构化文字", () => {
  const d = fixture(),
    id = propose(d);
  assert.throws(() => confirmMatch(d, id), /明确勾选/);
  const next = confirmMatch(d, id, true);
  assert.equal(next.questions[0].answerId, "answer-test");
  assert.equal(next.questions[0].answer, "独立答案");
  assert.equal(next.questions[0].structuredText, d.questions[0].structuredText);
  assert.deepEqual(next.pages, d.pages);
  assert.deepEqual(next.questions[1], d.questions[1]);
  assert.equal(d.questions[0].answerId, undefined);
  assert.equal(next.matches[0].snapshot?.answer, "独立答案");
});
test("解析修订后旧候选不可确认，已确认快照不会被静默更新", () => {
  const d = fixture(),
    id = propose(d);
  const next = confirmMatch(d, id, true);
  const answer = next.answers[0];
  next.answers = [{ ...answer, answer: "新版", revision: 2 }];
  assert.equal(next.questions[0].answer, "独立答案");
  assert.equal(next.matches[0].snapshot?.answer, "独立答案");
  d.answers[0] = { ...d.answers[0], revision: 2 };
  assert.throws(() => confirmMatch(d, id, true), /已更新/);
  assert.equal(draftMatches(next, ["answer-test"]).length, 1);
});
test("人工修正目标仍然需要确认，不会写入其他题目", () => {
  const d = fixture(),
    id = propose(d);
  d.matches[0] = { ...d.matches[0], questionId: "ml-4", reason: "人工修正" };
  const before = d.questions[0].answer;
  const next = confirmMatch(d, id, true);
  assert.equal(next.questions[0].answer, before);
  assert.equal(next.questions.find((q) => q.id === "ml-4")?.answer, "独立答案");
});
test("重新确认保留历史快照，重复确认被拒绝", () => {
  const d = fixture(),
    id = propose(d);
  const n = confirmMatch(d, id, true);
  assert.throws(() => confirmMatch(n, id, true), /已处理/);
  n.answers[0] = { ...n.answers[0], answer: "第二版答案", revision: 2 };
  const candidate = draftMatches(n, ["answer-test"])[0];
  n.matches.push(candidate);
  const result = confirmMatch(n, candidate.id, true);
  assert.equal(result.matches.find((m) => m.id === id)?.state, "superseded");
  assert.equal(
    result.matches.find((m) => m.id === id)?.snapshot?.answer,
    "独立答案",
  );
  assert.equal(result.questions[0].answer, "第二版答案");
});
test("旧版数据升级保留题目、书页、笔记和手动框选，并可重复执行", () => {
  const d = seed();
  const legacy = {
    version: 1 as const,
    pages: d.pages,
    questions: [
      ...d.questions,
      {
        ...d.questions[0],
        id: "old-custom",
        regionId: undefined,
        questionNumber: undefined,
        note: "保留的笔记",
      },
    ],
    activity: d.activity,
  };
  const up = upgradeData(legacy);
  assert.equal(up.questions.length, 9);
  assert.equal(up.questions[8].note, "保留的笔记");
  assert.equal(up.questions[8].regionId, "legacy-old-custom");
  assert.ok(up.regions.some((r) => r.id === "legacy-old-custom"));
  assert.deepEqual(up.pages, legacy.pages);
  assert.deepEqual(upgradeData(up), up);
});
test("真实内容人工转录：同书同章两个19题按单选/多选分开，仅产生待确认候选", () => {
  const d = realSampleFixture();
  const candidates = draftMatches(
    d,
    d.answers.map((a) => a.id),
  );
  assert.equal(candidates.length, 3);
  assert.ok(candidates.every((m) => m.state === "pending"));
  assert.equal(
    candidates.find((m) => m.answerId === "answer-real-single-19")?.questionId,
    "real-single-19",
  );
  assert.equal(
    candidates.find((m) => m.answerId === "answer-real-multiple-19")
      ?.questionId,
    "real-multiple-19",
  );
  assert.ok(d.questions.every((q) => q.answer === "" && !q.answerId));
});
test("人工指定也不能把多选ABD确认给单选19题", () => {
  const d = realSampleFixture();
  d.matches = [
    {
      id: "wrong-type",
      questionId: "real-single-19",
      answerId: "answer-real-multiple-19",
      answerRevision: 1,
      state: "pending",
      reason: "错误人工指定",
    },
  ];
  assert.throws(() => confirmMatch(d, "wrong-type", true), /题型不一致/);
  assert.equal(d.questions[0].answer, "");
});
test("题型未知或笼统标为选择题不自动匹配，强行确认也被阻止", () => {
  for (const type of [undefined, "待整理", "选择题"]) {
    const d = realSampleFixture();
    d.answers[0].questionType = type;
    assert.ok(!draftMatches(d, [d.answers[0].id]).length);
    d.matches = [
      {
        id: "unknown",
        questionId: d.questions[0].id,
        answerId: d.answers[0].id,
        answerRevision: 1,
        state: "pending",
        reason: "人工",
      },
    ];
    assert.throws(() => confirmMatch(d, "unknown"), /尚未校对/);
  }
});
test("单选答案数量和题干选项需人工一致，多选不存在的选项不得确认", () => {
  const d = realSampleFixture();
  d.matches = draftMatches(
    d,
    d.answers.map((a) => a.id),
  );
  d.answers[0].answer = "ABD";
  assert.throws(
    () =>
      confirmMatch(
        d,
        d.matches.find((m) => m.questionId === "real-single-19")!.id,
      ),
    /只能有一个/,
  );
  d.answers[2].answer = "ABE";
  assert.throws(
    () =>
      confirmMatch(
        d,
        d.matches.find((m) => m.questionId === "real-multiple-20")!.id,
      ),
    /不存在的选项/,
  );
});
test("选项人工校对保留A-E顺序，拒绝重复标记", () => {
  assert.deepEqual(
    parseOptions(
      "A. 课堂中心\nB. 教师中心\nC. 活动中心\nD. 教材中心\nE. 学校中心",
    ).map((o) => o.label),
    ["A", "B", "C", "D", "E"],
  );
  assert.throws(() => parseOptions("A. 课堂中心\nA. 教师中心"), /重复/);
});
test("判断题只能确认明确真假标记，填空题保留文字；同号但不同题型不串题", () => {
  const d = realSampleFixture();
  const base = d.questions[0];
  d.questions = [
    {
      ...base,
      id: "judge",
      questionNumber: "1",
      questionType: "判断题",
      title: "学校教育引导个体身心发展方向。",
      options: [],
    },
    {
      ...base,
      id: "fill",
      questionNumber: "1",
      questionType: "填空题",
      title: "根据个别差异，教学要____。",
      options: [],
    },
  ];
  d.answers = [
    {
      ...d.answers[0],
      id: "judge-answer",
      questionNumber: "1",
      questionType: "判断题",
      answer: "√",
    },
    {
      ...d.answers[0],
      id: "fill-answer",
      questionNumber: "1",
      questionType: "填空题",
      answer: "因材施教",
    },
  ];
  d.matches = draftMatches(
    d,
    d.answers.map((a) => a.id),
  );
  assert.equal(d.matches.length, 2);
  assert.ok(d.questions.every((q) => !q.answer));
  const judge = d.matches.find((m) => m.questionId === "judge")!;
  d.answers[0].answer = "ABD";
  assert.throws(() => confirmMatch(d, judge.id), /判断题答案/);
  d.answers[0].answer = "√";
  const judged = confirmMatch(d, judge.id);
  const filled = confirmMatch(
    judged,
    d.matches.find((m) => m.questionId === "fill")!.id,
  );
  assert.equal(filled.questions[0].answer, "√");
  assert.equal(filled.questions[1].answer, "因材施教");
});
