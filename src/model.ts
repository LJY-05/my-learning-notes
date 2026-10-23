import seed from "./seed.json";
export type Plan = (typeof seed.plans)[number];
export type RecordEntry = {
  date: string;
  doneAt?: string;
  practiceAt?: string;
  examAt?: string;
  note: string;
  mastery: string;
  title: string;
  history: { at: string; action: string }[];
};
export type Review = {
  id: string;
  planId: string;
  stage: number;
  date: string;
  doneAt?: string;
};
export type Mistake = {
  id: string;
  module: string;
  point: string;
  reason: string;
  mastery: string;
  date: string;
  note: string;
  history: string[];
};
export type Exam = {
  id: string;
  name: string;
  date: string;
  total: number;
  correct: number;
  minutes: number;
  weak: string;
};
export type State = {
  version: 1;
  plans: Plan[];
  records: Record<string, RecordEntry>;
  reviews: Review[];
  mistakes: Mistake[];
  exams: Exam[];
};
export const stages = [1, 3, 7, 14, 30];
export function today() {
  return localDate(new Date());
}
export function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + n);
  return localDate(d);
}
export function initial(): State {
  return {
    version: 1,
    plans: structuredClone(seed.plans),
    records: Object.fromEntries(
      seed.plans.map((p) => [
        p.id,
        {
          date: p.date,
          note: p.note,
          mastery: p.mastery,
          title: p.title,
          history: [],
        },
      ]),
    ),
    reviews: [],
    mistakes: [],
    exams: [],
  };
}
export function complete(s: State, id: string, day: string): State {
  const next = structuredClone(s);
  const r = next.records[id];
  if (!r.doneAt) {
    r.doneAt = day;
    r.history.push({
      at: new Date().toISOString(),
      action: `完成背诵（${day}）`,
    });
    for (const stage of stages) {
      const key = `${id}:${stage}`;
      if (!next.reviews.some((x) => x.id === key))
        next.reviews.push({
          id: key,
          planId: id,
          stage,
          date: addDays(day, stage),
        });
    }
  }
  return next;
}
export function postpone(s: State, id: string, date: string): State {
  const n = structuredClone(s);
  const r = n.records[id];
  r.history.push({
    at: new Date().toISOString(),
    action: `安排日期 ${r.date} → ${date}`,
  });
  r.date = date;
  return n;
}
export function progress(s: State) {
  let total = 0,
    done = 0;
  for (const p of s.plans) {
    total += 2 + (p.exam !== "—" ? 1 : 0);
    const r = s.records[p.id];
    done +=
      Number(!!r.doneAt) +
      Number(!!r.practiceAt) +
      (p.exam !== "—" ? Number(!!r.examAt) : 0);
  }
  return { total, done, rate: total ? Math.round((done / total) * 100) : 0 };
}
export function validate(s: unknown): s is State {
  try {
    const a = s as State;
    if (
      a.version !== 1 ||
      a.plans.length !== 28 ||
      new Set(a.plans.map((p) => p.id)).size !== 28
    )
      return false;
    const date = (v: unknown) =>
      typeof v === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      !isNaN(Date.parse(v));
    if (
      !a.plans.every(
        (p) =>
          typeof p.title === "string" &&
          typeof p.source === "string" &&
          typeof p.practice === "string" &&
          typeof p.goal === "string" &&
          typeof p.exam === "string" &&
          date(p.date) &&
          a.records[p.id] &&
          date(a.records[p.id].date) &&
          typeof a.records[p.id].title === "string" &&
          typeof a.records[p.id].note === "string" &&
          Array.isArray(a.records[p.id].history),
      )
    )
      return false;
    if (
      !Array.isArray(a.reviews) ||
      !Array.isArray(a.mistakes) ||
      !Array.isArray(a.exams)
    )
      return false;
    return (
      a.reviews.every(
        (r) =>
          a.records[r.planId] &&
          stages.includes(r.stage) &&
          r.id === `${r.planId}:${r.stage}` &&
          date(r.date),
      ) &&
      new Set(a.reviews.map((r) => r.id)).size === a.reviews.length &&
      a.mistakes.every(
        (m) =>
          typeof m.point === "string" &&
          date(m.date) &&
          Array.isArray(m.history),
      ) &&
      a.exams.every(
        (e) =>
          typeof e.name === "string" &&
          date(e.date) &&
          e.total > 0 &&
          e.correct >= 0 &&
          e.correct <= e.total &&
          e.minutes > 0,
      )
    );
  } catch {
    return false;
  }
}
export { seed };
