import XLSX from "xlsx";
import { createHash } from "node:crypto";
import { type State, type Task, uid, dateSchema } from "../shared/domain.js";
export function parseWorkbook(buffer: Buffer, name: string) {
  const hash = createHash("sha256").update(buffer).digest("hex");
  const w = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheets = w.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils
      .sheet_to_json<string[]>(w.Sheets[name], {
        header: 1,
        defval: "",
        raw: false,
      })
      .map((r) => r.map((v) => String(v ?? "")))
      .filter((r) => r.some(Boolean)),
  }));
  const main = sheets.find((x) =>
    x.rows.some((r) => r.includes("日期") && r.includes("教综背诵与复习")),
  );
  if (!main)
    throw Error("未识别新版每日任务表：必须包含“日期”和“教综背诵与复习”字段");
  const hi = main.rows.findIndex(
    (r) => r.includes("日期") && r.includes("教综背诵与复习"),
  );
  const headers = main.rows[hi];
  const rows = main.rows.slice(hi + 1);
  const warnings: string[] = [
    "新版每日任务为主执行表；原28天表与遗忘曲线只作参考，不重复创建任务。",
    "原表只给出每日合计预计分钟，不擅自拆分成逐项时长；请在任务详情补充。",
    "固定课表仅确认2026-10-23至2026-11-05；其后课表标为待确认。",
    "学科第二套题总量未知，初始真实完成题数为0，不计算完成百分比。",
    "原表说明与实习课表有文字差异；保留原文，以实际课表和用户确认为准。",
  ];
  const tasks: Task[] = [];
  const days: {
    date: string;
    minutes: number | null;
    load: string;
    lessons: string;
    note: string;
  }[] = [];
  const cols = [
    "教综背诵与复习",
    "3600错题二刷",
    "6600补漏",
    "学科错题",
    "行测",
    "真题套卷",
    "试讲面试",
    "学科第二套题（全新起步）",
  ];
  const reference = sheets.find((s) => s.name === "28天背诵计划");
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const get = (h: string) => r[headers.indexOf(h)] || "";
    const date = get("日期");
    if (!dateSchema.safeParse(date).success) {
      warnings.push(`第${i + hi + 2}行日期无效，未创建任务`);
      continue;
    }
    const statusRaw = get("状态");
    let status: Task["status"] = statusRaw === "未开始" ? "未开始" : "待确认";
    if (statusRaw !== "未开始")
      warnings.push(`${date} 状态“${statusRaw}”需确认，未自动完成子任务`);
    const minutes =
      get("预计分钟") !== "" && Number.isFinite(Number(get("预计分钟")))
        ? Number(get("预计分钟"))
        : null;
    days.push({
      date,
      minutes,
      load: get("负荷"),
      lessons: get("实习节次与占用"),
      note: get("执行策略"),
    });
    if (get("实际分钟"))
      warnings.push(`${date} 实际分钟保留在源表，未重复分配至各子任务`);
    for (const col of cols) {
      const content = get(col);
      if (!content || /^[—\-]/.test(content.trim())) continue;
      const ref = reference?.rows.find(
        (r) =>
          /^D\d+$/.test(r[0]) &&
          r[1] === `${Number(date.slice(5, 7))}/${date.slice(8)}`,
      );
      const note = [
        get("完成备注"),
        get("执行策略"),
        col === "教综背诵与复习" && ref
          ? `原28天表参考（原文保留）：${ref[3]}；${ref[4]}；${ref[5]}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      tasks.push({
        id:
          "excel:" +
          createHash("sha256")
            .update(main.name + "|" + date + "|" + col)
            .digest("hex")
            .slice(0, 24),
        subject: col.startsWith("学科")
          ? "道德与法治"
          : col === "行测"
            ? "行测"
            : col === "试讲面试"
              ? "面试"
              : "教综",
        module: col,
        title: content,
        date,
        originalDate: date,
        estimatedMinutes: null,
        actualMinutes: 0,
        priority:
          col === "教综背诵与复习" ? "高" : col === "6600补漏" ? "低" : "中",
        status,
        source: `${main.name} · 第${i + hi + 2}行 · ${col}`,
        note,
        mastery: "未评估",
        kind:
          col === "教综背诵与复习"
            ? "背诵"
            : col === "真题套卷"
              ? "真题"
              : col === "试讲面试"
                ? "面试"
                : "练习",
        deleted: false,
        completedAt: null,
        deadline: null,
        version: 1,
      });
    }
  }
  if (!tasks.length) throw Error("没有发现可导入任务");
  const key = new Set<string>();
  for (const t of tasks) {
    if (key.has(t.id))
      throw Error("源表同一天同一科目出现重复记录，请核对后导入");
    key.add(t.id);
  }
  return { hash, name, sheets, tasks, days, warnings };
}
export type Parsed = ReturnType<typeof parseWorkbook>;
export function applyImport(s: State, p: Parsed) {
  if (s.batches.some((b) => b.hash === p.hash))
    return { duplicate: true, created: 0 };
  const existing = new Set(s.tasks.map((t) => t.id));
  const additions = p.tasks
    .filter((t) => !existing.has(t.id))
    .map((t) => structuredClone(t));
  s.tasks.push(...additions);
  for (const t of additions.filter((t) => t.kind === "背诵"))
    s.topics.push({ id: "topic:" + t.id, taskId: t.id, title: t.title });
  for (const sheet of p.sheets) {
    if (!s.plans.some((x) => x.name === sheet.name))
      s.plans.push({
        id: uid(),
        name: sheet.name,
        type: sheet.name.includes("每周")
          ? "每周"
          : sheet.name.includes("月度")
            ? "月度"
            : sheet.name.includes("新版每日")
              ? "每日"
              : sheet.name.includes("规则")
                ? "规则"
                : "参考",
        headers:
          sheet.rows.find(
            (r) =>
              r.includes("日期") ||
              r.includes("Day") ||
              r.includes("月份") ||
              r.includes("星期"),
          ) ||
          sheet.rows[0] ||
          [],
        rows: structuredClone(sheet.rows),
      });
  }
  for (const d of p.days) {
    if (s.teaching.some((x) => x.date === d.date)) continue;
    const confirmed = d.date >= "2026-10-23" && d.date <= "2026-11-05";
    const weekday = new Date(d.date + "T12:00:00").getDay();
    s.teaching.push({
      id: uid(),
      date: d.date,
      lessons: d.lessons,
      load: confirmed
        ? weekday === 4
          ? "高负荷"
          : weekday === 2 || weekday === 5
            ? "强化日"
            : weekday === 0 || weekday === 6
              ? "弹性日"
              : "标准日"
        : "待确认",
      availableMinutes: d.minutes ?? s.settings.dailyMinutes,
      confirmed,
      note:
        d.note +
        (confirmed
          ? ""
          : "；课表有效期已过，待用户确认；仅保留表内建议，不沿用固定课务。"),
    });
  }
  s.batches.push({
    id: uid(),
    hash: p.hash,
    name: p.name,
    at: new Date().toISOString(),
    taskCount: additions.length,
    warnings: p.warnings,
    sheets: p.sheets.map((x) => ({ name: x.name, rows: x.rows.length })),
  });
  return { duplicate: false, created: additions.length };
}
