import { addDays, type State, type Proposal, uid } from "../shared/domain.js";
export function propose(s: State, date: string, minutes: number): Proposal {
  const teaching = s.teaching.find((x) => x.date === date);
  const budget = Math.min(
    minutes,
    teaching?.confirmed ? teaching.availableMinutes : minutes,
  );
  const warnings: string[] = [];
  if (!teaching?.confirmed)
    warnings.push("此日课表未确认，不沿用过期的固定课表；请核对教学任务。");
  if (teaching?.load === "高负荷")
    warnings.push("高负荷日：整套真题延后，优先保底任务。");
  if (budget < minutes)
    warnings.push(`受已确认可用时间约束，按 ${budget} 分钟排期。`);
  const due = s.tasks.filter(
    (t) => !t.deleted && t.status !== "已完成" && t.date <= date,
  );
  const rank = (t: (typeof due)[number]) =>
    ({ 高: 30, 中: 20, 低: 10 })[t.priority] +
    (s.reviews.some(
      (r) => r.taskId === t.id && !r.completedAt && r.date <= date,
    )
      ? 20
      : 0) +
    (s.wrongs.some(
      (w) =>
        w.mastery !== "已掌握" &&
        w.module.length > 0 &&
        (w.module === t.module ||
          t.title.includes(w.module) ||
          t.note.includes(w.module)),
    )
      ? 10
      : 0) +
    (t.deadline && t.deadline <= date ? 30 : 0) +
    (t.kind === "背诵" ? 8 : 0) +
    (teaching?.load === "强化日" && t.kind === "真题" ? 10 : 0);
  due.sort(
    (a, b) =>
      rank(b) - rank(a) ||
      a.date.localeCompare(b.date) ||
      a.id.localeCompare(b.id),
  );
  let used = 0;
  const selected: string[] = [],
    deferred: string[] = [],
    unknown: string[] = [];
  // Due review events reserve their own explicit default 10-minute slots; never mark them completed.
  const reviews = s.reviews.filter(
    (r) =>
      !r.completedAt &&
      r.date <= date &&
      s.tasks.some((t) => t.id === r.taskId && !t.deleted),
  );
  const reserve = Math.min(reviews.length * 10, budget);
  used += reserve;
  if (reviews.length)
    warnings.push(
      `到期复习 ${reviews.length} 项，预留 ${reserve} 分钟（每项10分钟为可调整估计）；不足部分仍在复习页保留。`,
    );
  for (const t of due) {
    if (t.estimatedMinutes === null) {
      unknown.push(t.id);
      continue;
    }
    if (
      (teaching?.load === "高负荷" && t.kind === "真题") ||
      used + t.estimatedMinutes > budget
    ) {
      deferred.push(t.id);
      continue;
    }
    used += t.estimatedMinutes;
    selected.push(t.id);
  }
  if (unknown.length)
    warnings.push("部分任务没有逐项时长，先补充时长再纳入时间预算。");
  if (!due.length) warnings.push("此日期及此前没有待排任务。");
  return {
    id: uid(),
    date,
    minutes: budget,
    revision: s.revision + 1,
    selected,
    deferred,
    unknown,
    before: due.map((t) => ({ id: t.id, date: t.date, version: t.version })),
    confirmed: false,
    warnings,
  };
}
export function confirm(s: State, p: Proposal) {
  if (p.confirmed) throw Error("候选方案已执行，请勿重复确认");
  if (p.revision !== s.revision) throw Error("数据已发生变化，请重新生成方案");
  if (
    new Set([...p.selected, ...p.deferred, ...p.unknown]).size !==
    p.before.length
  )
    throw Error("方案存在重复或遗漏任务");
  for (const b of p.before) {
    const t = s.tasks.find((x) => x.id === b.id);
    if (
      !t ||
      t.deleted ||
      t.status === "已完成" ||
      t.version !== b.version ||
      t.date !== b.date
    )
      throw Error("任务状态冲突，请重新生成方案");
  }
  for (const id of p.selected) {
    const t = s.tasks.find((t) => t.id === id)!;
    t.date = p.date;
    t.version++;
  }
  for (const id of p.deferred) {
    const t = s.tasks.find((t) => t.id === id)!;
    t.date = addDays(p.date, 1);
    t.version++;
  }
  p.confirmed = true;
}
