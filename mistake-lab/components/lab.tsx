"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  UploadCloud,
  BookOpen,
  LayoutDashboard,
  Library,
  ScanLine,
  Sparkles,
  RefreshCw,
  Search,
  Plus,
  Menu,
  X,
  ArrowRight,
  Download,
  Check,
  Flower2,
  SlidersHorizontal,
  Bookmark,
  MoreHorizontal,
  Leaf,
} from "lucide-react";
import { useLab } from "./store";
import { SectionTitle, Modal, Empty } from "./ui";
import dynamic from "next/dynamic";
const ImportCenter = dynamic(() =>
  import("./import-center").then((m) => m.ImportCenter),
);
import { Reader } from "./reader";
import { MaterialWorkbench } from "./material-workbench";
import { QuestionDetail, Review, Studio } from "./learning";
import { today, type Question } from "@/lib/data";
const navigation = [
  {
    key: "dashboard",
    path: "/",
    icon: LayoutDashboard,
    en: "Dashboard",
    zh: "学习概览",
  },
  {
    key: "library",
    path: "/library",
    icon: Library,
    en: "Question Library",
    zh: "我的错题",
  },
  {
    key: "reader",
    path: "/reader",
    icon: BookOpen,
    en: "Book Reader",
    zh: "原书阅读",
  },
  {
    key: "import",
    path: "/import",
    icon: UploadCloud,
    en: "Import Center",
    zh: "教辅导入",
  },
  {
    key: "review",
    path: "/review",
    icon: RefreshCw,
    en: "Review Center",
    zh: "智能复习",
  },
  {
    key: "studio",
    path: "/studio",
    icon: Sparkles,
    en: "AI Studio",
    zh: "分析与发现",
  },
];
export function Lab({ section }: { section: string }) {
  const { data, ready, toast, notify, storageError } = useLab();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [help, setHelp] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width:700px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menu]);
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `mistake-lab-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify("学习档案已导出，包含原书图片与错题关联。");
  }
  return (
    <div className="lab-shell">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <aside
        id="workspace-navigation"
        inert={isMobile && !menu}
        className={`sidebar ${menu ? "is-open" : ""}`}
      >
        <Link href="/" className="brand" onClick={() => setMenu(false)}>
          <span className="brand-symbol">
            <Flower2 size={27} strokeWidth={1.3} />
          </span>
          <span>
            MISTAKE LAB<small>A little better, every day.</small>
          </span>
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="关闭导航"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <div className="workspace-label">
          Personal workspace <span>01</span>
        </div>
        <nav aria-label="主导航">
          {navigation.map((n) => (
            <Link
              key={n.key}
              href={n.path}
              onClick={() => setMenu(false)}
              className={`nav-item ${section === n.key || (section === "question" && n.key === "library") ? "active" : ""}`}
              aria-current={section === n.key ? "page" : undefined}
            >
              <n.icon size={19} strokeWidth={1.6} />
              <span>
                {n.en}
                <small>{n.zh}</small>
              </span>
              {n.key === "library" && <b>{data.questions.length}</b>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-flower">✳</span>
          <p>
            每一道错题，
            <br />
            都藏着新的可能。
          </p>
          <button onClick={() => setHelp(true)}>
            认识你的学习实验室 <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="profile">
          <div className="avatar">知</div>
          <div>
            <strong>知夏的学习空间</strong>
            <small>Personal · 本地原型</small>
          </div>
          <button
            className="icon-button"
            onClick={exportData}
            aria-label="导出学习档案"
            title="导出学习档案"
          >
            <Download size={17} />
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-backdrop"
          aria-label="关闭导航遮罩"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-toggle"
            aria-label="打开导航"
            aria-expanded={menu}
            aria-controls="workspace-navigation"
            onClick={() => setMenu(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            {section === "question"
              ? "Question Detail"
              : navigation.find((n) => n.key === section)?.en}
          </div>
          <form
            className="global-search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/library?search=${encodeURIComponent(search)}`);
            }}
          >
            <Search size={16} />
            <input
              aria-label="搜索错题与知识点"
              placeholder="搜索错题、知识点…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>↵</kbd>
          </form>
          <span className="local-state">
            <i />
            本地学习空间
          </span>
          <button
            className="avatar small"
            onClick={() => setHelp(true)}
            aria-label="查看工作空间说明"
          >
            知
          </button>
        </header>
        <main
          id="main"
          className={
            section === "reader" ? "main-content reader-main" : "main-content"
          }
        >
          {storageError && (
            <div className="error-banner" role="alert">
              {storageError}
              <button onClick={exportData}>导出备份</button>
            </div>
          )}
          {!ready ? (
            <div className="loading">正在打开你的学习空间…</div>
          ) : section === "dashboard" ? (
            <Dashboard />
          ) : section === "library" ? (
            <Suspense fallback={<div className="loading">正在整理错题…</div>}>
              <LibraryRoute />
            </Suspense>
          ) : section === "import" ? (
            <ImportCenter />
          ) : section === "reader" ? (
            <Reader />
          ) : section === "question" ? (
            <QuestionDetail />
          ) : section === "review" ? (
            <Review />
          ) : (
            <Studio />
          )}
        </main>
        <footer className="footer">
          <span>
            MISTAKE LAB <span className="footer-dot">✳</span> Small mistakes.
            Meaningful progress.
          </span>
          <span>慢慢来，也在向前。</span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      <Modal
        open={help}
        onOpenChange={setHelp}
        title="你的学习，从这里生长。"
        description="MISTAKE LAB · 第一阶段交互原型"
      >
        <div className="help-copy">
          <p>
            原书、采集草稿与错题保存在当前浏览器。仅执行 OCR
            时，所选裁剪片段会临时发送到本站服务处理，不调用第三方。
          </p>
          <p>
            初始内容为演示题目；AI
            分析和复习间隔为模拟规则，尚未接入模型。清除浏览器数据会删除本地档案，建议定期导出备份。
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setHelp(false);
            router.push("/reader");
          }}
        >
          去采集第一道错题 <ArrowRight size={16} />
        </button>
      </Modal>
    </div>
  );
}
function Botanical() {
  return (
    <svg
      className="botanical"
      viewBox="0 0 330 230"
      fill="none"
      aria-hidden="true"
    >
      <ellipse
        cx="173"
        cy="194"
        rx="119"
        ry="20"
        fill="#294C3A"
        opacity=".08"
      />
      <path d="M91 169L183 124L262 162L171 209Z" fill="#ABC19E" />
      <path
        d="M91 155L183 111L262 149L171 194Z"
        fill="#F7F6E9"
        stroke="#52765A"
      />
      <path d="M91 155V169L171 209V194M262 149V162" stroke="#52765A" />
      <path d="M111 152L181 119L240 148L171 181Z" stroke="#B2C5A4" />
      <path d="M171 181V194" stroke="#52765A" />
      <path
        d="M176 145C158 113 161 79 184 40"
        stroke="#315D42"
        strokeWidth="2"
      />
      <path
        d="M170 116C139 112 125 91 133 76C157 76 173 91 170 116Z"
        fill="#73946E"
      />
      <path
        d="M173 98C196 99 221 86 223 65C198 61 176 73 173 98Z"
        fill="#436E4E"
      />
      <path
        d="M177 74C154 70 147 52 154 37C177 42 181 56 177 74Z"
        fill="#A4B992"
      />
      <path
        d="M184 47C205 46 216 27 207 15C188 20 180 32 184 47Z"
        fill="#6E946A"
      />
      <circle cx="90" cy="62" r="29" stroke="#ACBEA2" strokeDasharray="2 5" />
      <path d="M78 62H102M90 50V74" stroke="#738D69" />
      <circle cx="267" cy="103" r="5" fill="#CBD9E0" />
      <path
        d="M246 29L250 39L260 43L250 47L246 57L242 47L232 43L242 39Z"
        fill="#B9C9A5"
      />
    </svg>
  );
}
function Dashboard() {
  const { data } = useLab();
  const due = data.questions.filter(
    (q) => q.status !== "已掌握" && q.due <= today(),
  );
  const mastered = data.questions.filter((q) => q.status === "已掌握").length;
  const recent = data.questions.slice(-4).reverse();
  const learned = data.activity.reduce((s, a) => s + a.count, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return {
      label: ["日", "一", "二", "三", "四", "五", "六"][d.getDay()],
      count:
        data.activity.find(
          (a) =>
            a.date ===
            d.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }),
        )?.count || 0,
    };
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Your learning, in bloom</div>
          <h1>
            A fresh start,
            <br className="mobile-break" /> every day
            <span className="title-dot">.</span>
          </h1>
          <p>你好，知夏。把每一个「还不会」，变成「我懂了」。</p>
        </div>
        <Link className="button primary" href="/reader">
          <Plus size={17} />
          采集新错题
        </Link>
      </div>
      <div className="dashboard-top">
        <section className="hero-panel">
          <div className="hero-copy">
            <span className="pill">
              <Leaf size={12} />
              今日学习提案
            </span>
            <h2>
              不急着全对。
              <br />
              先把这一题，<em>弄明白。</em>
            </h2>
            <p>
              有 {due.length} 道错题等待与你重逢。
              <br />
              一次小小的复习，也是一点新的生长。
            </p>
            <Link className="button dark" href="/review">
              开始今日复习 <ArrowRight size={16} />
            </Link>
          </div>
          <Botanical />
          <span className="hero-edition">Learning journal / No. 001</span>
        </section>
        <section className="today-panel">
          <div className="panel-top">
            <span>你的学习节奏</span>
            <Flower2 size={20} strokeWidth={1} />
          </div>
          <div className="progress-orbit">
            <svg viewBox="0 0 130 130" aria-hidden="true">
              <circle
                cx="65"
                cy="65"
                r="55"
                fill="none"
                stroke="#E7EADF"
                strokeWidth="7"
              />
              <circle
                cx="65"
                cy="65"
                r="55"
                fill="none"
                stroke="#45664D"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${data.questions.length ? (mastered / data.questions.length) * 345 : 0} 345`}
                transform="rotate(-90 65 65)"
              />
            </svg>
            <div>
              <strong>
                {data.questions.length
                  ? Math.round((mastered / data.questions.length) * 100)
                  : 0}
                <small>%</small>
              </strong>
              <span>知识掌握度</span>
            </div>
          </div>
          <p>每次回顾，都在靠近答案。</p>
          <Link href="/library" className="text-link">
            查看学习档案 <ArrowUpRight size={15} />
          </Link>
        </section>
      </div>
      <section className="stats-row" aria-label="学习统计">
        {[
          {
            label: "收集的错题",
            value: data.questions.length,
            unit: "道",
            icon: Library,
            caption: "让困惑有迹可循",
          },
          {
            label: "等待复习",
            value: due.length,
            unit: "道",
            icon: RefreshCw,
            caption: "给记忆一点时间",
          },
          {
            label: "已经掌握",
            value: mastered,
            unit: "道",
            icon: Check,
            caption: "每一步，都算数",
          },
          {
            label: "完成的复习",
            value: learned,
            unit: "次",
            icon: Flower2,
            caption: "慢慢积累的力量",
          },
        ].map((s) => (
          <div className="stat" key={s.label}>
            <div>
              <span>{s.label}</span>
              <s.icon size={17} strokeWidth={1.5} />
            </div>
            <strong>
              {String(s.value).padStart(2, "0")}
              <small>{s.unit}</small>
            </strong>
            <p>{s.caption}</p>
          </div>
        ))}
      </section>
      <div className="dashboard-bottom">
        <section className="recent-section">
          <SectionTitle
            title="最近收集"
            sub="每一个疑问，都值得被认真对待。"
            action={
              <Link className="text-link" href="/library">
                全部错题 <ArrowUpRight size={16} />
              </Link>
            }
          />
          <div className="recent-list">
            {recent.map((q, i) => (
              <Link
                href={`/question?id=${q.id}`}
                className="recent-item"
                key={q.id}
              >
                <span className={`subject-stamp stamp-${i}`}>
                  {q.subject.slice(0, 1)}
                </span>
                <div>
                  <span className="muted tiny">
                    {q.book} <span className="separator">/</span> {q.topic}
                  </span>
                  <h3>{q.title}</h3>
                </div>
                <span
                  className={`status ${q.status === "已掌握" ? "mastered" : ""}`}
                >
                  {q.status}
                </span>
                <ArrowUpRight size={16} />
              </Link>
            ))}
          </div>
        </section>
        <section className="rhythm-panel">
          <SectionTitle
            title="一点点，积累起来"
            sub="最近 7 天的真实复习记录"
          />
          <div className="week-chart">
            {days.map((d, i) => (
              <div key={i}>
                <span className="chart-count">{d.count || ""}</span>
                <div className="bar-track">
                  <div
                    style={{
                      height: `${d.count ? Math.max(12, (d.count / Math.max(5, ...days.map((x) => x.count))) * 100) : 3}%`,
                    }}
                  />
                </div>
                <span>{d.label}</span>
              </div>
            ))}
          </div>
          <div className="chart-caption">
            <span className="legend-dot" />
            完成复习 <strong>{learned} 次累计</strong>
          </div>
          <p className="quiet-note">留白的日子，也可以重新开始。</p>
        </section>
      </div>
      <Link className="studio-banner" href="/studio">
        <span className="studio-icon">
          <Sparkles size={22} strokeWidth={1.3} />
        </span>
        <div>
          <h3>答案之外，还有「为什么」。</h3>
          <p>走进 AI Studio，尝试拆解一道错题的思路。</p>
        </div>
        <span className="pill">Mock 体验</span>
        <ArrowUpRight size={20} />
      </Link>
    </>
  );
}
export function QuestionCard({ q }: { q: Question }) {
  const { setData, notify } = useLab();
  return (
    <article className="question-card">
      <div className="card-meta">
        <span className="subject-label">
          {q.subject}
          {q.questionNumber ? ` · ${q.questionNumber}` : ""}
        </span>
        <span className={`status ${q.status === "已掌握" ? "mastered" : ""}`}>
          {q.status}
        </span>
        <button
          className={`icon-button favorite ${q.favorite ? "selected" : ""}`}
          aria-label={q.favorite ? "取消收藏" : "收藏题目"}
          onClick={() => {
            setData((d) => ({
              ...d,
              questions: d.questions.map((x) =>
                x.id === q.id ? { ...x, favorite: !x.favorite } : x,
              ),
            }));
            notify(q.favorite ? "已取消收藏" : "已收藏这道题");
          }}
        >
          <Bookmark size={17} fill={q.favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <Link className="card-body" href={`/question?id=${q.id}`}>
        {q.crop ? (
          <div className="crop-thumb">
            <img src={q.crop} alt="框选题目预览" />
          </div>
        ) : (
          <div className="question-topic">
            <span>{q.topic}</span>
            <span className="math-mark">
              {q.subject === "数学"
                ? "ƒ(x)"
                : q.subject === "英语"
                  ? "Aa"
                  : "知"}
            </span>
          </div>
        )}
        <h3>{q.title}</h3>
      </Link>
      <div className="card-footer">
        <span>
          {q.book}
          <small>{q.chapter}</small>
        </span>
        <Link
          className="icon-button"
          aria-label={`查看错题：${q.title}`}
          href={`/question?id=${q.id}`}
        >
          <ArrowUpRight size={18} />
        </Link>
      </div>
    </article>
  );
}
function LibraryRoute() {
  const params = useSearchParams();
  const initial = params.get("search") || "";
  return (
    <LibraryPage
      key={`${initial}:${params.get("book") || ""}`}
      initialSearch={initial}
      initialBook={params.get("book") || "全部习题册"}
    />
  );
}
function LibraryPage({
  initialSearch,
  initialBook,
}: {
  initialSearch: string;
  initialBook: string;
}) {
  const { data } = useLab();
  const [query, setQuery] = useState(initialSearch);
  const [subject, setSubject] = useState("全部学科");
  const [book, setBook] = useState(initialBook);
  const [status, setStatus] = useState("全部状态");
  const [topic, setTopic] = useState("全部知识点");
  const [chapter, setChapter] = useState("全部章节");
  const [favorite, setFavorite] = useState(false);
  const [sort, setSort] = useState("new");
  const questions = data.questions.filter(
    (q) =>
      (subject === "全部学科" || q.subject === subject) &&
      (book === "全部习题册" || q.book === book) &&
      (status === "全部状态" || q.status === status) &&
      (topic === "全部知识点" || q.topic === topic) &&
      (chapter === "全部章节" || q.chapter === chapter) &&
      (!favorite || q.favorite) &&
      `${q.title}${q.topic}${q.book}${q.note}${q.questionNumber || ""}${q.structuredText || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  if (sort === "new") questions.reverse();
  const filters = [
    {
      label: "学科",
      value: subject,
      set: setSubject,
      all: "全部学科",
      options: data.questions.map((q) => q.subject),
    },
    {
      label: "习题册",
      value: book,
      set: setBook,
      all: "全部习题册",
      options: data.questions.map((q) => q.book),
    },
    {
      label: "章节",
      value: chapter,
      set: setChapter,
      all: "全部章节",
      options: data.questions
        .filter((q) => book === "全部习题册" || q.book === book)
        .map((q) => q.chapter),
    },
    {
      label: "知识点",
      value: topic,
      set: setTopic,
      all: "全部知识点",
      options: data.questions.map((q) => q.topic),
    },
  ];
  return (
    <>
      <div className="page-heading library-heading">
        <div>
          <div className="eyebrow">A collection of possibilities</div>
          <h1>
            Question Library<span className="title-dot">.</span>
          </h1>
          <p>把零散的困惑，整理成自己的知识地图。</p>
        </div>
        <div className="button-group reader-actions">
          <MaterialWorkbench />
          <Link className="button primary" href="/reader">
            <Plus size={17} />
            添加错题
          </Link>
        </div>
      </div>
      <div className="library-book-summary" aria-label="按习题册整理">
        {[...new Set(data.questions.map((q) => q.book))].map((b) => (
          <button
            key={b}
            className={book === b ? "active" : ""}
            onClick={() => {
              setBook(book === b ? "全部习题册" : b);
              setChapter("全部章节");
            }}
          >
            <strong>{b}</strong>
            <small>
              {data.questions.filter((q) => q.book === b).length} 道错题 ·{" "}
              {
                [
                  ...new Set(
                    data.questions
                      .filter((q) => q.book === b)
                      .map((q) => q.chapter),
                  ),
                ].length
              }{" "}
              个章节
            </small>
          </button>
        ))}
      </div>
      <div className="library-tabs">
        <button
          className={!favorite ? "active" : ""}
          onClick={() => setFavorite(false)}
        >
          全部错题 <span>{data.questions.length}</span>
        </button>
        <button
          className={favorite ? "active" : ""}
          onClick={() => setFavorite(true)}
        >
          <Bookmark size={15} />
          我的收藏{" "}
          <span>{data.questions.filter((q) => q.favorite).length}</span>
        </button>
      </div>
      <div className="filter-panel">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="搜索题目"
            placeholder="搜索题目、笔记或知识点"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="icon-button"
              aria-label="清空搜索"
              onClick={() => setQuery("")}
            >
              <X size={15} />
            </button>
          )}
        </div>
        {filters.map((f) => (
          <select
            aria-label={f.label}
            key={f.label}
            value={f.value}
            onChange={(e) => {
              f.set(e.target.value);
              if (f.label === "习题册") {
                setChapter("全部章节");
                setTopic("全部知识点");
              }
            }}
          >
            <option>{f.all}</option>
            {[...new Set(f.options)].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ))}
        <select
          aria-label="掌握状态"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {["全部状态", "待复习", "巩固中", "已掌握"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="results-heading">
        <span>
          找到 <strong>{questions.length}</strong> 道错题
        </span>
        <select
          aria-label="排序方式"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="new">最近添加优先</option>
          <option value="old">最早添加优先</option>
        </select>
      </div>
      {questions.length ? (
        <div className="question-grid">
          {questions.map((q) => (
            <QuestionCard q={q} key={q.id} />
          ))}
        </div>
      ) : (
        <Empty
          title="这里还没有匹配的题目"
          description="换一个关键词，或清除筛选条件。"
          action={
            <button
              className="button secondary"
              onClick={() => {
                setQuery("");
                setSubject("全部学科");
                setBook("全部习题册");
                setChapter("全部章节");
                setTopic("全部知识点");
                setStatus("全部状态");
                setFavorite(false);
              }}
            >
              清除筛选
            </button>
          }
        />
      )}
    </>
  );
}
