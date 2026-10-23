import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  Brain,
  NotebookPen,
  ClipboardCheck,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  Check,
  Leaf,
  Search,
  X,
  Clock,
  RotateCcw,
  CheckCheck,
  Menu,
} from "lucide-react";
import {
  initial,
  today,
  addDays,
  complete,
  postpone,
  progress,
  validate,
  seed,
  State,
  Plan,
  Mistake,
  Exam,
  localDate,
} from "./model";
import "./style.css";
const KEY = "studybuddy-v1";
let storageBlocked = false;
const tabs = [
  ["工作台", LayoutDashboard],
  ["每日计划", BookOpen],
  ["遗忘曲线", Brain],
  ["错题本", NotebookPen],
  ["真题训练", ClipboardCheck],
  ["学习日历", CalendarDays],
  ["学习统计", ChartNoAxesCombined],
] as const;
const reviewNames: Record<number, string> = {
  1: "主动回忆",
  3: "3600 检测",
  7: "框架输出",
  14: "△★ 二刷",
  30: "真题检测",
};
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (validate(s)) return s;
      throw Error("invalid");
    }
  } catch {
    storageBlocked = true;
    alert(
      "本地数据读取失败，已保留原存储。请先导出或检查浏览器存储，页面暂用初始计划。",
    );
  }
  return initial();
}
function App() {
  const [s, setS] = useState<State>(load),
    [page, setPage] = useState(0),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("全部"),
    [selected, setSelected] = useState(today()),
    [month, setMonth] = useState(today().slice(0, 7)),
    [edit, setEdit] = useState<Plan | null>(null),
    [modal, setModal] = useState<"mistake" | "exam" | null>(null),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [editingMistake, setEditingMistake] = useState<Mistake | null>(null);
  useEffect(() => {
    if (storageBlocked) {
      setToast(
        "原存储格式异常，已暂停自动保存以保护数据。请导出当前数据或导入有效备份。",
      );
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      setToast("保存失败：浏览器存储已满，请立即导出备份。");
    }
  }, [s]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const day = today(),
    p = progress(s),
    learned = s.plans.filter((x) => s.records[x.id].doneAt).length;
  const due = s.reviews
    .filter((r) => !r.doneAt && r.date <= day)
    .sort((a, b) => a.date.localeCompare(b.date));
  const active = s.plans.filter((x) => s.records[x.id].date === selected),
    overdue = s.plans.filter(
      (x) =>
        s.records[x.id].date < day &&
        (!s.records[x.id].doneAt ||
          !s.records[x.id].practiceAt ||
          (x.exam !== "—" && !s.records[x.id].examAt)),
    );
  function mark(id: string, key: "doneAt" | "practiceAt" | "examAt") {
    if (s.records[id][key]) {
      if (
        !confirm(
          "撤销此项完成状态？操作历史将保留；撤销新背时只移除尚未完成的自动复习。",
        )
      )
        return;
      setS((v) => {
        const n = structuredClone(v);
        delete n.records[id][key];
        n.records[id].history.push({
          at: new Date().toISOString(),
          action:
            "撤销" +
            (key === "doneAt"
              ? "新背"
              : key === "practiceAt"
                ? "3600"
                : "真题") +
            "完成状态",
        });
        if (key === "doneAt")
          n.reviews = n.reviews.filter((r) => r.planId !== id || r.doneAt);
        return n;
      });
      return;
    }
    if (key === "doneAt") setS((v) => complete(v, id, day));
    else
      setS((v) => ({
        ...v,
        records: {
          ...v.records,
          [id]: {
            ...v.records[id],
            [key]: day,
            history: [
              ...v.records[id].history,
              {
                at: new Date().toISOString(),
                action: `完成${key === "practiceAt" ? "3600联动" : "真题安排"}`,
              },
            ],
          },
        },
      }));
    setToast(
      key === "doneAt"
        ? "背诵完成！已安排 5 个复习节点。"
        : "已记录完成，继续保持。",
    );
  }
  async function exportExcel() {
    const XLSX = await import("xlsx");
    const w = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(seed.sheets))
      XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(rows), name);
    XLSX.utils.book_append_sheet(
      w,
      XLSX.utils.json_to_sheet(
        s.plans.map((x) => ({
          ...x,
          ...s.records[x.id],
          history: JSON.stringify(s.records[x.id].history),
        })),
      ),
      "当前学习记录",
    );
    XLSX.utils.book_append_sheet(
      w,
      XLSX.utils.json_to_sheet(s.reviews),
      "复习记录",
    );
    XLSX.utils.book_append_sheet(
      w,
      XLSX.utils.json_to_sheet(
        s.mistakes.map((m) => ({ ...m, history: JSON.stringify(m.history) })),
      ),
      "错题记录",
    );
    XLSX.utils.book_append_sheet(
      w,
      XLSX.utils.json_to_sheet(s.exams),
      "真题记录",
    );
    const text = JSON.stringify(s);
    XLSX.utils.book_append_sheet(
      w,
      XLSX.utils.aoa_to_sheet([
        ["StudyBuddy backup v1"],
        ...Array.from({ length: Math.ceil(text.length / 24000) }, (_, i) => [
          text.slice(i * 24000, (i + 1) * 24000),
        ]),
      ]),
      "StudyBuddy数据",
    );
    XLSX.writeFile(w, `StudyBuddy学习备份-${day}.xlsx`);
    setToast("已导出 Excel，包含原表和全部学习数据。");
  }
  async function importExcel(file?: File) {
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const w = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const backup = w.Sheets["StudyBuddy数据"];
      if (backup) {
        const rows = XLSX.utils.sheet_to_json<string[]>(backup, { header: 1 });
        const data = JSON.parse(
          rows
            .slice(1)
            .map((r) => r[0] || "")
            .join(""),
        );
        if (!validate(data)) throw Error("备份格式或记录校验失败");
        if (confirm("将用备份替换当前数据。建议先导出当前记录。是否继续？")) {
          storageBlocked = false;
          setS(data);
          setToast("备份导入成功。");
        }
      } else {
        const sheet = w.Sheets["28天背诵计划"];
        if (!sheet) throw Error("未找到「28天背诵计划」工作表");
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
        const data = initial();
        for (let i = 0; i < 28; i++) {
          const r = rows[i + 4];
          if (
            !r ||
            r[0] !== `D${i + 1}` ||
            typeof r[3] !== "string" ||
            typeof r[7] !== "string"
          )
            throw Error("原计划必须包含完整 D1–D28 任务");
          Object.assign(data.plans[i], {
            originalDate: String(r[1]),
            module: String(r[2]),
            title: String(r[3]),
            source: String(r[4] || ""),
            goal: String(r[5] || ""),
            practice: String(r[7]),
            originalReview: String(r[8] || ""),
            exam: String(r[9] || "—"),
            note: String(r[11] || ""),
          });
          data.records[`D${i + 1}`].title = String(r[3]);
          data.records[`D${i + 1}`].note = String(r[11] || "");
        }
        if (
          confirm(
            "导入原始计划将重新开始，日期映射到 2026-10-21 至 11-17，不导入历史勾选。请先备份现有记录。继续？",
          )
        ) {
          storageBlocked = false;
          setS(data);
          setToast("28天原始计划导入成功，完成记录保持未开始。");
        }
      }
    } catch (e) {
      setToast("导入失败：" + (e as Error).message);
    }
  }
  function TaskCard({
    plan,
    compact = false,
  }: {
    plan: Plan;
    compact?: boolean;
  }) {
    const r = s.records[plan.id];
    return (
      <article className={"task-card " + (r.doneAt ? "completed" : "")}>
        <div className="task-top">
          <span className="day-tag">{plan.id}</span>
          <span className="module-tag">{plan.module}</span>
          <span className="task-date">
            {r.date}
            {r.date < day && !r.doneAt ? " · 待补学" : ""}
          </span>
          <button
            className="icon-button"
            onClick={() => setEdit(plan)}
            title="编辑任务"
          >
            <NotebookPen size={16} />
          </button>
        </div>
        <h3>{r.title}</h3>
        <p className="goal">{plan.goal}</p>
        {!compact && <p className="source">资料定位 · {plan.source}</p>}
        <div className="task-lines">
          <button
            className={r.doneAt ? "checked" : ""}
            onClick={() => mark(plan.id, "doneAt")}
          >
            <span className="checkbox">{r.doneAt && <Check size={13} />}</span>
            <span>新背 / 闭卷输出</span>
            {r.doneAt && <small>{r.doneAt}</small>}
          </button>
          <button
            className={r.practiceAt ? "checked" : ""}
            onClick={() => mark(plan.id, "practiceAt")}
          >
            <span className="checkbox">
              {r.practiceAt && <Check size={13} />}
            </span>
            <span>{plan.practice}</span>
          </button>
          {plan.exam !== "—" && (
            <button
              className={r.examAt ? "checked" : ""}
              onClick={() => mark(plan.id, "examAt")}
            >
              <span className="checkbox">
                {r.examAt && <Check size={13} />}
              </span>
              <span>{plan.exam}</span>
            </button>
          )}
        </div>
        {r.note && <p className="note-preview">✎ {r.note}</p>}
        <div className="task-bottom">
          <span>
            {r.mastery} {r.doneAt ? "已完成背诵" : "等待你的第一步"}
          </span>
          <button onClick={() => setEdit(plan)}>
            详情与顺延 <ArrowUpRight size={13} />
          </button>
        </div>
      </article>
    );
  }
  function Reviews({ limit = 999 }: { limit?: number }) {
    const list = s.reviews
      .filter((r) => !r.doneAt)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
    return list.length ? (
      <div className="review-list">
        {list.map((r) => (
          <div className="review-row" key={r.id}>
            <div className="review-node">D{r.stage}</div>
            <div>
              <strong>{s.records[r.planId].title}</strong>
              <small>
                {reviewNames[r.stage]} · {r.date}{" "}
                {r.date < day ? "· 已到期" : r.date === day ? "· 今天" : ""}
              </small>
            </div>
            <button
              className="icon-button"
              title="完成复习"
              onClick={() => {
                setS((v) => ({
                  ...v,
                  reviews: v.reviews.map((x) =>
                    x.id === r.id ? { ...x, doneAt: day } : x,
                  ),
                }));
                setToast("复习已完成并记录。");
              }}
            >
              <Check size={17} />
            </button>
          </div>
        ))}
      </div>
    ) : (
      <div className="empty">
        <Brain size={30} />
        <p>复习会在完成新背后自动安排</p>
        <small>D1 / D3 / D7 / D14 / D30，不重复生成。</small>
      </div>
    );
  }
  return (
    <div className="app">
      {mobile && (
        <button
          className="nav-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage(0);
          }}
        >
          <div className="logo">
            <BookOpen size={25} />
            <Leaf size={13} />
          </div>
          <div>
            StudyBuddy<small>教综学习管理工作台</small>
          </div>
        </a>
        <div className="space-card">
          <span className="space-avatar">学</span>
          <div>
            我的备考空间<small>28 天，让知识生根</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <p className="nav-caption">我的学习</p>
        <nav>
          {tabs.map(([title, Icon], i) => (
            <button
              key={title}
              className={page === i ? "active" : ""}
              onClick={() => {
                setPage(i);
                setQuery("");
                setMobile(false);
              }}
            >
              <Icon size={19} />
              <span>{title}</span>
              {i === 2 && due.length > 0 && <b>{due.length}</b>}
              {i === 0 && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="quote">
            <Leaf size={22} />
            <p>
              不必一下子看到整段阶梯，
              <br />
              只需迈出你的第一步。
            </p>
            <small>每天一点点，离上岸近一点。</small>
            <div className="quote-line" />
          </div>
          <div className="local-status">
            <span /> 数据保存在此浏览器<small>记得定期导出备份 ↗</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>我的学习空间</span>
            <span>/</span>
            <strong>{tabs[page][0]}</strong>
          </div>
          <div className="header-actions">
            <span className="local-pill">
              <span /> 本地模式
            </span>
            <button onClick={exportExcel}>
              <Download size={15} />
              <span>导出 Excel</span>
            </button>
            <label className="import-button">
              <Upload size={15} />
              <span>导入</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  importExcel(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="user-avatar">学</span>
          </div>
        </header>
        <main>
          <section className="welcome">
            <div>
              <div className="eyebrow">
                <span /> 你的每一份努力，都在悄悄积累
              </div>
              <h1>
                {page === 0 ? "今天，也向上岸靠近一点。" : tabs[page][0]}
                {page === 0 && <Leaf className="heading-leaf" size={30} />}
              </h1>
              <p>
                {page === 0
                  ? `${new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })} · 把大目标拆成小日常，让学习更有方向。`
                  : "四线联动 · 主背 × 3600 × 间隔复习 × 真题训练"}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => {
                setPage(1);
                setSelected(day);
                setFilter("今天");
              }}
            >
              <BookOpen size={16} /> 开始今日学习 <ArrowRight size={16} />
            </button>
          </section>
          {(page === 0 || page === 6) && (
            <section className="stats">
              <article>
                <span>
                  整体学习进度 <ChartNoAxesCombined size={17} />
                </span>
                <div>
                  <strong>{p.rate}</strong>
                  <b>%</b>
                  <small>
                    {p.done} / {p.total} 项
                  </small>
                </div>
                <div className="mini-track">
                  <i style={{ width: p.rate + "%" }} />
                </div>
                <p>背诵、3600与计划真题独立计数</p>
              </article>
              <article>
                <span>
                  已完成背诵 <BookOpen size={17} />
                </span>
                <div>
                  <strong>{learned}</strong>
                  <b>/ 28 天</b>
                </div>
                <p>
                  <span className="green">✧ 每一步都算数</span>，保持自己的节奏
                </p>
              </article>
              <article>
                <span>
                  到期复习 <Brain size={17} />
                </span>
                <div>
                  <strong>{due.length}</strong>
                  <b>项</b>
                  <span className="soft-tag">待巩固</span>
                </div>
                <p>D1 → D3 → D7 → D14 → D30</p>
              </article>
              <article>
                <span>
                  真题训练 <ClipboardCheck size={17} />
                </span>
                <div>
                  <strong>{s.exams.length}</strong>
                  <b>套</b>
                </div>
                <p>原计划 6 套 · 实际训练单独统计</p>
              </article>
            </section>
          )}
          {page === 0 && (
            <>
              <div className="dashboard-grid">
                <section className="panel today-panel">
                  <div className="panel-title">
                    <h2>
                      <span className="title-square" />
                      今日学习计划{" "}
                      <span className="count">{active.length}</span>
                    </h2>
                    <button
                      onClick={() => {
                        setPage(1);
                        setFilter("全部");
                      }}
                    >
                      全部计划 <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <div className="date-tabs">
                    {Array.from({ length: 7 }, (_, i) =>
                      addDays(day, i - 2),
                    ).map((d) => (
                      <button
                        className={selected === d ? "selected" : ""}
                        key={d}
                        onClick={() => setSelected(d)}
                      >
                        <small>
                          {
                            ["日", "一", "二", "三", "四", "五", "六"][
                              new Date(d + "T12:00").getDay()
                            ]
                          }
                        </small>
                        <strong>{Number(d.slice(-2))}</strong>
                        <i
                          className={
                            s.plans.some((p) => s.records[p.id].date === d)
                              ? "has-plan"
                              : ""
                          }
                        />
                      </button>
                    ))}
                  </div>
                  <div className="task-stack">
                    {active.map((x) => (
                      <TaskCard key={x.id} plan={x} compact />
                    ))}
                    {!active.length && (
                      <div className="empty">
                        <CalendarDays />
                        <p>这一天暂时没有新背任务</p>
                        <button
                          onClick={() => {
                            setPage(1);
                            setFilter("全部");
                          }}
                        >
                          去每日计划安排学习 →
                        </button>
                      </div>
                    )}
                  </div>
                  {s.mistakes.some(
                    (m) => m.date <= day && m.mastery !== "已掌握",
                  ) && (
                    <div className="overdue-banner">
                      <Brain size={16} />
                      <span>
                        {
                          s.mistakes.filter(
                            (m) => m.date <= day && m.mastery !== "已掌握",
                          ).length
                        }{" "}
                        个错题知识点待复习
                      </span>
                      <button onClick={() => setPage(3)}>去巩固 →</button>
                    </div>
                  )}
                  {overdue.length > 0 && (
                    <div className="overdue-banner">
                      <Clock size={16} />
                      <span>还有 {overdue.length} 天计划尚未全部完成</span>
                      <button
                        onClick={() => {
                          setPage(1);
                          setFilter("逾期");
                        }}
                      >
                        查看与顺延 →
                      </button>
                    </div>
                  )}
                </section>
                <div className="right-stack">
                  <section className="panel">
                    <div className="panel-title">
                      <h2>
                        <Brain size={18} /> 近期复习
                      </h2>
                      <button onClick={() => setPage(2)}>
                        查看全部 <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <Reviews limit={3} />
                  </section>
                  <section className="method-card">
                    <span className="method-label">
                      STUDY BETTER, NOT HARDER
                    </span>
                    <h2>背过，不如能说出来。</h2>
                    <p>
                      先闭卷回忆，再打开资料。
                      <br />
                      让每次复习都成为一次主动提取。
                    </p>
                    <div className="method-steps">
                      看 <ArrowRight /> 合 <ArrowRight /> 说 <ArrowRight /> 对{" "}
                      <ArrowRight /> 再说 <ArrowRight /> 题
                    </div>
                    <button onClick={() => setPage(2)}>
                      看看四线联动学习法 <ArrowUpRight size={15} />
                    </button>
                    <Leaf className="method-leaf" size={100} />
                  </section>
                </div>
              </div>
              <section className="panel roadmap">
                <div className="panel-title">
                  <h2>
                    28 天成长路线{" "}
                    <span className="subtitle">
                      让每个知识块，慢慢连成完整框架
                    </span>
                  </h2>
                  <span className="subtle">2026.10.21 — 11.17</span>
                </div>
                <div className="roadmap-grid">
                  {[
                    ["教育学", 14, "01 — 14"],
                    ["心理学", 8, "15 — 22"],
                    ["教育心理学", 5, "23 — 27"],
                    ["综合复盘", 1, "28"],
                  ].map(([name, count, range], i) => (
                    <div key={name}>
                      <span className={"phase phase-" + i}>0{i + 1}</span>
                      <div>
                        <strong>{name}</strong>
                        <small>
                          DAY {range} · {count} 天
                        </small>
                      </div>
                      <ArrowRight size={16} />
                    </div>
                  ))}
                </div>
                <div className="day-dots">
                  {s.plans.map((x) => (
                    <button
                      title={`${x.id} ${x.title}`}
                      key={x.id}
                      className={
                        s.records[x.id].doneAt
                          ? "done"
                          : s.records[x.id].date === day
                            ? "current"
                            : ""
                      }
                      onClick={() => setEdit(x)}
                    >
                      {x.id.slice(1)}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
          {page === 1 && (
            <section>
              <div className="section-toolbar">
                <div className="filter-tabs">
                  {["全部", "今天", "逾期", "已完成"].map((f) => (
                    <button
                      key={f}
                      className={filter === f ? "active" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索知识点、模块…"
                  />
                </label>
                <button
                  className="secondary"
                  onClick={() => {
                    if (!overdue.length) {
                      setToast("没有需要顺延的逾期任务");
                      return;
                    }
                    const date = prompt(
                      "将未完成的逾期任务逐日顺延，从哪天开始？",
                      day,
                    );
                    if (
                      !date ||
                      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
                      isNaN(Date.parse(date))
                    ) {
                      if (date) setToast("日期格式应为 YYYY-MM-DD");
                      return;
                    }
                    setS((v) =>
                      overdue.reduce(
                        (a, p, i) => postpone(a, p.id, addDays(date, i)),
                        v,
                      ),
                    );
                    setToast("逾期任务已逐日顺延，完成记录与原始计划保留。");
                  }}
                >
                  <RotateCcw size={15} /> 智能顺延
                </button>
              </div>
              <p className="help-text">
                原表日期 10/08–11/04 已按要求映射到
                2026/10/21–11/17。顺延只修改安排，不新增任务；过去的任务仍需手动完成。
              </p>
              <div className="plan-grid">
                {s.plans
                  .filter((x) => {
                    const r = s.records[x.id];
                    return (
                      (filter === "全部" ||
                        (filter === "今天" && r.date === day) ||
                        (filter === "逾期" &&
                          overdue.some((y) => y.id === x.id)) ||
                        (filter === "已完成" && !!r.doneAt)) &&
                      `${r.title}${x.module}${x.goal}`.includes(query)
                    );
                  })
                  .map((x) => (
                    <TaskCard key={x.id} plan={x} />
                  ))}
              </div>
            </section>
          )}
          {page === 2 && (
            <div className="two-col">
              <section className="panel">
                <div className="panel-title">
                  <h2>待复习清单</h2>
                  <span className="subtle">
                    {s.reviews.filter((r) => r.doneAt).length} 项已完成
                  </span>
                </div>
                <Reviews />
                <details className="history-details">
                  <summary>查看已完成复习记录</summary>
                  {s.reviews
                    .filter((r) => r.doneAt)
                    .map((r) => (
                      <p key={r.id}>
                        {s.records[r.planId].title} · D{r.stage} · 完成于{" "}
                        {r.doneAt}
                      </p>
                    ))}
                </details>
              </section>
              <div>
                <section className="panel rules">
                  <h2>遗忘曲线，让记忆留下来</h2>
                  <p>
                    以实际完成新背的日期为
                    D0。每个知识块仅生成一次五节点任务，支持跨月、跨年；延期不会重置已完成记录。
                  </p>
                  {[1, 3, 7, 14, 30].map((n) => (
                    <div className="rule" key={n}>
                      <span>D{n}</span>
                      <div>
                        <strong>{reviewNames[n]}</strong>
                        <small>
                          {n === 1
                            ? "先闭卷说出关键词"
                            : n === 3
                              ? "用对应 3600 △ / ★ 题检测"
                              : n === 7
                                ? "输出整张知识框架"
                                : n === 14
                                  ? "错题回炉，查漏补缺"
                                  : "真题与混合题抽查"}
                        </small>
                      </div>
                    </div>
                  ))}
                </section>
                <section className="panel rules">
                  <h2>来自原表 · 高效背书法</h2>
                  {seed.sheets["高效背书法"].slice(2, 8).map((r, i) => (
                    <p key={i}>
                      <b>{String(r[0])}</b> · {String(r[1])}
                      <small className="block">
                        {String(r[2])} · 输出标准：{String(r[4])}
                      </small>
                    </p>
                  ))}
                </section>
              </div>
            </div>
          )}
          {page === 3 && (
            <section>
              <div className="section-toolbar">
                <p>把错题变成下一次的得分点。</p>
                <button
                  className="primary"
                  onClick={() => {
                    setEditingMistake(null);
                    setModal("mistake");
                  }}
                >
                  <Plus size={16} /> 记录错题
                </button>
              </div>
              <div className="plan-grid">
                {s.mistakes.map((m) => (
                  <article className="panel mistake-card" key={m.id}>
                    <div className="task-top">
                      <span className="module-tag">{m.module}</span>
                      <span className="soft-tag">{m.mastery}</span>
                      <button
                        className="icon-button"
                        title="编辑错题"
                        onClick={() => {
                          setEditingMistake(m);
                          setModal("mistake");
                        }}
                      >
                        <NotebookPen size={16} />
                      </button>
                    </div>
                    <h3>{m.point}</h3>
                    <p>错误原因：{m.reason}</p>
                    <p>{m.note}</p>
                    <small>
                      下次复习：{m.date} · 已复习 {m.history.length} 次
                    </small>
                    <div className="card-actions">
                      <button
                        className="secondary"
                        onClick={() => {
                          setS((v) => ({
                            ...v,
                            mistakes: v.mistakes.map((x) =>
                              x.id === m.id
                                ? {
                                    ...x,
                                    date: addDays(day, 3),
                                    history: [...x.history, day],
                                  }
                                : x,
                            ),
                          }));
                          setToast("已记录本次复习，3天后再次提醒。");
                        }}
                      >
                        <CheckCheck size={15} /> 完成复习
                      </button>
                      <button
                        className="text-danger"
                        onClick={() => {
                          if (confirm("删除这条错题及其复习记录？"))
                            setS((v) => ({
                              ...v,
                              mistakes: v.mistakes.filter((x) => x.id !== m.id),
                            }));
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!s.mistakes.length && (
                <div className="panel empty">
                  <NotebookPen size={34} />
                  <h3>给知识盲点一个专属位置</h3>
                  <p>记录知识点、错因和掌握程度，复习时就有了方向。</p>
                  <button
                    className="secondary"
                    onClick={() => setModal("mistake")}
                  >
                    记录第一道错题
                  </button>
                </div>
              )}
            </section>
          )}
          {page === 4 && (
            <section>
              <div className="section-toolbar">
                <p>原表 D8 / D11 / D15 / D18 / D22 / D25 共安排 6 套真题。</p>
                <button className="primary" onClick={() => setModal("exam")}>
                  <Plus size={16} /> 记录训练
                </button>
              </div>
              <div className="panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "套卷",
                        "训练日期",
                        "正确率",
                        "正确 / 总题数",
                        "用时",
                        "薄弱模块",
                        "操作",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.exams.map((e) => (
                      <tr key={e.id}>
                        <td>{e.name}</td>
                        <td>{e.date}</td>
                        <td>
                          <b>{Math.round((e.correct / e.total) * 100)}%</b>
                        </td>
                        <td>
                          {e.correct} / {e.total}
                        </td>
                        <td>{e.minutes} 分钟</td>
                        <td>{e.weak || "—"}</td>
                        <td>
                          <button
                            className="text-danger"
                            onClick={() => {
                              if (confirm("删除此套卷记录？"))
                                setS((v) => ({
                                  ...v,
                                  exams: v.exams.filter((x) => x.id !== e.id),
                                }));
                            }}
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!s.exams.length && (
                  <div className="empty">
                    <ClipboardCheck />
                    <p>还没有训练记录，完成一套后，来这里看见进步。</p>
                  </div>
                )}
              </div>
            </section>
          )}
          {page === 5 && (
            <section className="panel">
              <div className="panel-title">
                <h2>{month.replace("-", " 年 ")} 月</h2>
                <div className="calendar-controls">
                  <button
                    onClick={() => {
                      const d = new Date(month + "-01T12:00");
                      d.setMonth(d.getMonth() - 1);
                      setMonth(localDate(d).slice(0, 7));
                    }}
                    aria-label="上个月"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button onClick={() => setMonth(day.slice(0, 7))}>
                    本月
                  </button>
                  <button
                    onClick={() => {
                      const d = new Date(month + "-01T12:00");
                      d.setMonth(d.getMonth() + 1);
                      setMonth(localDate(d).slice(0, 7));
                    }}
                    aria-label="下个月"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <div className="calendar-grid">
                {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
                  <div className="weekday" key={w}>
                    {w}
                  </div>
                ))}
                {Array.from(
                  { length: (new Date(month + "-01T12:00").getDay() + 6) % 7 },
                  (_, i) => (
                    <div key={"blank" + i} />
                  ),
                )}
                {Array.from(
                  {
                    length: new Date(
                      Number(month.slice(0, 4)),
                      Number(month.slice(5)),
                      0,
                    ).getDate(),
                  },
                  (_, i) => {
                    const d = `${month}-${String(i + 1).padStart(2, "0")}`,
                      plans = s.plans.filter((p) => s.records[p.id].date === d),
                      done = Object.values(s.records).filter(
                        (r) => r.doneAt === d,
                      ).length,
                      rev = s.reviews.filter((r) => r.date === d);
                    return (
                      <button
                        key={d}
                        className={
                          "calendar-cell " + (d === day ? "is-today" : "")
                        }
                        onClick={() => setSelected(d)}
                      >
                        <strong>{i + 1}</strong>
                        {plans.length > 0 && (
                          <span className="cal-plan">
                            {plans.length} 项学习
                          </span>
                        )}
                        {done > 0 && (
                          <span className="cal-done">✓ 背诵 {done}</span>
                        )}
                        {rev.length > 0 && (
                          <span className="cal-review">复习 {rev.length}</span>
                        )}
                      </button>
                    );
                  },
                )}
              </div>
              <div className="calendar-detail">
                <h3>{selected} · 学习记录</h3>
                {s.plans
                  .filter(
                    (p) =>
                      s.records[p.id].date === selected ||
                      s.records[p.id].doneAt === selected,
                  )
                  .map((p) => (
                    <button key={p.id} onClick={() => setEdit(p)}>
                      {p.id} {s.records[p.id].title} ·{" "}
                      {s.records[p.id].doneAt ? "背诵完成" : "待学习"}{" "}
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                {s.reviews
                  .filter((r) => r.date === selected)
                  .map((r) => (
                    <p key={r.id}>
                      D{r.stage} {s.records[r.planId].title} ·{" "}
                      {r.doneAt ? "已复习" : "待复习"}
                    </p>
                  ))}
                <small>点击日期查看安排；完成记录按实际日期展示。</small>
              </div>
            </section>
          )}
          {page === 6 && (
            <div className="two-col">
              <section className="panel">
                <div className="panel-title">
                  <h2>近 7 日完成趋势</h2>
                  <span className="subtle">实际完成项数</span>
                </div>
                <div className="bar-chart">
                  {Array.from({ length: 7 }, (_, i) => addDays(day, i - 6)).map(
                    (d) => {
                      const n =
                        Object.values(s.records).reduce(
                          (a, r) =>
                            a +
                            Number(r.doneAt === d) +
                            Number(r.practiceAt === d) +
                            Number(r.examAt === d),
                          0,
                        ) + s.reviews.filter((r) => r.doneAt === d).length;
                      return (
                        <div key={d}>
                          <b>{n}</b>
                          <div className="bar-track">
                            <i
                              style={{
                                height: Math.max(3, Math.min(100, n * 8)) + "%",
                              }}
                            />
                          </div>
                          <small>{d.slice(5)}</small>
                          <small>
                            {(() => {
                              const ps = s.plans.filter((p) => p.date === d);
                              const total = ps.reduce(
                                (a, p) => a + 2 + Number(p.exam !== "—"),
                                0,
                              );
                              const done = ps.reduce((a, p) => {
                                const r = s.records[p.id];
                                return (
                                  a +
                                  Number(!!r.doneAt) +
                                  Number(!!r.practiceAt) +
                                  Number(p.exam !== "—" && !!r.examAt)
                                );
                              }, 0);
                              return total
                                ? Math.round((done / total) * 100) + "%"
                                : "—";
                            })()}
                          </small>
                        </div>
                      );
                    },
                  )}
                </div>
                <p className="help-text">
                  柱形为背诵、3600、计划真题和复习的实际完成数量；下方百分比按当日原计划计算完成率，不随顺延移动。
                </p>
                <h3>最近四周 · 计划完成率</h3>
                {[0, 1, 2, 3].map((i) => {
                  const start = addDays(day, -6 - i * 7),
                    end = addDays(day, -i * 7);
                  const ps = s.plans.filter(
                    (p) => p.date >= start && p.date <= end,
                  );
                  let total = 0,
                    done = 0;
                  ps.forEach((p) => {
                    total += 2 + Number(p.exam !== "—");
                    const r = s.records[p.id];
                    done +=
                      Number(!!r.doneAt) +
                      Number(!!r.practiceAt) +
                      Number(p.exam !== "—" && !!r.examAt);
                  });
                  return (
                    <div className="week-stat" key={i}>
                      <span>
                        {start.slice(5)} — {end.slice(5)}
                      </span>
                      <div className="mini-track">
                        <i
                          style={{
                            width: (total ? (done / total) * 100 : 0) + "%",
                          }}
                        />
                      </div>
                      <b>{total ? Math.round((done / total) * 100) : 0}%</b>
                      <small>
                        {done}/{total}
                      </small>
                    </div>
                  );
                })}
                <small className="subtle">
                  分组以原计划日期为准，延期不重复计算。
                </small>
              </section>
              <div>
                <section className="panel rules">
                  <h2>模块掌握进度</h2>
                  {["教育学", "心理学", "教育心理学", "综合"].map((m) => {
                    const list = s.plans.filter((p) => p.module === m),
                      n = list.filter((p) => s.records[p.id].doneAt).length;
                    return (
                      <div className="module-stat" key={m}>
                        <div>
                          <span>{m}</span>
                          <b>
                            {n}/{list.length}
                          </b>
                        </div>
                        <div className="mini-track">
                          <i style={{ width: (n / list.length) * 100 + "%" }} />
                        </div>
                      </div>
                    );
                  })}
                </section>
                <section className="panel rules">
                  <h2>薄弱知识点</h2>
                  {s.mistakes
                    .filter((m) => m.mastery !== "已掌握")
                    .map((m) => (
                      <p key={m.id}>
                        {m.point}
                        <small className="block">
                          {m.module} · {m.reason} · {m.mastery}
                        </small>
                      </p>
                    ))}
                  {!s.mistakes.some((m) => m.mastery !== "已掌握") && (
                    <p className="subtle">
                      记录错题后，这里会整理待巩固的知识点。
                    </p>
                  )}
                  {s.exams.length > 0 && (
                    <p>
                      真题平均正确率：
                      {Math.round(
                        (s.exams.reduce((a, e) => a + e.correct / e.total, 0) /
                          s.exams.length) *
                          100,
                      )}
                      %
                    </p>
                  )}
                </section>
              </div>
            </div>
          )}
          <footer>
            <span>
              <Leaf size={13} /> 按自己的节奏，稳稳向前。
            </span>
            <span>StudyBuddy · 数据仅保存在当前浏览器，请定期备份</span>
          </footer>
        </main>
      </div>
      {edit && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="编辑学习任务"
          >
            <div className="panel-title">
              <h2>{edit.id} · 任务详情</h2>
              <button
                className="icon-button"
                onClick={() => setEdit(null)}
                aria-label="关闭"
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const date = String(f.get("date"));
                const r = s.records[edit.id];
                setS((v) => {
                  const n =
                    date !== r.date
                      ? postpone(v, edit.id, date)
                      : structuredClone(v);
                  Object.assign(n.records[edit.id], {
                    title: String(f.get("title")),
                    note: String(f.get("note")),
                    mastery: String(f.get("mastery")),
                  });
                  return n;
                });
                setEdit(null);
                setToast("任务修改已保存。");
              }}
            >
              <label>
                学习内容
                <input
                  name="title"
                  defaultValue={s.records[edit.id].title}
                  required
                />
              </label>
              <div className="form-grid">
                <label>
                  安排日期
                  <input
                    type="date"
                    name="date"
                    defaultValue={s.records[edit.id].date}
                    required
                  />
                </label>
                <label>
                  掌握程度
                  <select
                    name="mastery"
                    defaultValue={s.records[edit.id].mastery}
                  >
                    {["🔴", "🟠", "🟡", "🟢"].map((v, i) => (
                      <option value={v} key={v}>
                        {v}{" "}
                        {
                          ["完全说不出", "需要提示", "能说关键词", "完整输出"][
                            i
                          ]
                        }
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="original-info">
                <p>原始内容：{edit.title}</p>
                <p>
                  原表日期：{edit.originalDate} · 映射计划：{edit.date}
                </p>
                <p>核心目标：{edit.goal}</p>
                <p>资料定位：{edit.source}</p>
                <p>3600联动：{edit.practice}</p>
                <p>原表复习联动：{edit.originalReview}</p>
                <p>真题：{edit.exam}</p>
              </div>
              <label>
                学习备注
                <textarea
                  name="note"
                  rows={3}
                  defaultValue={s.records[edit.id].note}
                />
              </label>
              <details>
                <summary>
                  操作历史（{s.records[edit.id].history.length}）
                </summary>
                {s.records[edit.id].history.map((h, i) => (
                  <p key={i}>
                    {new Date(h.at).toLocaleString("zh-CN")} · {h.action}
                  </p>
                ))}
              </details>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEdit(null)}
                >
                  取消
                </button>
                <button className="primary">保存修改</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal === "exam" ? "记录真题" : "记录错题"}
          >
            <div className="panel-title">
              <h2>
                {modal === "exam"
                  ? "记录一次真题训练"
                  : editingMistake
                    ? "编辑错题"
                    : "收集一个知识盲点"}
              </h2>
              <button
                className="icon-button"
                onClick={() => setModal(null)}
                aria-label="关闭"
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (modal === "exam") {
                  const exam: Exam = {
                    id: crypto.randomUUID(),
                    name: String(f.get("name")),
                    date: String(f.get("date")),
                    total: Number(f.get("total")),
                    correct: Number(f.get("correct")),
                    minutes: Number(f.get("minutes")),
                    weak: String(f.get("weak")),
                  };
                  if (exam.correct > exam.total) {
                    setToast("正确题数不能超过总题数。");
                    return;
                  }
                  setS((v) => ({ ...v, exams: [...v.exams, exam] }));
                } else {
                  const m: Mistake = {
                    id: editingMistake?.id || crypto.randomUUID(),
                    point: String(f.get("point")),
                    module: String(f.get("module")),
                    reason: String(f.get("reason")),
                    mastery: String(f.get("mastery")),
                    date: String(f.get("date")),
                    note: String(f.get("note")),
                    history: editingMistake?.history || [],
                  };
                  setS((v) => ({
                    ...v,
                    mistakes: editingMistake
                      ? v.mistakes.map((x) => (x.id === m.id ? m : x))
                      : [...v.mistakes, m],
                  }));
                }
                setModal(null);
                setToast("记录已保存。");
              }}
            >
              {modal === "exam" ? (
                <>
                  <label>
                    套卷名称
                    <input
                      name="name"
                      placeholder="例如：2025年教综真题"
                      required
                    />
                  </label>
                  <label>
                    训练日期
                    <input
                      type="date"
                      name="date"
                      defaultValue={day}
                      required
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      总题数
                      <input
                        type="number"
                        name="total"
                        min="1"
                        max="10000"
                        required
                      />
                    </label>
                    <label>
                      正确题数
                      <input
                        type="number"
                        name="correct"
                        min="0"
                        max="10000"
                        required
                      />
                    </label>
                  </div>
                  <label>
                    用时（分钟）
                    <input
                      type="number"
                      name="minutes"
                      min="1"
                      max="1440"
                      required
                    />
                  </label>
                  <label>
                    薄弱模块
                    <input name="weak" placeholder="例如：学习理论、课程" />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    知识点
                    <input
                      name="point"
                      defaultValue={editingMistake?.point}
                      required
                      placeholder="例如：负强化与惩罚的区别"
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      知识分类
                      <select
                        name="module"
                        defaultValue={editingMistake?.module}
                      >
                        {[
                          "教育学",
                          "心理学",
                          "教育心理学",
                          "小四门",
                          "综合",
                        ].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      掌握程度
                      <select
                        name="mastery"
                        defaultValue={editingMistake?.mastery}
                      >
                        {["未掌握", "需巩固", "已掌握"].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    错误原因
                    <select name="reason" defaultValue={editingMistake?.reason}>
                      {[
                        "△ 概念模糊",
                        "★ 反复出错",
                        "○ 粗心",
                        "知识遗漏",
                        "迁移应用困难",
                      ].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    再次复习日期
                    <input
                      type="date"
                      name="date"
                      required
                      defaultValue={editingMistake?.date || addDays(day, 1)}
                    />
                  </label>
                  <label>
                    错题 / 解析 / 备注
                    <textarea
                      name="note"
                      rows={4}
                      defaultValue={editingMistake?.note}
                    />
                  </label>
                </>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setModal(null)}
                >
                  取消
                </button>
                <button className="primary">保存记录</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
