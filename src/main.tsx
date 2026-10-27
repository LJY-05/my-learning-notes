import React, { useEffect, useState, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Sparkles,
  CalendarDays,
  Brain,
  NotebookPen,
  ClipboardCheck,
  Mic,
  ChartNoAxesCombined,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  Leaf,
  Menu,
  Download,
  Upload,
  Sun,
  Moon,
  RotateCcw,
  Trash2,
  Send,
  Play,
  Pause,
  CheckCheck,
  AlertCircle,
  PanelLeftClose,
  PanelRight,
  FileText,
  X,
} from "lucide-react";
import Chart from "./components/StudyChart";
import { Button, Card, Badge, Modal, Field, Empty } from "./components/ui";
import { api, saveFile, type Snapshot } from "./api";
import {
  type State,
  type Task,
  type Wrong,
  type Exam,
  type Interview,
  type Proposal,
  localDate,
  addDays,
  progress,
  uid,
} from "../shared/domain";
import TaskTimer from "./components/TaskTimer";
import { activeSessions, minutesTotal } from "../shared/time";
import MarkdownEditor, { MarkdownView } from "./components/MarkdownEditor";
import "./style.css";
import "./workspace.css";
const nav = [
  ["今日空间", LayoutDashboard],
  ["AI 学习助手", Sparkles],
  ["学习计划", CalendarDays],
  ["遗忘曲线", Brain],
  ["错题管理", NotebookPen],
  ["真题与专项", ClipboardCheck],
  ["面试训练", Mic],
  ["数据分析", ChartNoAxesCombined],
  ["设置与数据", Settings],
] as const;
const toolLabels: Record<string, string> = {
  create_task: "新增任务",
  update_task: "修改任务",
  complete_task: "完成任务",
  add_wrong_question: "新增错题",
};
const pageText = [
  ["A LITTLE PROGRESS, EVERY DAY", "把今天，学成喜欢的样子。"],
  ["YOUR PERSONAL STUDY COACH", "有人陪你，把计划理清。"],
  ["MAKE ROOM FOR WHAT MATTERS", "让学习，顺着生活的节奏。"],
  ["REMEMBER, GENTLY", "每次回忆，都在靠近熟练。"],
  ["GROW THROUGH YOUR MISTAKES", "把暂时不会，变成下一次会。"],
  ["PRACTICE WITH PURPOSE", "让每一次练习，都有所收获。"],
  ["YOUR VOICE, YOUR CLASSROOM", "下一次站上讲台，更从容。"],
  ["SEE HOW FAR YOU HAVE COME", "慢慢走，也看见自己的进步。"],
  ["A SPACE THAT FITS YOU", "你的节奏，由你来决定。"],
];
type Editor = {
  type: "task" | "wrong" | "exam" | "interview" | "teaching";
  data: Record<string, any>;
};
function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [page, setPage] = useState(0),
    [date, setDate] = useState(localDate()),
    [query, setQuery] = useState(""),
    [menu, setMenu] = useState(false),
    [focusRequest, setFocusRequest] = useState<{
      taskId?: string;
      nonce: number;
    } | null>(null),
    [navCollapsed, setNavCollapsed] = useState(false),
    [openTabs, setOpenTabs] = useState([0, 2, 1]),
    [focusedTask, setFocusedTask] = useState<string | null>(null),
    [view, setView] = useState("每日"),
    [status, setStatus] = useState("全部"),
    [editor, setEditor] = useState<Editor | null>(null),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [restore, setRestore] = useState<unknown>(null),
    [chat, setChat] = useState(""),
    [stream, setStream] = useState(""),
    [conversation, setConversation] = useState(() => {
      try {
        return sessionStorage.getItem("studybuddy-conversation") || uid();
      } catch {
        return uid();
      }
    }),
    [chatting, setChatting] = useState(false),
    [timer, setTimer] = useState({ seconds: 0, running: false, start: "" }),
    [timingInterview, setTimingInterview] = useState(false);
  useEffect(() => {
    setOpenTabs((tabs) => (tabs.includes(page) ? tabs : [...tabs, page]));
  }, [page]);
  const closeTab = (id: number) => {
    const remaining = openTabs.filter((i) => i !== id);
    if (!remaining.length) return;
    setOpenTabs(remaining);
    if (page === id) setPage(remaining[remaining.length - 1]);
  };
  const s = snapshot?.state;
  const load = async () => {
    try {
      const data = await api<Snapshot>("/state");
      setSnapshot(data);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem("studybuddy-conversation", conversation);
    } catch {
      /* Conversation history remains in SQLite. */
    }
  }, [conversation]);
  useEffect(() => {
    document.documentElement.dataset.theme = s?.settings.theme || "dark";
  }, [s?.settings.theme]);
  useEffect(() => {
    if (!timer.running) return;
    const i = setInterval(
      () => setTimer((t) => ({ ...t, seconds: t.seconds + 1 })),
      1000,
    );
    return () => clearInterval(i);
  }, [timer.running]);
  const mutate = async (
    path: string,
    body: Record<string, unknown> = {},
    method = "POST",
  ) => {
    if (!s) return;
    setBusy(true);
    try {
      const result = await api(path, { ...body, revision: s.revision }, method);
      await load();
      setNotice("已保存到本机数据库");
      return result;
    } catch (e) {
      setError((e as Error).message);
      await load();
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const run = (fn: () => Promise<unknown>) => {
    fn().catch((e) => setError((e as Error).message));
  };
  const settings = (patch: Partial<State["settings"]>) =>
    run(() => mutate("/settings", { settings: { ...s!.settings, ...patch } }));
  const openTask = (task?: Task) => (
    setFocusedTask(task?.id || null),
    setEditor({
      type: "task",
      data: task
        ? { ...task }
        : {
            subject: "教综",
            module: "自定义",
            title: "",
            date,
            estimatedMinutes: "",
            actualMinutes: 0,
            priority: "中",
            status: "未开始",
            note: "",
            mastery: "未评估",
            kind: "其他",
            deadline: "",
          },
    })
  );
  const openWrong = (wrong?: Wrong) =>
    setEditor({
      type: "wrong",
      data: wrong
        ? { ...wrong }
        : {
            subject: "教综3600二轮",
            module: "",
            title: "",
            tags: "",
            reason: "概念混淆",
            answer: "",
            explanation: "",
            aiExplanation: "",
            mastery: "未掌握",
            date,
            round: 2,
            errors: 1,
            relatedId: "",
            history: [],
          },
    });
  const openExam = (exam?: Exam) =>
    setEditor({
      type: "exam",
      data: exam
        ? { ...exam }
        : {
            name: "",
            subject: "教综真题",
            region: "广东",
            year: "",
            date,
            startedAt: timer.start ? timer.start.slice(0, 16) : "",
            finishedAt: timer.start
              ? new Date().toISOString().slice(0, 16)
              : "",
            minutes: Math.round(timer.seconds / 60),
            total: "",
            correct: "",
            score: "",
            wrongCount: 0,
            review: "",
            chapter: "",
          },
    });
  const openInterview = (entry?: Interview) =>
    setEditor({
      type: "interview",
      data: entry
        ? { ...entry }
        : {
            title: "",
            date: date < "2026-11-01" ? "2026-11-01" : date,
            objectives: "",
            keyPoints: "",
            process: "",
            script: "",
            material: "",
            selfReview: "",
            rating: 0,
            minutes: 0,
          },
    });
  const openTeaching = () => {
    const entry = s?.teaching.find((t) => t.date === date);
    setEditor({
      type: "teaching",
      data: entry
        ? { ...entry }
        : {
            date,
            lessons: "",
            load: "待确认",
            availableMinutes: s?.settings.dailyMinutes || 120,
            confirmed: false,
            note: "",
          },
    });
  };
  const all = s?.tasks.filter((t) => !t.deleted) || [],
    todayTasks = all.filter((t) => t.date === date),
    p = s ? progress(s) : { done: 0, total: 0, rate: 0 },
    dayProgress = s ? progress(s, todayTasks) : p;
  const teaching = s?.teaching.find((t) => t.date === date),
    due =
      s?.reviews.filter(
        (r) =>
          !r.completedAt &&
          r.date <= date &&
          all.some((t) => t.id === r.taskId),
      ) || [];
  const filtered = all.filter(
    (t) =>
      `${t.title} ${t.subject} ${t.module}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "全部" || t.status === status),
  );
  const focused = s?.tasks.find((t) => t.id === focusedTask && !t.deleted);
  const activeProposal = s?.proposals.filter((p) => !p.confirmed).at(-1);
  const pendingActions =
    s?.logs
      .filter((l) => l.action === "待确认工具")
      .map((l) => {
        try {
          return JSON.parse(l.detail);
        } catch {
          return null;
        }
      })
      .filter(Boolean) || [];
  const weeklyDates = Array.from({ length: 7 }, (_, i) => addDays(date, i));
  const chartData = useMemo(
    () =>
      s
        ? Array.from({ length: 7 }, (_, i) => {
            const d = addDays(date, i - 6);
            const tasks = s.tasks.filter(
              (t) => !t.deleted && t.originalDate === d,
            );
            return {
              date: d.slice(5),
              完成率: progress(s, tasks).rate,
              学习分钟: minutesTotal(s.sessions.filter((x) => x.date === d)),
            };
          })
        : [],
    [s, date],
  );
  const taskCard = (t: Task) => (
    <article
      className={"task-card " + (t.status === "已完成" ? "is-done" : "")}
      key={t.id}
    >
      <button
        className="task-check"
        disabled={busy}
        aria-label={`${t.status === "已完成" ? "撤销完成" : "完成任务"}：${t.title}`}
        onClick={() => {
          if (
            t.status === "已完成" &&
            !confirm("撤销首次完成？未完成复习节点会移除，已完成复习会保留。")
          )
            return;
          run(() =>
            mutate(
              `/tasks/${encodeURIComponent(t.id)}/${t.status === "已完成" ? "undo" : "complete"}`,
            ),
          );
        }}
      >
        {t.status === "已完成" ? <Check size={15} /> : null}
      </button>
      <div className="task-copy">
        <div className="eyebrow">
          {t.subject} <span> / {t.module}</span>
        </div>
        <button className="task-title" onClick={() => openTask(t)}>
          {t.title}
        </button>
        {t.note.includes("原28天表参考") && (
          <p className="reference-note">
            {
              t.note
                .split("\n")
                .find((x) => x.startsWith("原28天表参考"))
                ?.split("；")[0]
            }
          </p>
        )}
        <div className="task-meta">
          <span>{t.date}</span>
          <span>
            <Clock size={12} />
            {t.estimatedMinutes === null
              ? "时长待补充"
              : `${t.estimatedMinutes} min`}
          </span>
          <span>{t.status}</span>
          <span>实际 {t.actualMinutes} min</span>
          {t.priority === "高" && <Badge>优先完成</Badge>}
        </div>
      </div>
      <Button
        variant="ghost"
        aria-label={`计时：${t.title}`}
        onClick={() => setFocusRequest({ taskId: t.id, nonce: Date.now() })}
      >
        <Clock size={16} />
      </Button>
      <Button
        variant="ghost"
        aria-label={`编辑：${t.title}`}
        onClick={() => openTask(t)}
      >
        <ArrowUpRight size={17} />
      </Button>
    </article>
  );
  const proposalCard = (proposal: Proposal) => (
    <Card className="proposal">
      <div className="section-heading">
        <div>
          <div className="eyebrow">YOUR PLAN, YOUR CHOICE</div>
          <h3>候选安排 · {proposal.minutes} 分钟</h3>
        </div>
        <Badge>尚未执行</Badge>
      </div>
      <div className="proposal-grid">
        {[
          ["本日安排", proposal.selected, proposal.date],
          ["延期至次日", proposal.deferred, addDays(proposal.date, 1)],
          ["时长待补充 · 保持原日期", proposal.unknown, null],
        ].map(([label, ids, target]) => (
          <div key={String(label)}>
            <h4>
              {String(label)} · {(ids as string[]).length}
            </h4>
            {(ids as string[]).length === 0 ? (
              <p className="muted">暂无任务</p>
            ) : (
              (ids as string[]).map((id) => {
                const t = s!.tasks.find((t) => t.id === id);
                const before = proposal.before.find((x) => x.id === id);
                return (
                  <div className="diff-row" key={id}>
                    <strong>{t?.title}</strong>
                    <span>
                      {before?.date} {target ? `→ ${target}` : "· 未移动"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        ))}
      </div>
      {proposal.warnings.map((w) => (
        <p className="info-note" key={w}>
          {w}
        </p>
      ))}
      <Button
        disabled={busy || proposal.revision !== s!.revision}
        onClick={() =>
          run(() =>
            mutate("/schedule/confirm", { id: proposal.id, confirmed: true }),
          )
        }
      >
        <CheckCheck size={16} />
        确认并执行以上日期调整
      </Button>
      {proposal.revision !== s!.revision && (
        <p className="warning">数据已变化，此方案已过期，请重新生成。</p>
      )}
    </Card>
  );
  const sendChat = async (value = chat) => {
    if (!s || !value.trim() || chatting) return;
    setChat("");
    setStream("");
    setChatting(true);
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-StudyBuddy-Intent": "user",
        },
        body: JSON.stringify({
          text: value,
          date,
          conversationId: conversation,
          revision: s.revision,
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw Error(result.error);
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let failure = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;
          const event = JSON.parse(chunk.slice(6));
          if (event.type === "delta") setStream((prev) => prev + event.data);
          if (event.type === "error") failure = event.data;
        }
      }
      if (failure) throw Error(failure);
      await load();
      setStream("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChatting(false);
    }
  };
  const previewFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      setPreview(await api("/import/preview", form));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const saveEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    const { type, data } = editor;
    let v = { ...data };
    if (type === "task") {
      v.estimatedMinutes =
        v.estimatedMinutes === "" ? null : Number(v.estimatedMinutes);
      v.actualMinutes = Number(v.actualMinutes);
      v.deadline = v.deadline || null;
      if (v.id) {
        const {
          id,
          originalDate,
          version,
          status,
          deleted,
          completedAt,
          source,
          ...patch
        } = v;
        await mutate(
          "/tasks/" + encodeURIComponent(id),
          {
            patch: { ...patch, ...(status !== "已完成" ? { status } : {}) },
            recordDate: localDate(),
          },
          "PATCH",
        );
      } else
        await mutate("/tasks", {
          task: { ...v, source: "手动创建" },
          recordDate: localDate(),
        });
    } else if (type === "teaching") {
      v.availableMinutes = Number(v.availableMinutes);
      await mutate("/teaching", { entry: v });
    } else {
      if (type === "exam") {
        for (const k of ["minutes", "total", "correct", "wrongCount"])
          v[k] = Number(v[k]);
        v.score = v.score === "" ? null : Number(v.score);
      }
      if (type === "interview") {
        v.rating = Number(v.rating);
        v.minutes = Number(v.minutes);
      }
      if (type === "wrong") {
        v.round = Number(v.round);
        v.errors = Number(v.errors);
      }
      await mutate(
        "/" + { wrong: "wrongs", exam: "exams", interview: "interviews" }[type],
        { entry: v },
      );
    }
    setEditor(null);
  };
  if (!s)
    return (
      <div className="loading">
        <Leaf />
        <h2>正在整理你的学习空间</h2>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button onClick={load}>重试连接</Button>
          </>
        ) : (
          <div className="skeleton" />
        )}
      </div>
    );
  const editorInput = (
    key: string,
    label: string,
    type = "text",
    options?: string[],
  ) => (
    <Field key={key} label={label} wide={type === "textarea"}>
      {options ? (
        <select
          value={editor!.data[key] ?? ""}
          onChange={(e) =>
            setEditor((ed) => ({
              ...ed!,
              data: { ...ed!.data, [key]: e.target.value },
            }))
          }
        >
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <MarkdownEditor
          value={editor!.data[key] ?? ""}
          onChange={(value) =>
            setEditor((ed) => ({ ...ed!, data: { ...ed!.data, [key]: value } }))
          }
        />
      ) : (
        <input
          type={type}
          min={type === "number" ? 0 : undefined}
          step={
            type === "number" && key === "actualMinutes" ? "any" : undefined
          }
          required={[
            "title",
            "name",
            "date",
            "subject",
            "total",
            "correct",
          ].includes(key)}
          value={editor!.data[key] ?? ""}
          onChange={(e) =>
            setEditor((ed) => ({
              ...ed!,
              data: { ...ed!.data, [key]: e.target.value },
            }))
          }
        />
      )}
    </Field>
  );
  return (
    <div className={"app-shell " + (navCollapsed ? "nav-collapsed" : "")}>
      <div className="workspace-ribbon">
        <div className="vault-gem" title="StudyBuddy">
          ◇
        </div>
        <button
          aria-label="展开或折叠侧栏"
          aria-expanded={!navCollapsed}
          onClick={() => setNavCollapsed(!navCollapsed)}
        >
          <PanelLeftClose size={19} />
        </button>
        <button
          aria-label="快速查找任务"
          onClick={() => {
            setPage(2);
            setQuery("");
          }}
        >
          <Search size={19} />
        </button>
        <button
          aria-label="打开学习日历"
          onClick={() => {
            setPage(2);
            setView("月历");
          }}
        >
          <CalendarDays size={19} />
        </button>
        <button aria-label="打开AI工作区" onClick={() => setPage(1)}>
          <Sparkles size={19} />
        </button>
        <button
          className="ribbon-settings"
          aria-label="工作区设置"
          onClick={() => setPage(8)}
        >
          <Settings size={19} />
        </button>
      </div>
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage(0);
          }}
        >
          <span className="brand-mark">
            <Leaf size={22} />
          </span>
          <span>
            StudyBuddy<small>个人学习知识库</small>
          </span>
        </a>
        <div className="sidebar-label">
          文件与工作区 <span>⌄</span>
        </div>
        <nav>
          {nav.map(([label, Icon], i) => (
            <button
              key={label}
              aria-current={page === i ? "page" : undefined}
              className={page === i ? "active" : ""}
              onClick={() => {
                setPage(i);
                setMenu(false);
                setQuery("");
                setStatus("全部");
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {i === 1 && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="little-note">
            <Leaf size={17} />
            <p>
              不必每天满分，
              <br />
              只要每天靠近一点。
            </p>
            <small>GROW AT YOUR OWN PACE</small>
          </div>
          <div className="profile">
            <span>{s.settings.name.slice(-1)}</span>
            <div>
              <strong>{s.settings.name}的备考日记</strong>
              <small>2027 · 道德与法治</small>
            </div>
            <Button
              variant="ghost"
              aria-label="打开设置"
              onClick={() => setPage(8)}
            >
              <Settings size={16} />
            </Button>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="nav-scrim"
          aria-label="收起导航"
          onClick={() => setMenu(false)}
        />
      )}
      <main>
        <div
          className="workspace-tabs"
          role="tablist"
          aria-label="已打开的工作区"
        >
          {openTabs.map((i) => {
            const Icon = nav[i][1];
            return (
              <div
                className={"workspace-tab " + (page === i ? "active" : "")}
                key={i}
              >
                <button
                  role="tab"
                  aria-selected={page === i}
                  onClick={() => setPage(i)}
                >
                  <Icon size={14} />
                  {nav[i][0]}
                </button>
                {openTabs.length > 1 && (
                  <button
                    className="close-tab"
                    aria-label={"关闭标签：" + nav[i][0]}
                    onClick={() => closeTab(i)}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
          <button
            className="new-workspace-tab"
            aria-label="打开计划标签"
            onClick={() => setPage(2)}
          >
            <Plus size={16} />
          </button>
        </div>
        <header className="topbar">
          <div>
            <Button
              className="mobile-toggle"
              variant="ghost"
              aria-label="打开导航"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={20} />
            </Button>
            <span className="breadcrumb">
              我的空间 <span>/</span> {nav[page][0]}
            </span>
          </div>
          <div className="top-actions">
            <Button
              variant="ghost"
              aria-label="打开专注计时"
              onClick={() => setFocusRequest({ nonce: Date.now() })}
            >
              <Clock size={17} />
              <span className="focus-launch-label">专注计时</span>
            </Button>
            <label className="global-search">
              <Search size={15} />
              <input
                aria-label="搜索任务"
                placeholder="找找你的学习任务…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(2);
                }}
              />
              <kbd>⌕</kbd>
            </label>
            <Button
              variant="ghost"
              aria-label="切换主题"
              onClick={() =>
                settings({
                  theme: s.settings.theme === "light" ? "dark" : "light",
                })
              }
            >
              {s.settings.theme === "light" ? (
                <Moon size={18} />
              ) : (
                <Sun size={18} />
              )}
            </Button>
            <span className="avatar">{s.settings.name.slice(-1)}</span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">{pageText[page][0]}</div>
              <h1>{pageText[page][1]}</h1>
            </div>
            <label className="date-picker">
              <CalendarDays size={16} />
              <input
                aria-label="选定日期"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value || localDate())}
              />
            </label>
          </div>
          {error && (
            <div className="alert" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <Button variant="ghost" onClick={() => setError("")}>
                关闭
              </Button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}
          {page === 0 && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <Badge>
                    <span className="status-dot" />
                    二轮错题 · 稳步积累期
                  </Badge>
                  <h2>
                    你好，{s.settings.name}。<br />
                    今天也有属于你的<span>小小进步。</span>
                  </h2>
                  <p>
                    教综一轮与学科第一套首轮已完成。
                    <br />
                    把注意力留给背诵、错题，和当下能做到的事。
                  </p>
                  <div className="hero-actions">
                    <Button onClick={() => setPage(2)}>
                      开始今日学习 <ArrowRight size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setPage(1);
                        setChat("今天只有两个小时，帮我重新安排");
                      }}
                    >
                      <Sparkles size={16} />
                      和学习助手聊聊
                    </Button>
                  </div>
                </div>
                <div className="daily-note-outline">
                  <FileText size={24} />
                  <span>DAILY NOTE</span>
                  <strong>{date}</strong>
                  <p>记录 · 回顾 · 连接知识</p>
                </div>
              </section>
              <div className="energy-row">
                <div>
                  <span className="tiny-star">✧</span>
                  <strong>今天的学习能量</strong>
                  <span className="muted">照顾状态，也是计划的一部分</span>
                </div>
                <div className="segmented">
                  {["专注", "普通", "疲惫"].map((x) => (
                    <button
                      key={x}
                      className={s.settings.energy === x ? "selected" : ""}
                      onClick={() => settings({ energy: x as any })}
                    >
                      {x === "专注" ? "◉" : x === "普通" ? "◌" : "☾"} {x}
                    </button>
                  ))}
                </div>
              </div>
              <div className="stats-strip">
                <div>
                  <span>今日任务</span>
                  <strong>
                    {dayProgress.done}
                    <small> / {dayProgress.total}</small>
                  </strong>
                  <div className="progress-line">
                    <i style={{ width: dayProgress.rate + "%" }} />
                  </div>
                </div>
                <div>
                  <span>今日实际学习</span>
                  <strong>
                    {minutesTotal(s.sessions.filter((x) => x.date === date))}
                    <small> min</small>
                  </strong>
                  <small>根据已记录学习时长</small>
                </div>
                <div>
                  <span>待回忆的知识点</span>
                  <strong>
                    {due.length}
                    <small> 项</small>
                  </strong>
                  <small>温习一下，就会更熟悉</small>
                </div>
                <div>
                  <span>全计划真实完成</span>
                  <strong>
                    {p.rate}
                    <small> %</small>
                  </strong>
                  <small>
                    {p.done} / {p.total} 项 · 非预测
                  </small>
                </div>
              </div>
              <div className="dashboard-grid">
                <Card className="today-card">
                  <div className="section-heading">
                    <div>
                      <div className="eyebrow">TODAY'S FOCUS</div>
                      <h2>今天，专注这几件事</h2>
                    </div>
                    <Button variant="ghost" onClick={() => setPage(2)}>
                      全部任务 <ArrowUpRight size={17} />
                    </Button>
                  </div>
                  <div className="load-note">
                    <span className="status-dot" />
                    {teaching?.load || "课表待确认"} ·{" "}
                    {teaching?.confirmed
                      ? teaching.lessons
                      : "固定课表未确认，请核对教学安排"}
                    <button onClick={openTeaching}>调整</button>
                  </div>
                  {todayTasks.length ? (
                    todayTasks.slice(0, 5).map(taskCard)
                  ) : (
                    <Empty>这一天没有任务，可以新增或调整计划。</Empty>
                  )}
                  <Button
                    variant="outline"
                    className="full"
                    onClick={() => openTask()}
                  >
                    <Plus size={15} />
                    为今天加一件小事
                  </Button>
                </Card>
                <div className="right-stack">
                  <Card className="coach-card">
                    <div className="section-heading">
                      <span className="icon-tile">
                        <Sparkles size={22} />
                      </span>
                      <Badge>
                        {s.settings.provider === "mock"
                          ? "Mock 规则建议"
                          : s.settings.provider === "off"
                            ? "AI 已关闭"
                            : "AI 学习助手"}
                      </Badge>
                    </div>
                    <div className="eyebrow">A GENTLE REMINDER</div>
                    <h3>
                      {s.settings.energy === "疲惫"
                        ? "累的时候，先做好保底。"
                        : "计划可以调整，积累不会白费。"}
                    </h3>
                    <p>
                      {teaching?.load === "高负荷"
                        ? "今天课务较重。先留时间给背诵与复习，整套真题可以另选日期。"
                        : "先背诵，再用3600错题暴露漏洞。没有真实成绩时，不急着评价掌握程度。"}
                    </p>
                    <Button variant="ghost" onClick={() => setPage(1)}>
                      整理我的学习节奏 <ArrowRight size={15} />
                    </Button>
                  </Card>
                  <Card>
                    <div className="section-heading">
                      <h3>留一点时间，给回忆</h3>
                      <Brain size={19} />
                    </div>
                    <p className="muted">
                      {s.settings.reminders
                        ? `有 ${due.length} 项到期复习等你回来。`
                        : "复习提醒已关闭，可在遗忘曲线页查看。"}
                    </p>
                    <Button variant="outline" onClick={() => setPage(3)}>
                      打开复习清单 <ArrowUpRight size={15} />
                    </Button>
                  </Card>
                </div>
              </div>
              <div className="two-columns">
                <Card>
                  <div className="section-heading">
                    <div>
                      <div className="eyebrow">YOUR RECENT RHYTHM</div>
                      <h3>最近七天 · 实际学习时长</h3>
                    </div>
                    <Badge>分钟</Badge>
                  </div>
                  <Chart data={chartData} field="学习分钟" />
                </Card>
                <Card className="next-card">
                  <div className="eyebrow">WHAT'S COMING</div>
                  <h3>把从容，留给下一步</h3>
                  <div className="next-item">
                    <ClipboardCheck size={20} />
                    <div>
                      <strong>近期真题与复盘</strong>
                      <p>
                        {all
                          .filter(
                            (t) =>
                              t.kind === "真题" &&
                              t.date >= date &&
                              t.status !== "已完成",
                          )
                          .slice(0, 1)
                          .map((t) => t.date + " · " + t.title)
                          .join("") || "暂无后续安排"}
                      </p>
                    </div>
                  </div>
                  <div className="next-item">
                    <Mic size={20} />
                    <div>
                      <strong>11月第一周 · 试讲启程</strong>
                      <p>
                        {all.find((t) => t.kind === "面试" && t.date >= date)
                          ?.date || "可以先准备试讲篇目与教案"}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" onClick={() => setPage(6)}>
                    看看面试训练 <ArrowUpRight size={16} />
                  </Button>
                </Card>
              </div>
            </>
          )}
          {page === 1 && (
            <div className="chat-layout">
              <Card className="chat-panel">
                <div className="section-heading">
                  <div className="assistant-title">
                    <span className="icon-tile">
                      <Sparkles size={22} />
                    </span>
                    <div>
                      <h2>Study Companion</h2>
                      <p>
                        {s.settings.provider === "mock"
                          ? "Mock · 基于真实记录的规则助手"
                          : s.settings.provider === "off"
                            ? "已关闭 AI 服务"
                            : s.settings.provider === "deepseek"
                              ? `DeepSeek · ${snapshot.capabilities.deepseekModel}`
                              : `OpenAI · ${snapshot.capabilities.model}`}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={chatting}
                    onClick={() => {
                      setConversation(uid());
                      setStream("");
                    }}
                  >
                    新对话 <Plus size={15} />
                  </Button>
                </div>
                <div className="conversation-history">
                  <select
                    aria-label="历史对话"
                    value={
                      s.conversations.some((c) => c.id === conversation)
                        ? conversation
                        : ""
                    }
                    onChange={(e) => {
                      if (e.target.value) setConversation(e.target.value);
                    }}
                  >
                    <option value="">选择历史对话</option>
                    {s.conversations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="messages">
                  {!s.messages.some((m) => m.conversationId === conversation) &&
                    !chatting && (
                      <div className="chat-welcome">
                        <Sparkles size={30} />
                        <h2>先说说，今天的你。</h2>
                        <p>
                          学习时间变了，或者有些累？
                          <br />
                          我会读取你的真实计划，把可调整的部分理清。
                        </p>
                        <div className="quick-prompts">
                          {[
                            "今天只有两个小时，帮我重新安排",
                            "看看今天的任务和真实进度",
                            "根据错题给我6600补漏建议",
                            "帮我做一次本周复盘",
                          ].map((x) => (
                            <button
                              key={x}
                              onClick={() => run(() => sendChat(x))}
                            >
                              {x}
                              <ArrowUpRight size={14} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  {s.messages
                    .filter((m) => m.conversationId === conversation)
                    .map((m) => (
                      <div className={"message " + m.role} key={m.id}>
                        <small>
                          {m.role === "user"
                            ? s.settings.name
                            : "Study Companion"}
                        </small>
                        <MarkdownView value={m.content} />
                      </div>
                    ))}
                  {stream && (
                    <div className="message assistant">
                      <small>Study Companion</small>
                      <MarkdownView value={stream} />
                    </div>
                  )}
                  {chatting && !stream && (
                    <div className="skeleton" aria-label="正在读取计划" />
                  )}
                </div>
                <form
                  className="chat-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => sendChat());
                  }}
                >
                  <textarea
                    aria-label="给学习助手的消息"
                    placeholder="说说你今天的时间和状态…"
                    value={chat}
                    onChange={(e) => setChat(e.target.value)}
                    rows={2}
                  />
                  <Button
                    aria-label="发送消息"
                    disabled={
                      chatting || s.settings.provider === "off" || !chat.trim()
                    }
                  >
                    <Send size={18} />
                  </Button>
                </form>
                <p className="chat-disclaimer">
                  {s.settings.provider === "mock"
                    ? "Mock 不调用真实模型。"
                    : "AI 建议仅供参考。"}
                  计划变更由你确认，真实执行结果会写入操作日志。
                </p>
              </Card>
              <div className="right-stack">
                <Card>
                  <div className="eyebrow">CONNECTED TO YOUR REAL PLAN</div>
                  <h3>对你的计划，有据可依</h3>
                  <dl className="detail-list">
                    <div>
                      <dt>当前日期</dt>
                      <dd>{date}</dd>
                    </div>
                    <div>
                      <dt>当日任务</dt>
                      <dd>{todayTasks.length} 项</dd>
                    </div>
                    <div>
                      <dt>可用学习时间</dt>
                      <dd>
                        {teaching?.availableMinutes ?? s.settings.dailyMinutes}{" "}
                        min
                      </dd>
                    </div>
                    <div>
                      <dt>课务状态</dt>
                      <dd>{teaching?.confirmed ? teaching.load : "待确认"}</dd>
                    </div>
                  </dl>
                  <Button variant="outline" onClick={openTeaching}>
                    调整课务与时间
                  </Button>
                </Card>
                <Card>
                  <h3>工具执行记录</h3>
                  {s.logs
                    .filter((l) => l.action === "调用工具")
                    .slice(-5)
                    .reverse()
                    .map((l) => (
                      <div className="tool-record" key={l.id}>
                        <Check size={14} />
                        <span>
                          {(
                            {
                              get_today_tasks: "读取当日任务",
                              get_study_progress: "读取真实进度",
                              get_timetable: "读取实习课表",
                              propose_reschedule: "生成候选安排",
                              get_weekly_plan: "查询每周计划",
                              create_task: "准备新增任务候选",
                              update_task: "准备任务修改候选",
                              complete_task: "准备完成打卡候选",
                              confirm_reschedule: "提示需要用户确认",
                              add_wrong_question: "准备新增错题候选",
                              get_weak_topics: "查询错题",
                              generate_weekly_review: "生成数据复盘",
                            } as Record<string, string>
                          )[l.detail] || l.detail}
                        </span>
                      </div>
                    ))}
                </Card>
              </div>
              <div className="wide">
                {activeProposal && proposalCard(activeProposal)}
                {pendingActions.slice(-3).map((a) => (
                  <Card key={a.id}>
                    <h3>待确认：{toolLabels[a.name] || "学习记录变更"}</h3>
                    <p>
                      {a.input.title ||
                        s.tasks.find((t) => t.id === a.input.id)?.title ||
                        a.input.patch?.title ||
                        "请核对操作内容"}
                    </p>
                    {a.input.patch && (
                      <div className="info-note">
                        {Object.entries(a.input.patch).map(([key, value]) => (
                          <p key={key}>
                            {(
                              {
                                title: "内容",
                                date: "安排日期",
                                estimatedMinutes: "预计分钟",
                                note: "备注",
                                priority: "优先级",
                              } as Record<string, string>
                            )[key] || key}
                            ：{String(value ?? "待补充")}
                          </p>
                        ))}
                      </div>
                    )}
                    <p className="muted">
                      确认后才会写入数据。数据变化后需要重新提出。
                    </p>
                    <Button
                      disabled={busy || a.revision !== s.revision}
                      onClick={() =>
                        run(() =>
                          mutate("/tools/confirm", {
                            id: a.id,
                            confirmed: true,
                          }),
                        )
                      }
                    >
                      确认执行此操作
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}
          {page === 2 && (
            <>
              <div className="toolbar">
                <div className="segmented">
                  {["每日", "每周", "月历", "时间线", "全部"].map((x) => (
                    <button
                      key={x}
                      className={view === x ? "selected" : ""}
                      onClick={() => setView(x)}
                    >
                      {x}
                    </button>
                  ))}
                </div>
                <div className="inline-actions">
                  <select
                    aria-label="任务状态筛选"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {["全部", "未开始", "进行中", "已完成", "待确认"].map(
                      (x) => (
                        <option key={x}>{x}</option>
                      ),
                    )}
                  </select>
                  <Button onClick={() => openTask()}>
                    <Plus size={16} />
                    新增任务
                  </Button>
                </div>
              </div>
              <div className="load-note">
                <CalendarDays size={15} />
                {teaching?.confirmed
                  ? `${teaching.load} · ${teaching.lessons} · 可用 ${teaching.availableMinutes} 分钟`
                  : "此日固定课表待确认，请核对后排期"}
                <button onClick={openTeaching}>修改负荷 / 临时课务</button>
              </div>
              {view === "月历" ? (
                <Card>
                  <div className="section-heading">
                    <Button
                      variant="ghost"
                      aria-label="上个月"
                      onClick={() => {
                        const d = new Date(date + "T12:00:00");
                        d.setDate(1);
                        d.setMonth(d.getMonth() - 1);
                        setDate(localDate(d));
                      }}
                    >
                      <ChevronLeft size={18} />
                    </Button>
                    <h2>
                      {date.slice(0, 4)} 年 {Number(date.slice(5, 7))} 月
                    </h2>
                    <Button
                      variant="ghost"
                      aria-label="下个月"
                      onClick={() => {
                        const d = new Date(date + "T12:00:00");
                        d.setDate(1);
                        d.setMonth(d.getMonth() + 1);
                        setDate(localDate(d));
                      }}
                    >
                      <ChevronRight size={18} />
                    </Button>
                  </div>
                  <div className="calendar-grid">
                    {["日", "一", "二", "三", "四", "五", "六"].map((x) => (
                      <div className="weekday" key={x}>
                        {x}
                      </div>
                    ))}
                    {Array.from(
                      {
                        length: new Date(
                          date.slice(0, 7) + "-01T12:00:00",
                        ).getDay(),
                      },
                      (_, i) => (
                        <div key={"blank" + i} />
                      ),
                    )}
                    {Array.from(
                      {
                        length: new Date(
                          Number(date.slice(0, 4)),
                          Number(date.slice(5, 7)),
                          0,
                        ).getDate(),
                      },
                      (_, i) => {
                        const d =
                          date.slice(0, 7) +
                          "-" +
                          String(i + 1).padStart(2, "0");
                        const tasks = filtered.filter((t) => t.date === d);
                        return (
                          <button
                            key={d}
                            className={
                              "calendar-cell " + (date === d ? "selected" : "")
                            }
                            onClick={() => setDate(d)}
                          >
                            <strong>{i + 1}</strong>
                            <span>{tasks.length} 项</span>
                            <div className="calendar-dots">
                              {tasks.slice(0, 5).map((t) => (
                                <i
                                  className={
                                    t.status === "已完成" ? "done" : ""
                                  }
                                  key={t.id}
                                />
                              ))}
                            </div>
                          </button>
                        );
                      },
                    )}
                  </div>
                  <h3>{date} 的任务</h3>
                  {filtered.filter((t) => t.date === date).map(taskCard)}
                </Card>
              ) : view === "每周" ? (
                <div className="week-grid">
                  {weeklyDates.map((d) => (
                    <Card key={d}>
                      <div className="eyebrow">
                        {new Date(d + "T12:00:00").toLocaleDateString("zh-CN", {
                          weekday: "long",
                        })}
                      </div>
                      <h3>{d.slice(5)}</h3>
                      {filtered.filter((t) => t.date === d).map(taskCard)}
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <div className="section-heading">
                    <h2>
                      {view === "每日"
                        ? `${date} · 每日计划`
                        : view === "时间线"
                          ? "学习时间线"
                          : "全部任务"}
                    </h2>
                    <Badge>
                      {view === "每日" ? todayTasks.length : filtered.length} 项
                    </Badge>
                  </div>
                  {(view === "每日"
                    ? filtered.filter((t) => t.date === date)
                    : filtered
                        .slice()
                        .sort((a, b) => a.date.localeCompare(b.date))
                  ).map(taskCard)}
                  {(view === "每日"
                    ? filtered.filter((t) => t.date === date)
                    : filtered
                  ).length === 0 && <Empty>没有符合条件的任务。</Empty>}
                </Card>
              )}
              <Card className="source-plans">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">YOUR ORIGINAL PLAN, PRESERVED</div>
                    <h3>每周目标、月度安排与原始参考</h3>
                  </div>
                  <Badge>源表原文</Badge>
                </div>
                {s.plans
                  .filter((p) =>
                    ["每周", "月度", "参考", "规则"].includes(p.type),
                  )
                  .map((p) => (
                    <details key={p.id}>
                      <summary>
                        {p.name}
                        <span>{p.rows.length} 行</span>
                      </summary>
                      <div className="source-table">
                        <table>
                          <tbody>
                            {p.rows.map((r, i) => (
                              <tr key={i}>
                                {r.map((v, j) => (
                                  <td key={j}>{v}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
              </Card>
              <Card>
                <div className="section-heading">
                  <h3>
                    任务回收站 · {s.tasks.filter((t) => t.deleted).length} 项
                  </h3>
                </div>
                {s.tasks
                  .filter((t) => t.deleted)
                  .map((t) => (
                    <div className="compact-row" key={t.id}>
                      <span>{t.title}</span>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            mutate(
                              `/tasks/${encodeURIComponent(t.id)}/restore`,
                            ),
                          )
                        }
                      >
                        恢复
                      </Button>
                    </div>
                  ))}
              </Card>
            </>
          )}
          {page === 3 && (
            <>
              <div className="info-note">
                首次背诵完成后，按实际完成日生成 D1 / D3 / D7 / D14 / D30
                五个唯一节点；原 Excel
                的复习日期保存在学习计划参考中。复习与首次学习分别记录。
              </div>
              <div className="toolbar">
                <h2>待复习 {due.length} 项</h2>
                <Badge>
                  已复习 {s.reviews.filter((r) => r.completedAt).length} 次
                </Badge>
              </div>
              <div className="review-grid">
                {s.reviews
                  .filter((r) => all.some((t) => t.id === r.taskId))
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((r) => (
                    <Card key={r.id}>
                      <div className="section-heading">
                        <Badge>D{r.stage}</Badge>
                        <span className="muted">
                          {r.completedAt
                            ? "已完成"
                            : r.date <= date
                              ? "到期复习"
                              : "待复习"}
                        </span>
                      </div>
                      <h3>{all.find((t) => t.id === r.taskId)?.title}</h3>
                      <div className="form-grid">
                        <Field label="下次复习日期">
                          <input
                            type="date"
                            value={r.date}
                            disabled={!!r.completedAt || busy}
                            onChange={(e) => {
                              if (e.target.value)
                                run(() =>
                                  mutate(
                                    "/reviews/" + encodeURIComponent(r.id),
                                    { date: e.target.value },
                                  ),
                                );
                            }}
                          />
                        </Field>
                        <Field label="本次自评">
                          <select
                            value={r.mastery}
                            disabled={busy}
                            onChange={(e) =>
                              run(() =>
                                mutate("/reviews/" + encodeURIComponent(r.id), {
                                  mastery: e.target.value,
                                }),
                              )
                            }
                          >
                            {["未评估", "生疏", "一般", "熟练"].map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      {!r.completedAt ? (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              mutate("/reviews/" + encodeURIComponent(r.id), {
                                complete: true,
                              }),
                            )
                          }
                        >
                          <Check size={15} />
                          完成这次复习
                        </Button>
                      ) : (
                        <p className="muted">
                          完成于 {r.completedAt.slice(0, 10)}
                        </p>
                      )}
                    </Card>
                  ))}
              </div>
              {!s.reviews.length && (
                <Card>
                  <Empty>
                    还没有实际完成的背诵。先在学习计划打卡，再从这里开始复习。
                  </Empty>
                </Card>
              )}
            </>
          )}
          {page === 4 && (
            <>
              <div className="toolbar">
                <div className="inline-actions">
                  <input
                    aria-label="搜索错题"
                    placeholder="搜索知识点、标签或科目"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <select
                    aria-label="掌握程度筛选"
                    value={
                      ["全部", "未掌握", "模糊", "已掌握"].includes(status)
                        ? status
                        : "全部"
                    }
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {["全部", "未掌握", "模糊", "已掌握"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
                <Button onClick={() => openWrong()}>
                  <Plus size={16} />
                  记录错题
                </Button>
              </div>
              <div className="review-grid">
                {s.wrongs
                  .filter(
                    (w) =>
                      (status === "全部" ||
                        !["未掌握", "模糊", "已掌握"].includes(status) ||
                        w.mastery === status) &&
                      `${w.title} ${w.subject} ${w.tags}`.includes(query),
                  )
                  .map((w) => (
                    <Card key={w.id}>
                      <div className="section-heading">
                        <Badge>
                          {w.subject} · 第{w.round}轮
                        </Badge>
                        <Button
                          variant="ghost"
                          aria-label={"删除错题" + w.title}
                          onClick={() => {
                            if (confirm("删除这条错题记录？"))
                              run(() =>
                                mutate("/wrongs/" + w.id, {}, "DELETE"),
                              );
                          }}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                      <h3>{w.title}</h3>
                      <p className="muted">
                        {w.module} · {w.tags} · {w.mastery}
                      </p>
                      <p>错因：{w.reason}</p>
                      <p>正确答案：{w.answer || "待记录"}</p>
                      <p>个人解析：{w.explanation || "待复盘"}</p>
                      {w.aiExplanation && (
                        <div className="info-note">
                          AI 补充（非用户原文）：{w.aiExplanation}
                        </div>
                      )}
                      <p className="muted">
                        复习 {w.date} · 累计错误 {w.errors} 次
                      </p>
                      <div className="inline-actions wrap">
                        <Button variant="outline" onClick={() => openWrong(w)}>
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setPage(1);
                            setChat(
                              `请根据我记录的错题“${w.title}”（ID ${w.id}）提供辅助解析，区分我的原始内容与AI补充；若缺少题干或答案请说明。`,
                            );
                          }}
                        >
                          AI 辅助解析
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              mutate("/wrongs/" + w.id + "/review", {
                                again: false,
                              }),
                            )
                          }
                        >
                          完成复习
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              mutate("/wrongs/" + w.id + "/review", {
                                again: true,
                              }),
                            )
                          }
                        >
                          再次错误
                        </Button>
                      </div>
                      <details>
                        <summary>复习历史</summary>
                        {w.history.map((h, i) => (
                          <p key={i}>{h}</p>
                        ))}
                      </details>
                    </Card>
                  ))}
              </div>
              {!s.wrongs.length && (
                <Card>
                  <Empty>从真实遇到的一道错题开始，不必抄下整本题库。</Empty>
                </Card>
              )}
              <div className="toolbar">
                <Button
                  variant="outline"
                  onClick={() => saveFile("StudyBuddy-错题.json", s.wrongs)}
                >
                  <Download size={16} />
                  导出错题
                </Button>
                <p className="muted">
                  支持3600二轮、6600补漏、学科一二套错题与行测分类；关联ID可在编辑页记录。
                </p>
              </div>
            </>
          )}
          {page === 5 && (
            <>
              <div className="two-columns">
                <Card className="timer-card">
                  <div className="eyebrow">ONE SESSION AT A TIME</div>
                  <h2>把注意力，交给这一场练习。</h2>
                  <div className="timer-number">
                    {String(Math.floor(timer.seconds / 60)).padStart(2, "0")}
                    <span>:</span>
                    {String(timer.seconds % 60).padStart(2, "0")}
                  </div>
                  <div className="inline-actions">
                    <Button
                      onClick={() => {
                        setTimingInterview(false);
                        setTimer((t) => ({
                          ...t,
                          running: !t.running,
                          start: t.start || new Date().toISOString(),
                        }));
                      }}
                    >
                      {timer.running ? <Pause size={16} /> : <Play size={16} />}{" "}
                      {timer.running ? "暂停" : "开始计时"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setTimer({ seconds: 0, running: false, start: "" })
                      }
                    >
                      <RotateCcw size={16} />
                      重置
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTimer((t) => ({ ...t, running: false }));
                        openExam();
                      }}
                    >
                      记录本次练习
                    </Button>
                  </div>
                </Card>
                <Card>
                  <div className="eyebrow">SUBJECT KNOWLEDGE · SET TWO</div>
                  <h3>学科第二套题，从零扎实开始。</h3>
                  <div className="big-number">
                    {s.exams
                      .filter((e) => e.subject === "道德与法治第二套题")
                      .reduce((a, e) => a + e.total, 0)}
                    <small> 题已记录</small>
                  </div>
                  <p className="muted">
                    总题量 {s.settings.subjectTwoTotal ?? "待确认"}。
                    {s.settings.subjectTwoTotal
                      ? "按真实练习记录累计，不等于唯一题目覆盖率。"
                      : "不显示虚构的完成百分比。"}
                  </p>
                  <p>第一套题已完成首轮，继续以错题整理为主。</p>
                  <Button variant="ghost" onClick={() => setPage(4)}>
                    整理学科错题 <ArrowUpRight size={16} />
                  </Button>
                </Card>
              </div>
              <div className="toolbar">
                <h2>每次练习，都留下真实记录</h2>
                <Button onClick={() => openExam()}>
                  <Plus size={16} />
                  记录套卷 / 专项
                </Button>
              </div>
              <div className="review-grid">
                {s.exams.map((e) => (
                  <Card key={e.id}>
                    <div className="section-heading">
                      <Badge>{e.subject}</Badge>
                      <span className="muted">{e.date}</span>
                    </div>
                    <h3>{e.name}</h3>
                    <div className="big-number">
                      {Math.round((e.correct / e.total) * 100)}
                      <small>% 正确率</small>
                    </div>
                    <p>
                      {e.region} · {e.year} · {e.chapter || "综合"} ·{" "}
                      {e.minutes} min
                    </p>
                    <p>
                      {e.correct}/{e.total} 题正确 · 错题 {e.wrongCount} · 得分{" "}
                      {e.score ?? "未填"}
                    </p>
                    <p className="muted">
                      {e.review || "等你写下这次练习的收获。"}
                    </p>
                    <div className="inline-actions">
                      <Button variant="outline" onClick={() => openExam(e)}>
                        编辑记录
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          openWrong();
                          setEditor((ed) => ({
                            ...ed!,
                            data: {
                              ...ed!.data,
                              subject: e.subject,
                              module: e.chapter,
                              tags: e.name,
                            },
                          }));
                        }}
                      >
                        归档错题
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={"删除练习" + e.name}
                        onClick={() => {
                          if (confirm("删除此练习记录？"))
                            run(() => mutate("/exams/" + e.id, {}, "DELETE"));
                        }}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
              {!s.exams.length && (
                <Card>
                  <Empty>
                    尚无真实练习记录。没有预置商业题库，也不把计划套卷当成已完成。
                  </Empty>
                </Card>
              )}
            </>
          )}
          {page === 6 && (
            <>
              <div className="two-columns">
                <Card className="coach-card">
                  <div className="eyebrow">A CLASSROOM OF YOUR OWN</div>
                  <h2>十分钟，练习站上讲台。</h2>
                  <p>
                    从2026年11月第一周开始训练。先准备篇目、目标和重难点，再写教学过程与逐字稿。
                  </p>
                  <p className="info-note">
                    录音或视频只记录本地资料位置；未提供实际材料时，不会声称评估过你的表现。
                  </p>
                  <Button onClick={() => openInterview()}>
                    <Plus size={16} />
                    新建训练教案
                  </Button>
                </Card>
                <Card className="timer-card">
                  <div className="eyebrow">10-MINUTE MICRO LESSON</div>
                  <div className="timer-number">
                    {String(
                      Math.floor(Math.max(0, 600 - timer.seconds) / 60),
                    ).padStart(2, "0")}
                    <span>:</span>
                    {String(Math.max(0, 600 - timer.seconds) % 60).padStart(
                      2,
                      "0",
                    )}
                  </div>
                  {timingInterview && timer.seconds >= 600 && (
                    <p role="status">10分钟已到，可以结束试讲并记录复盘。</p>
                  )}
                  <div className="inline-actions">
                    <Button
                      onClick={() => {
                        setTimingInterview(true);
                        setTimer((t) => ({
                          ...t,
                          running: !t.running,
                          start: t.start || new Date().toISOString(),
                        }));
                      }}
                    >
                      {timer.running ? "暂停" : "开始试讲"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setTimer({ seconds: 0, running: false, start: "" })
                      }
                    >
                      重置
                    </Button>
                  </div>
                  <p className="muted">
                    计时不自动判定训练完成，实际时长由你记录。
                  </p>
                </Card>
              </div>
              <div className="toolbar">
                <h2>训练日历与历史</h2>
                <Badge>{s.interviews.length} 次已记录</Badge>
              </div>
              <div className="review-grid">
                {s.interviews
                  .slice()
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((i) => (
                    <Card key={i.id}>
                      <div className="section-heading">
                        <Badge>{i.date}</Badge>
                        <span className="muted">自评 {i.rating}/5</span>
                      </div>
                      <h3>{i.title}</h3>
                      <p>{i.objectives || "教学目标待完善"}</p>
                      <p className="muted">{i.selfReview || "复盘待记录"}</p>
                      <p className="muted">资料：{i.material || "未提供"}</p>
                      <div className="inline-actions">
                        <Button
                          variant="outline"
                          onClick={() => openInterview(i)}
                        >
                          教案 / 逐字稿 / 复盘
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label={"删除训练" + i.title}
                          onClick={() => {
                            if (confirm("删除这条训练？"))
                              run(() =>
                                mutate("/interviews/" + i.id, {}, "DELETE"),
                              );
                          }}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </Card>
                  ))}
              </div>
              {!s.interviews.length && (
                <Card>
                  <Empty>还没有训练记录，可以先建立你的第一篇教案。</Empty>
                </Card>
              )}
            </>
          )}
          {page === 7 && (
            <>
              <div className="stats-strip">
                <div>
                  <span>累计任务完成</span>
                  <strong>
                    {p.done}
                    <small> / {p.total}</small>
                  </strong>
                </div>
                <div>
                  <span>学习 / 练习记录</span>
                  <strong>
                    {activeSessions(s).filter((x) => x.type !== "复习").length}
                    <small> 次</small>
                  </strong>
                </div>
                <div>
                  <span>实际复习</span>
                  <strong>
                    {s.reviews.filter((x) => x.completedAt).length}
                    <small> 次</small>
                  </strong>
                </div>
                <div>
                  <span>错题已掌握</span>
                  <strong>
                    {s.wrongs.filter((w) => w.mastery === "已掌握").length}
                    <small> / {s.wrongs.length}</small>
                  </strong>
                </div>
              </div>
              <div className="two-columns">
                <Card>
                  <h3>每日完成率 · 原计划日期</h3>
                  <Chart data={chartData} field="完成率" />
                </Card>
                <Card>
                  <h3>各学科实际投入时间</h3>
                  <Chart
                    data={["教综", "道德与法治", "行测", "面试"].map(
                      (subject) => ({
                        date: subject,
                        学习分钟: minutesTotal(
                          s.sessions.filter(
                            (x) =>
                              s.tasks.find((t) => t.id === x.taskId)
                                ?.subject === subject,
                          ),
                        ),
                      }),
                    )}
                    field="学习分钟"
                  />
                </Card>
                <Card>
                  <h3>周与月 · 真实完成 / 原计划任务</h3>
                  {[
                    ["近七天", addDays(date, -6), date],
                    [
                      "本月",
                      date.slice(0, 7) + "-01",
                      date.slice(0, 7) + "-31",
                    ],
                  ].map(([label, start, end]) => {
                    const x = progress(
                      s,
                      all.filter(
                        (t) => t.originalDate >= start && t.originalDate <= end,
                      ),
                    );
                    return (
                      <div className="metric-row" key={label}>
                        <span>{label}</span>
                        <strong>
                          {x.rate}%{" "}
                          <small>
                            {x.done}/{x.total}
                          </small>
                        </strong>
                      </div>
                    );
                  })}
                  <p className="muted">
                    任务顺延不改变原计划分母；实际学习时长按真实记录日期统计。
                  </p>
                </Card>
                <Card>
                  <h3>真题成绩趋势 · 正确率</h3>
                  <Chart
                    data={s.exams
                      .slice()
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((e) => ({
                        date: e.date.slice(5) + " " + e.name,
                        正确率: Math.round((e.correct / e.total) * 100),
                      }))}
                    field="正确率"
                    line
                  />
                </Card>
              </div>
              <Card>
                <h3>专项推进 · 只展示真实记录</h3>
                <div className="review-grid">
                  {[
                    "教综3600二轮",
                    "教综6600补漏",
                    "道德与法治第二套题",
                    "言语理解",
                    "判断推理",
                    "资料分析",
                  ].map((subject) => {
                    const records = s.exams.filter(
                      (e) => e.subject === subject,
                    );
                    const total = records.reduce((a, e) => a + e.total, 0),
                      correct = records.reduce((a, e) => a + e.correct, 0);
                    return (
                      <div className="metric-box" key={subject}>
                        <span>{subject}</span>
                        <strong>
                          {total} <small>题已记录</small>
                        </strong>
                        <small>
                          {total
                            ? `加权正确率 ${Math.round((correct / total) * 100)}%`
                            : "尚无真实成绩，掌握情况待评估"}
                        </small>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          )}
          {page === 8 && (
            <>
              <div className="two-columns">
                <Card>
                  <div className="eyebrow">MAKE IT YOURS</div>
                  <h2>学习偏好</h2>
                  <form
                    className="form-grid"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      run(() =>
                        mutate("/settings", {
                          settings: {
                            ...s.settings,
                            name: form.get("name"),
                            dailyMinutes: Number(form.get("dailyMinutes")),
                            planStart: form.get("planStart"),
                            planEnd: form.get("planEnd"),
                            subjectTwoTotal: form.get("total")
                              ? Number(form.get("total"))
                              : null,
                          },
                        }),
                      );
                    }}
                    key={
                      s.settings.name +
                      s.settings.dailyMinutes +
                      s.settings.planStart +
                      s.settings.planEnd +
                      s.settings.subjectTwoTotal
                    }
                  >
                    <Field label="你的名字">
                      <input
                        name="name"
                        required
                        defaultValue={s.settings.name}
                      />
                    </Field>
                    <Field label="默认每日可用分钟">
                      <input
                        name="dailyMinutes"
                        type="number"
                        min="0"
                        max="1440"
                        required
                        defaultValue={s.settings.dailyMinutes}
                      />
                    </Field>
                    <Field label="计划开始">
                      <input
                        name="planStart"
                        type="date"
                        defaultValue={s.settings.planStart}
                        required
                      />
                    </Field>
                    <Field label="计划结束">
                      <input
                        name="planEnd"
                        type="date"
                        defaultValue={s.settings.planEnd}
                        required
                      />
                    </Field>
                    <Field label="第二套题总量（未知请留空）" wide>
                      <input
                        name="total"
                        type="number"
                        min="1"
                        defaultValue={s.settings.subjectTwoTotal ?? ""}
                      />
                    </Field>
                    <Button disabled={busy}>保存偏好</Button>
                  </form>
                  <div className="metric-row">
                    <span>复习提醒</span>
                    <input
                      type="checkbox"
                      aria-label="启用复习提醒"
                      checked={s.settings.reminders}
                      onChange={(e) =>
                        settings({ reminders: e.target.checked })
                      }
                    />
                  </div>
                  <div className="metric-row">
                    <span>界面主题</span>
                    <Button
                      variant="outline"
                      onClick={() =>
                        settings({
                          theme:
                            s.settings.theme === "light" ? "dark" : "light",
                        })
                      }
                    >
                      {s.settings.theme === "light"
                        ? "浅色 · 切换深色"
                        : "深色 · 切换浅色"}
                    </Button>
                  </div>
                </Card>
                <Card>
                  <div className="eyebrow">YOUR PERSONAL COACH</div>
                  <h2>AI Provider</h2>
                  <Field label="助手模式">
                    <select
                      value={s.settings.provider}
                      disabled={busy}
                      onChange={(e) =>
                        settings({ provider: e.target.value as any })
                      }
                    >
                      <option value="mock">Mock · 无需密钥的规则助手</option>
                      <option value="deepseek">DeepSeek · 中文学习助手</option>
                      <option value="openai">
                        OpenAI · 服务端 Responses API
                      </option>
                      <option value="off">关闭 AI · 普通功能继续使用</option>
                    </select>
                  </Field>
                  <div className="info-note">
                    {s.settings.provider === "deepseek"
                      ? snapshot.capabilities.deepseekConfigured
                        ? "服务端已配置DeepSeek密钥。"
                        : snapshot.capabilities.desktop
                          ? "DeepSeek尚未配置。请在顶部菜单 StudyBuddy → AI 配置中保存密钥。"
                          : "DeepSeek尚未配置。请按README在本机 .env 中设置密钥并重启。"
                      : snapshot.capabilities.openaiConfigured
                        ? "服务端已配置模型密钥。"
                        : "服务端尚未配置模型密钥。Mock 可直接使用。"}
                  </div>
                  {snapshot.capabilities.desktop ? (
                    <p className="info-note">
                      桌面版请使用软件顶部菜单「StudyBuddy → AI
                      配置」，直接保存密钥和模型名称，无需打开文件或终端。
                    </p>
                  ) : (
                    <p className="muted">
                      DeepSeek 使用 DEEPSEEK_API_KEY 和 DEEPSEEK_MODEL（默认
                      deepseek-chat）。密钥只放在服务端 .env。OpenAI 使用
                      OPENAI_API_KEY。不要将密钥填入网页或聊天。OpenAI模型由
                      OPENAI_MODEL 指定，默认 gpt-4.1-mini。
                    </p>
                  )}
                  <h3>实习课表与负荷</h3>
                  <p>
                    {date} · {teaching?.confirmed ? "已确认" : "待确认"} ·{" "}
                    {teaching?.lessons || "暂无课务"}
                  </p>
                  <Button variant="outline" onClick={openTeaching}>
                    编辑此日课表 / 增加临时课务
                  </Button>
                  <p className="muted">
                    固定课表仅在10月23日—11月5日确认有效，之后逐日确认。
                  </p>
                </Card>
              </div>
              <Card>
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">YOUR DATA STAYS WITH YOU</div>
                    <h2>导入、备份与恢复</h2>
                  </div>
                  <Badge>SQLite · 本机持久化</Badge>
                </div>
                <p className="muted">
                  Excel
                  导入先校验预览，再确认。重复文件不重复建任务；修改后的文件也不会覆盖已存在任务。JSON
                  为完整可恢复备份，Excel 用于阅读与核对。
                </p>
                <div className="inline-actions wrap">
                  <label className="button primary">
                    <Upload size={16} />
                    导入计划 Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      hidden
                      disabled={busy}
                      onChange={(e) => {
                        run(() => previewFile(e.target.files?.[0]));
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <a className="button outline" href="/api/export">
                    <Download size={16} />
                    导出 Excel
                  </a>
                  <a className="button outline" href="/api/backup">
                    <Download size={16} />
                    完整 JSON 备份
                  </a>
                  <label className="button outline">
                    <RotateCcw size={16} />
                    恢复 JSON 备份
                    <input
                      type="file"
                      accept=".json"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          run(async () => {
                            setRestore(JSON.parse(await file.text()));
                          });
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const old = localStorage.getItem("studybuddy-v1");
                      if (old)
                        saveFile(
                          "StudyBuddy-旧版本浏览器数据.json",
                          JSON.parse(old),
                        );
                      else setNotice("此浏览器没有旧版数据");
                    }}
                  >
                    导出旧版浏览器存储
                  </Button>
                </div>
                <p className="info-note">
                  旧版 localStorage
                  数据原样保留，不会自动混入正式计划。请先导出存档。恢复完整备份会覆盖当前数据库，请先备份。
                </p>
              </Card>
              <Card>
                <h3>导入记录与校验</h3>
                {s.batches.map((b) => (
                  <details key={b.id}>
                    <summary>
                      {b.name}
                      <span>{b.taskCount} 项任务</span>
                    </summary>
                    <p>
                      {b.at} · 文件指纹 {b.hash.slice(0, 16)}…
                    </p>
                    {b.warnings.map((w) => (
                      <p className="info-note" key={w}>
                        {w}
                      </p>
                    ))}
                    <div className="inline-actions wrap">
                      {b.sheets.map((sh) => (
                        <Badge key={sh.name}>
                          {sh.name} · {sh.rows} 行
                        </Badge>
                      ))}
                    </div>
                  </details>
                ))}
              </Card>
              <Card>
                <h3>操作日志 · 最近50条</h3>
                <div className="audit-list">
                  {s.logs
                    .slice(-50)
                    .reverse()
                    .map((l) => (
                      <div className="audit-row" key={l.id}>
                        <span>{l.at.slice(0, 19).replace("T", " ")}</span>
                        <strong>{l.action}</strong>
                        <span>
                          {l.actor === "ai"
                            ? "AI"
                            : l.actor === "system"
                              ? "系统"
                              : "用户"}
                        </span>
                        <p>
                          {l.action === "待确认工具"
                            ? "已生成待确认操作"
                            : l.detail}
                        </p>
                      </div>
                    ))}
                </div>
              </Card>
            </>
          )}
          <footer>
            <span>
              StudyBuddy <i>·</i> 一点一点，都会算数。
            </span>
            <span>PRIVATE SPACE / {new Date().getFullYear()}</span>
          </footer>
        </div>
      </main>
      <aside className="workspace-inspector" aria-label="学习上下文">
        <div className="inspector-heading">
          <PanelRight size={15} /> {focused ? "任务属性" : "学习上下文"}
        </div>
        {focused ? (
          <>
            <div className="inspector-title">
              <FileText size={18} />
              <h3>{focused.title}</h3>
            </div>
            <dl className="detail-list">
              <div>
                <dt>科目</dt>
                <dd>{focused.subject}</dd>
              </div>
              <div>
                <dt>日期</dt>
                <dd>{focused.date}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{focused.status}</dd>
              </div>
              <div>
                <dt>预计时间</dt>
                <dd>{focused.estimatedMinutes ?? "待补充"} 分钟</dd>
              </div>
            </dl>
            <Button variant="outline" onClick={() => openTask(focused)}>
              编辑任务
            </Button>
            <h4>关联笔记</h4>
            <MarkdownView value={focused.note || "暂无关联笔记。"} />
          </>
        ) : (
          <>
            <h3>{date}</h3>
            <div className="inspector-section">
              <h4>今日概览</h4>
              <dl className="detail-list">
                <div>
                  <dt>任务</dt>
                  <dd>
                    {dayProgress.done} / {dayProgress.total}
                  </dd>
                </div>
                <div>
                  <dt>到期复习</dt>
                  <dd>{due.length} 项</dd>
                </div>
                <div>
                  <dt>课务状态</dt>
                  <dd>{teaching?.confirmed ? teaching.load : "待确认"}</dd>
                </div>
              </dl>
            </div>
            <div className="inspector-section">
              <h4>学习路径</h4>
              {[
                "背诵与回忆",
                "3600 错题二轮",
                "6600 定向补漏",
                "学科第二套题",
              ].map((x, i) => (
                <div className="knowledge-link" key={x}>
                  <span>0{i + 1}</span>
                  <button
                    onClick={() => {
                      setPage(2);
                      setView("全部");
                      setQuery(
                        i === 0
                          ? "背诵"
                          : i === 1
                            ? "3600"
                            : i === 2
                              ? "6600"
                              : "第二套",
                      );
                    }}
                  >
                    {x}
                  </button>
                </div>
              ))}
            </div>
            <div className="inspector-section">
              <h4>学习助手</h4>
              <p>
                {s.settings.provider === "mock"
                  ? "Mock 模式 · 依据真实计划提供建议"
                  : "在独立工作区整理计划与建议"}
              </p>
              <Button variant="outline" onClick={() => setPage(1)}>
                <Sparkles size={14} />
                打开助手
              </Button>
            </div>
            <div className="inspector-section">
              <h4>笔记格式</h4>
              <p>教案、逐字稿与错题解析支持 Markdown，编辑时可切换预览。</p>
            </div>
          </>
        )}
      </aside>
      <TaskTimer
        tasks={all}
        sessions={s.sessions}
        request={focusRequest}
        onSave={async (input) => {
          await mutate("/time", input);
        }}
      />
      {editor && (
        <Modal
          title={
            {
              task: editor.data.id ? "编辑学习任务" : "新增学习任务",
              wrong: editor.data.id ? "编辑错题" : "记录真实错题",
              exam: "真题与专项练习记录",
              interview: "教案与试讲训练",
              teaching: "课表与每日学习负荷",
            }[editor.type]
          }
          onClose={() => setEditor(null)}
        >
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          <form
            className="form-grid"
            onSubmit={(e) => run(() => saveEditor(e))}
          >
            {editor.type === "task" && (
              <>
                {editorInput("title", "任务内容")}
                {editorInput("subject", "科目", "text", [
                  "教综",
                  "道德与法治",
                  "行测",
                  "面试",
                ])}
                {editorInput("module", "知识模块")}
                {editorInput("date", "安排日期", "date")}
                {editorInput(
                  "estimatedMinutes",
                  "预计分钟（未知请留空）",
                  "number",
                )}
                {editorInput("actualMinutes", "实际学习分钟", "number")}
                <p className="info-note wide">
                  预计分钟可留空或填0（表示待补充），实际用时可独立保存，不必与Excel或AI建议相同。实际分钟是累计总用时；手动修改会替代统计总量，按本次保存日期记账，并保留原计时历史。
                </p>
                {editor.data.id && (
                  <Button
                    type="button"
                    variant="outline"
                    className="wide"
                    onClick={() => {
                      const id = editor.data.id;
                      setEditor(null);
                      setFocusRequest({ taskId: id, nonce: Date.now() });
                    }}
                  >
                    <Clock size={16} />
                    打开此任务的专注计时
                  </Button>
                )}
                {editor.data.id && (
                  <details className="wide">
                    <summary>用时记录（含手动更正历史）</summary>
                    {s.sessions
                      .filter(
                        (x) => x.taskId === editor.data.id && x.type !== "复习",
                      )
                      .map((x) => (
                        <p className="muted" key={x.id}>
                          {x.date} ·{" "}
                          {x.source === "timer"
                            ? "专注计时"
                            : x.source === "manual"
                              ? "手动记录"
                              : "完成时记录"}{" "}
                          ·{" "}
                          {x.seconds !== undefined
                            ? `${Math.floor(x.seconds / 60)}分${x.seconds % 60}秒`
                            : `${x.minutes}分钟`}
                          {x.superseded ? " · 已被手动总时长更正替代" : ""}
                        </p>
                      ))}
                  </details>
                )}
                {editor.data.status !== "已完成" &&
                  editorInput("status", "任务状态", "text", [
                    "未开始",
                    "进行中",
                    "待确认",
                  ])}
                {editorInput("priority", "优先级", "text", ["高", "中", "低"])}
                {editorInput("kind", "任务类型", "text", [
                  "背诵",
                  "练习",
                  "真题",
                  "面试",
                  "其他",
                ])}
                {editorInput("mastery", "掌握自评", "text", [
                  "未评估",
                  "生疏",
                  "一般",
                  "熟练",
                ])}
                {editorInput("deadline", "截止日期（可选）", "date")}
                {editorInput("note", "备注与原表关联", "textarea")}
                <p className="muted wide">
                  来源：{editor.data.source || "手动创建"}
                  {editor.data.id && ` · ID ${editor.data.id}`}
                </p>
              </>
            )}
            {editor.type === "wrong" && (
              <>
                {editorInput("title", "知识点 / 错题原文")}
                {editorInput("subject", "科目分类", "text", [
                  "教综3600二轮",
                  "教综6600补漏",
                  "道德与法治第一套题",
                  "道德与法治第二套题",
                  "言语理解",
                  "判断推理",
                  "资料分析",
                  "教综真题",
                ])}
                {editorInput("module", "章节")}
                {editorInput("tags", "知识点标签")}
                {editorInput("reason", "错误原因", "text", [
                  "概念混淆",
                  "审题",
                  "记忆遗漏",
                  "方法错误",
                  "其他",
                ])}
                {editorInput("mastery", "掌握程度", "text", [
                  "未掌握",
                  "模糊",
                  "已掌握",
                ])}
                {editorInput("date", "下次复习日期", "date")}
                {editorInput("round", "当前轮次", "number")}
                {editorInput("errors", "累计错误次数", "number")}
                {editorInput("relatedId", "关联另一套错题ID")}
                {editorInput("answer", "正确答案", "textarea")}
                {editorInput("explanation", "个人解析（原始内容）", "textarea")}
                {editorInput(
                  "aiExplanation",
                  "AI补充解释（与原文分开）",
                  "textarea",
                )}
              </>
            )}
            {editor.type === "exam" && (
              <>
                {editorInput("name", "套卷 / 练习名称")}
                {editorInput("subject", "科目分类", "text", [
                  "教综真题",
                  "教综3600二轮",
                  "教综6600补漏",
                  "道德与法治第一套题",
                  "道德与法治第二套题",
                  "言语理解",
                  "判断推理",
                  "资料分析",
                ])}
                {editorInput("region", "考试地区")}
                {editorInput("year", "考试年份")}
                {editorInput("chapter", "章节 / 模块")}
                {editorInput("date", "练习日期", "date")}
                {editorInput("startedAt", "开始时间", "datetime-local")}
                {editorInput("finishedAt", "完成时间", "datetime-local")}
                {editorInput("minutes", "实际用时分钟", "number")}
                {editorInput("total", "本次题数", "number")}
                {editorInput("correct", "正确题数", "number")}
                {editorInput("wrongCount", "错题数量", "number")}
                {editorInput("score", "得分（可选）", "number")}
                {editorInput("review", "复盘与薄弱模块", "textarea")}
              </>
            )}
            {editor.type === "interview" && (
              <>
                {editorInput("title", "试讲篇目")}
                {editorInput("date", "训练日期", "date")}
                {editorInput("objectives", "教学目标", "textarea")}
                {editorInput("keyPoints", "教学重难点", "textarea")}
                {editorInput("process", "教学过程与活动", "textarea")}
                {editorInput("script", "逐字稿", "textarea")}
                {editorInput("material", "录音 / 视频本地资料位置")}
                {editorInput("minutes", "实际试讲分钟", "number")}
                {editorInput("rating", "自我评价（0—5）", "number")}
                {editorInput("selfReview", "复盘与修改建议", "textarea")}
                <p className="info-note wide">
                  评价参考：目标清楚、重难点突出、活动合理、表达流畅、时间合适。没有提供实际材料时不生成真实表现评估。
                </p>
              </>
            )}
            {editor.type === "teaching" && (
              <>
                {editorInput("date", "课表日期", "date")}
                {editorInput("lessons", "固定课务 / 临时教学任务", "textarea")}
                {editorInput("load", "当日负荷", "text", [
                  "高负荷",
                  "标准日",
                  "强化日",
                  "弹性日",
                  "待确认",
                ])}
                {editorInput("availableMinutes", "实际可用学习分钟", "number")}
                {editorInput("note", "安排说明", "textarea")}
                <label className="checkbox-row wide">
                  <input
                    type="checkbox"
                    checked={editor.data.confirmed}
                    onChange={(e) =>
                      setEditor((ed) => ({
                        ...ed!,
                        data: { ...ed!.data, confirmed: e.target.checked },
                      }))
                    }
                  />
                  我已确认此日课表与可用时间
                </label>
              </>
            )}
            <div className="modal-actions wide">
              {editor.type === "task" && editor.data.id && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("将此任务移入回收站？"))
                      run(async () => {
                        await mutate(
                          `/tasks/${encodeURIComponent(editor.data.id)}/delete`,
                        );
                        setEditor(null);
                      });
                  }}
                >
                  <Trash2 size={15} />
                  删除任务
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditor(null)}
              >
                取消
              </Button>
              <Button disabled={busy} type="submit">
                <Check size={15} />
                保存记录
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {preview && (
        <Modal
          title="Excel 导入校验与预览"
          onClose={() => setPreview(null)}
          description="源表原文会保留；确认前不会创建任何任务。"
        >
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          <div className="section-heading">
            <Badge>{preview.sheets.length} 张表</Badge>
            <strong>{preview.taskCount} 项任务</strong>
            <Badge>
              {preview.duplicate ? "重复文件 · 不会再次创建" : "待确认导入"}
            </Badge>
          </div>
          {preview.warnings.map((w: string) => (
            <p className="info-note" key={w}>
              {w}
            </p>
          ))}
          {preview.sheets.map((sh: any) => (
            <details key={sh.name}>
              <summary>
                {sh.name} · {sh.rows} 行
              </summary>
              <div className="source-table">
                <table>
                  <tbody>
                    {sh.preview.map((r: string[], i: number) => (
                      <tr key={i}>
                        {r.map((v, j) => (
                          <td key={j}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
          <h3>识别任务预览</h3>
          {preview.tasks.map((t: Task) => (
            <p key={t.id}>
              {t.date} · {t.module} · {t.title} · {t.status}
            </p>
          ))}
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setPreview(null)}>
              取消
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const result = await mutate("/import/confirm", {
                    token: preview.token,
                  });
                  setPreview(null);
                  setNotice(
                    result.duplicate
                      ? "文件已经导入，未重复创建任务"
                      : `导入完成，新增 ${result.created} 项任务`,
                  );
                })
              }
            >
              确认导入
            </Button>
          </div>
        </Modal>
      )}
      {restore !== null && (
        <Modal title="确认恢复备份" onClose={() => setRestore(null)}>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          <p>
            恢复将覆盖当前数据库中的计划、记录、聊天和设置。请先下载完整 JSON
            备份。
          </p>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await mutate("/restore", { backup: restore, confirmed: true });
                setRestore(null);
                setNotice("完整备份已恢复");
              })
            }
          >
            我已备份，确认覆盖并恢复
          </Button>
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
