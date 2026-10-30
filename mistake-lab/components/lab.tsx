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
  Sparkles,
  RefreshCw,
  Search,
  Plus,
  Menu,
  X,
  ArrowRight,
  Download,
  Check,
  Bookmark,
} from "lucide-react";
import { useLab } from "./store";
import { SectionTitle, Modal, Empty } from "./ui";
import dynamic from "next/dynamic";
const ImportCenter = dynamic(() =>
  import("./import-center").then((m) => m.ImportCenter),
);
import { Dashboard } from "./dashboard";
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
    <div className={`lab-shell section-${section}`}>
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <aside
        id="workspace-navigation"
        inert={isMobile && !menu}
        className={`sidebar ${menu ? "is-open" : ""}`}
      >
        <Link
          href="/"
          aria-label="MISTAKE LAB 首页"
          className="brand"
          onClick={() => setMenu(false)}
        >
          <span className="brand-symbol" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none">
              <path
                d="M8 29V12l12 12 12-12v17"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="20" cy="9" r="2" fill="currentColor" />
            </svg>
          </span>
          <span className="rail-brand-name">
            MISTAKE LAB<small>自己的学习实验室</small>
          </span>
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="关闭导航"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <div className="workspace-label">我的空间</div>
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
                {n.zh}
                <small>{n.en}</small>
              </span>
              {n.key === "library" && <b>{data.questions.length}</b>}
            </Link>
          ))}
        </nav>
        <Link
          className="rail-import-shortcut"
          href="/import"
          aria-label="导入新资料"
        >
          <Plus size={20} />
          <span>带本新书来</span>
        </Link>
        <div className="profile">
          <div className="avatar">知</div>
          <div>
            <strong>我的学习空间</strong>
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
          <Link href="/" className="topbar-wordmark">
            MISTAKE LAB<span>让每个疑问，都有回响。</span>
          </Link>
          <div className="breadcrumb">
            {section === "question"
              ? "题目手记"
              : navigation.find((n) => n.key === section)?.zh}
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
            已在本地记录
          </span>
          <button
            className="avatar small"
            onClick={() => setHelp(true)}
            aria-label="查看工作空间说明"
          >
            我
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
export function QuestionCard({ q }: { q: Question }) {
  const { setData, notify } = useLab();
  return (
    <article
      className={`question-card subject-${q.subject === "数学" ? "math" : q.subject === "英语" ? "english" : "general"}`}
    >
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
                  : "?"}
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
          <div className="eyebrow">Question collection</div>
          <h1>每一道，都算数。</h1>
          <p>留住当时的疑问，找到现在的答案。</p>
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
