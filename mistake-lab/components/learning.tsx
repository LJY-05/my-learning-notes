"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Lightbulb,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
  Flower2,
} from "lucide-react";
import { useLab } from "./store";
import { Modal, Empty } from "./ui";
import { today, type Question } from "@/lib/data";
import { parseOptions, canonicalType } from "@/lib/materials";
export function QuestionDetail() {
  const params = useSearchParams();
  const id = params.get("id");
  return <QuestionDetailContent key={id || "default"} id={id} />;
}
function QuestionDetailContent({ id }: { id: string | null }) {
  const { data, setData, notify } = useLab();
  const router = useRouter();
  const q =
    data.questions.find((q) => q.id === id) ||
    (!id ? data.questions[0] : undefined);
  const [show, setShow] = useState(false);
  const [original, setOriginal] = useState(false);
  const [fragmentIndex, setFragmentIndex] = useState(0);
  const [edit, setEdit] = useState(false);
  const [remove, setRemove] = useState(false);
  const [draft, setDraft] = useState<Question | null>(null);
  const [optionsText, setOptionsText] = useState("");
  const [note, setNote] = useState(q?.note || "");
  if (!q)
    return (
      <Empty
        title="这道题已不在错题本中"
        description="可能已被删除。返回题库，继续寻找新的发现。"
        action={
          <Link className="button primary" href="/library">
            返回错题库
          </Link>
        }
      />
    );
  const activeFragment = q.fragments?.[fragmentIndex] || q.fragments?.[0];
  const page = data.pages.find(
    (p) => p.id === (activeFragment?.pageId || q.pageId),
  );
  const sourceRect = activeFragment?.rect || q.rect;
  function saveNote() {
    setData((d) => ({
      ...d,
      questions: d.questions.map((x) => (x.id === q!.id ? { ...x, note } : x)),
    }));
    notify("思考笔记已保存。");
  }
  return (
    <>
      <Link className="back-link" href="/library">
        <ArrowLeft size={16} />
        返回错题库
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A closer look</div>
          <h1>
            Understand the why<span className="title-dot">.</span>
          </h1>
          <p>慢一点，找到卡住的那一步。</p>
        </div>
        <div className="button-group">
          <button
            className="button secondary"
            onClick={() => {
              setDraft({ ...q });
              setOptionsText(
                (q.options || [])
                  .map((o) => `${o.label}. ${o.text}`)
                  .join("\n"),
              );
              setEdit(true);
            }}
          >
            <Pencil size={15} />
            编辑题目
          </button>
          <button
            className="icon-button danger"
            aria-label="删除题目"
            onClick={() => setRemove(true)}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      <div className="detail-layout">
        <div>
          <article className="detail-card">
            <div className="detail-meta">
              <span className="subject-label">{q.subject}</span>
              <span>{q.chapter}</span>
              <span
                className={`status ${q.status === "已掌握" ? "mastered" : ""}`}
              >
                {q.status}
              </span>
              <button
                className={`icon-button favorite ${q.favorite ? "selected" : ""}`}
                aria-label={q.favorite ? "取消收藏" : "收藏题目"}
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    questions: d.questions.map((x) =>
                      x.id === q.id ? { ...x, favorite: !x.favorite } : x,
                    ),
                  }))
                }
              >
                <Bookmark
                  size={18}
                  fill={q.favorite ? "currentColor" : "none"}
                />
              </button>
            </div>
            <h2>{q.title}</h2>
            <div className="question-provenance">
              <span className="pill">第 {q.questionNumber || "未编号"} 题</span>
              <span className="pill">{q.questionType || "待整理题型"}</span>
              <span className="pill">
                {q.answerId ? "已人工确认答案关联" : "答案独立展示"}
              </span>
            </div>
            {page && (
              <div className="segmented detail-switch">
                <button
                  className={!original ? "active" : ""}
                  onClick={() => setOriginal(false)}
                >
                  电子错题卡
                </button>
                <button
                  className={original ? "active" : ""}
                  onClick={() => setOriginal(true)}
                >
                  原书视图
                </button>
              </div>
            )}
            {!!q.fragments?.length && (
              <div className="fragment-source-links" aria-label="原书片段">
                {q.fragments.map((f, i) => (
                  <button
                    className={`button secondary ${fragmentIndex === i ? "selected" : ""}`}
                    key={f.id}
                    onClick={() => {
                      setFragmentIndex(i);
                      setOriginal(true);
                    }}
                  >
                    片段 {i + 1} · 第 {f.pageNumber} 页
                  </button>
                ))}
              </div>
            )}
            {original && page ? (
              <div className="original-preview">
                <img
                  src={page.image}
                  alt={`${page.book} 第 ${page.number} 页`}
                />
                {sourceRect && (
                  <div
                    className="original-highlight"
                    style={{
                      left: `${sourceRect.x * 100}%`,
                      top: `${sourceRect.y * 100}%`,
                      width: `${sourceRect.w * 100}%`,
                      height: `${sourceRect.h * 100}%`,
                    }}
                  />
                )}
              </div>
            ) : q.crop ? (
              <img
                className="detail-crop"
                src={q.crop}
                alt="从原书框选的题目"
              />
            ) : (
              <div className="question-paper">
                <span>思考与练习</span>
                <p>{q.title}</p>
                <div className="answer-lines">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
            <section className="structured-question">
              <h3>
                结构化题干{" "}
                <span className="tiny muted">
                  {q.extraction
                    ? `${q.extraction.method === "ocr" ? "OCR 草稿经人工核对" : "人工录入核对"} · ${new Date(q.extraction.reviewedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}`
                    : "手动录入 / 示例"}
                </span>
              </h3>
              <p>
                {q.structuredText ||
                  "暂无文字内容，原始图片已保留。可在「编辑题目」手动补充。"}
              </p>
            </section>
            {!!q.options?.length && (
              <ol className="question-options" aria-label="题目选项">
                {q.options.map((o) => (
                  <li key={o.label}>
                    <strong>{o.label}.</strong>
                    <span>{o.text}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="answer-toggle">
              <span>
                <Eye size={17} />
                先想一想，再看答案。
              </span>
              <button
                className="button secondary"
                onClick={() => setShow((s) => !s)}
              >
                {show ? <EyeOff size={15} /> : <Eye size={15} />}{" "}
                {show ? "隐藏答案" : "显示答案"}
              </button>
            </div>
            {show && (
              <div className="revealed-answer">
                <h3>
                  参考答案{" "}
                  <span className="tiny muted">
                    {q.answerId ? "来自人工确认的独立解析" : "手动输入 / 示例"}
                  </span>
                </h3>
                <p>{q.answer || "还没有填写答案，点击「编辑题目」补充。"}</p>
                {q.explanation && (
                  <>
                    <h3>思路拆解</h3>
                    <p>{q.explanation}</p>
                  </>
                )}
              </div>
            )}
          </article>
          {q.extraction?.rawText && (
            <details className="ocr-raw saved-ocr">
              <summary>保留的 OCR 原始输出（未经编辑的来源记录）</summary>
              <pre>{q.extraction.rawText}</pre>
            </details>
          )}
          <section className="notes-card">
            <div className="section-title">
              <h2>留给下次的自己</h2>
              <span className="tiny muted">我的思考笔记</span>
            </div>
            <textarea
              aria-label="我的思考笔记"
              rows={4}
              placeholder="我为什么做错？下次遇到同类题，要留意什么？"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button className="button secondary" onClick={saveNote}>
              <Save size={15} />
              保存笔记
            </button>
          </section>
        </div>
        <aside className="detail-aside">
          <section className="source-card">
            <BookOpen size={22} strokeWidth={1.3} />
            <h3>从原书出发</h3>
            <strong>{q.book}</strong>
            <p>{q.chapter}</p>
            {page ? (
              <>
                <span>第 {page.number} 页 · 已关联原书</span>
                <Link
                  className="button secondary full"
                  href={`/reader?page=${page.id}&question=${q.id}`}
                >
                  回到原书位置 <ArrowUpRight size={15} />
                </Link>
              </>
            ) : (
              <span className="muted">演示电子题目，未关联图片</span>
            )}
          </section>
          <section className="source-card">
            <h3>知识档案</h3>
            <dl>
              <div>
                <dt>知识点</dt>
                <dd>{q.topic}</dd>
              </div>
              <div>
                <dt>已复习</dt>
                <dd>{q.reviews} 次</dd>
              </div>
              <div>
                <dt>下次复习</dt>
                <dd>{q.due}</dd>
              </div>
            </dl>
            <label className="field-label">
              掌握状态
              <select
                aria-label="修改掌握状态"
                value={q.status}
                onChange={(e) => {
                  setData((d) => ({
                    ...d,
                    questions: d.questions.map((x) =>
                      x.id === q.id
                        ? { ...x, status: e.target.value as Question["status"] }
                        : x,
                    ),
                  }));
                  notify("掌握状态已更新。");
                }}
              >
                {["待复习", "巩固中", "已掌握"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </section>
          <Link className="ai-link-card" href={`/studio?id=${q.id}`}>
            <Sparkles size={24} strokeWidth={1.4} />
            <h3>换个角度想一想</h3>
            <p>让 AI Studio 陪你拆解思路。</p>
            <span>
              尝试 Mock 分析 <ArrowUpRight size={14} />
            </span>
          </Link>
        </aside>
      </div>
      <Modal
        open={edit}
        onOpenChange={setEdit}
        title="整理这道错题"
        description="修改题目内容与分类，保留已有原书关联。"
      >
        {draft && (
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              let options: Question["options"];
              try {
                options = parseOptions(optionsText);
              } catch (error) {
                notify(
                  error instanceof Error ? error.message : "请校对选项格式",
                );
                return;
              }
              const linkChanged =
                draft.answer !== q.answer ||
                draft.explanation !== q.explanation ||
                canonicalType(draft.questionType) !==
                  canonicalType(q.questionType) ||
                draft.questionNumber !== q.questionNumber ||
                draft.book !== q.book ||
                draft.chapter !== q.chapter;
              setData((d) => ({
                ...d,
                questions: d.questions.map((x) =>
                  x.id === draft.id
                    ? {
                        ...draft,
                        options,
                        note,
                        answerId: linkChanged ? undefined : draft.answerId,
                      }
                    : x,
                ),
              }));
              if (linkChanged)
                setData((d) => ({
                  ...d,
                  matches: d.matches.map((m) =>
                    m.questionId === q.id && m.state === "confirmed"
                      ? { ...m, state: "superseded" }
                      : m,
                  ),
                }));
              setEdit(false);
              notify("题目内容已更新。");
            }}
          >
            <label>
              题目摘要
              <input
                required
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <div className="form-row">
              <label>
                学科
                <input
                  required
                  value={draft.subject}
                  onChange={(e) =>
                    setDraft({ ...draft, subject: e.target.value })
                  }
                />
              </label>
              <label>
                知识点
                <input
                  required
                  value={draft.topic}
                  onChange={(e) =>
                    setDraft({ ...draft, topic: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                习题册
                <input
                  required
                  value={draft.book}
                  onChange={(e) => setDraft({ ...draft, book: e.target.value })}
                />
              </label>
              <label>
                章节
                <input
                  required
                  value={draft.chapter}
                  onChange={(e) =>
                    setDraft({ ...draft, chapter: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                题号
                <input
                  aria-label="编辑题号"
                  value={draft.questionNumber || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, questionNumber: e.target.value })
                  }
                />
              </label>
              <label>
                题型
                <select
                  aria-label="编辑题型"
                  value={draft.questionType || "待整理"}
                  onChange={(e) =>
                    setDraft({ ...draft, questionType: e.target.value })
                  }
                >
                  {[
                    "待整理",
                    "选择题",
                    "单选题",
                    "多选题",
                    "判断题",
                    "填空题",
                    "解答题",
                    "探究题",
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              结构化文字
              <textarea
                aria-label="编辑结构化文字"
                rows={4}
                value={draft.structuredText || ""}
                onChange={(e) =>
                  setDraft({ ...draft, structuredText: e.target.value })
                }
              />
            </label>
            <label>
              选项（人工校对，每项一行）
              <textarea
                aria-label="编辑选项"
                rows={5}
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="A. 课堂中心"
              />
            </label>
            <p className="form-hint">
              修改题型、题号、归属或答案会解除当前答案关联，需重新校对；历史快照仍保留。
            </p>
            <label>
              参考答案
              <textarea
                rows={3}
                value={draft.answer}
                onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
              />
            </label>
            <label>
              思路解析
              <textarea
                rows={3}
                value={draft.explanation}
                onChange={(e) =>
                  setDraft({ ...draft, explanation: e.target.value })
                }
              />
            </label>
            <button className="button primary">
              <Save size={15} />
              保存修改
            </button>
          </form>
        )}
      </Modal>
      <Modal
        open={remove}
        onOpenChange={setRemove}
        title="删除这道错题？"
        description="题目、笔记及复习记录将从本地错题库移除，原书图片会保留。此操作无法撤销。"
      >
        <div className="button-group">
          <button className="button secondary" onClick={() => setRemove(false)}>
            保留题目
          </button>
          <button
            className="button danger-button"
            onClick={() => {
              setData((d) => ({
                ...d,
                questions: d.questions.filter((x) => x.id !== q.id),
              }));
              notify("题目已删除，原书图片仍然保留。");
              router.push("/library");
            }}
          >
            确认删除
          </button>
        </div>
      </Modal>
    </>
  );
}
export function Review() {
  const { data, recordReview } = useLab();
  const [session, setSession] = useState<string[] | null>(null);
  const [position, setPosition] = useState(0);
  const [show, setShow] = useState(false);
  const [known, setKnown] = useState(0);
  const [subject, setSubject] = useState("全部学科");
  const [scope, setScope] = useState("due");
  const [customAnswer, setCustomAnswer] = useState("");
  const due = data.questions.filter(
    (q) => q.status !== "已掌握" && q.due <= today(),
  );
  const pool = data.questions.filter(
    (q) =>
      (scope === "all"
        ? q.status !== "已掌握"
        : q.status !== "已掌握" && q.due <= today()) &&
      (subject === "全部学科" || q.subject === subject),
  );
  const q = session
    ? data.questions.find((q) => q.id === session[position])
    : null;
  const done = session && position >= session.length;
  function start() {
    setSession(pool.map((q) => q.id));
    setPosition(0);
    setKnown(0);
    setShow(false);
    setCustomAnswer("");
  }
  function grade(value: boolean) {
    if (!q) return;
    recordReview(q.id, value);
    if (value) setKnown((n) => n + 1);
    setPosition((p) => p + 1);
    setShow(false);
    setCustomAnswer("");
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Make room for remembering</div>
          <h1>
            Review Center<span className="title-dot">.</span>
          </h1>
          <p>不是重复做题，是把知识慢慢变成自己的。</p>
        </div>
        <span className="pill">
          <RefreshCw size={13} />
          间隔复习 · 规则演示
        </span>
      </div>
      {done ? (
        <section className="review-complete">
          <Flower2 size={60} strokeWidth={1} />
          <span className="eyebrow">A little progress, made yours</span>
          <h2>
            今天的积累，<em>收好了。</em>
          </h2>
          <p>
            完成 {session.length} 道复习，其中 {known} 道选择了「已理解」。
          </p>
          <p className="muted">
            仍需巩固的题目将在明天回来；已理解的题目在 3 天后再次复习。
          </p>
          <div className="button-group">
            <button className="button primary" onClick={() => setSession(null)}>
              返回复习中心
            </button>
            <Link className="button secondary" href="/library">
              查看错题库 <ArrowUpRight size={15} />
            </Link>
          </div>
        </section>
      ) : session && q ? (
        <section className="review-session">
          <div className="review-session-top">
            <span>
              本次复习{" "}
              <strong>
                {position + 1} / {session.length}
              </strong>
            </span>
            <button className="text-link" onClick={() => setSession(null)}>
              结束本轮 <X size={15} />
            </button>
          </div>
          <div className="session-progress">
            <div style={{ width: `${(position / session.length) * 100}%` }} />
          </div>
          <div className="review-question">
            <span className="subject-label">
              {q.subject} / {q.topic}
            </span>
            <h2>{q.title}</h2>
            {q.crop && (
              <img className="detail-crop" src={q.crop} alt="待复习题目" />
            )}
            <textarea
              aria-label="本次作答草稿"
              placeholder="先写下你的思路，再揭晓答案…（本次草稿不保存）"
              value={customAnswer}
              onChange={(e) => setCustomAnswer(e.target.value)}
              rows={4}
            />
            {show ? (
              <>
                <div className="revealed-answer">
                  <h3>参考答案</h3>
                  <p>{q.answer || "尚未补充参考答案，可前往错题详情编辑。"}</p>
                  <p>{q.explanation}</p>
                </div>
                <div className="review-grade">
                  <button
                    className="button secondary"
                    onClick={() => grade(false)}
                  >
                    <RefreshCw size={16} />
                    还需巩固 · 明天复习
                  </button>
                  <button
                    className="button primary"
                    onClick={() => grade(true)}
                  >
                    <Check size={16} />
                    已理解 · 3 天后复习
                  </button>
                </div>
              </>
            ) : (
              <button className="button primary" onClick={() => setShow(true)}>
                <Eye size={16} />
                准备好了，查看答案
              </button>
            )}
          </div>
        </section>
      ) : (
        <>
          <div className="review-intro">
            <div>
              <span className="pill">今日的记忆清单</span>
              <h2>
                温故，<em>然后知新。</em>
              </h2>
              <p>
                有 {due.length} 道题到了再见面的时间。
                <br />
                留十分钟，给还在生长的知识。
              </p>
              <div className="button-group">
                <button
                  className="button primary"
                  disabled={!pool.length}
                  onClick={start}
                >
                  开始复习 {pool.length} 道题 <ArrowRight size={16} />
                </button>
                <select
                  aria-label="复习学科"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                >
                  <option>全部学科</option>
                  {[...new Set(data.questions.map((q) => q.subject))].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
                <select
                  aria-label="复习范围"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  <option value="due">今日到期</option>
                  <option value="all">全部未掌握</option>
                </select>
              </div>
            </div>
            <div className="review-flower">
              <Flower2 strokeWidth={0.6} />
              <span>
                {String(pool.length).padStart(2, "0")}
                <small>道题，等你发现</small>
              </span>
            </div>
          </div>
          <div className="section-title">
            <h2>这一次，要再认识的题目</h2>
            <span className="muted tiny">{pool.length} 道</span>
          </div>
          <div className="review-list">
            {pool.length ? (
              pool.map((q, i) => (
                <Link href={`/question?id=${q.id}`} key={q.id}>
                  <span className="list-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <span className="tiny muted">
                      {q.subject} · {q.topic}
                    </span>
                    <h3>{q.title}</h3>
                  </div>
                  <span className="status">{q.status}</span>
                  <ChevronRight size={17} />
                </Link>
              ))
            ) : (
              <Empty
                title="这段记忆，暂时不需要催促"
                description="没有匹配的待复习题目。可切换「全部未掌握」，或去采集新题。"
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
export function Studio() {
  const params = useSearchParams();
  const initialId = params.get("id") || "";
  return <StudioWorkspace key={initialId} initialId={initialId} />;
}
function StudioWorkspace({ initialId }: { initialId: string }) {
  const { data, setData, notify } = useLab();
  const [selected, setSelected] = useState(
    initialId || data.questions[0]?.id || "",
  );
  const [kind, setKind] = useState("思路拆解");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<{
    id: string;
    kind: string;
    text: string;
    prompt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const q = data.questions.find((q) => q.id === selected);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function analyze() {
    if (!q) return;
    setBusy(true);
    setResult(null);
    const item = q;
    timer.current = setTimeout(() => {
      const text =
        kind === "相似练习"
          ? `围绕「${item.topic}」的练习建议：\n1. 保留原题结构，先改变一个已知条件，观察结论会如何变化。\n2. 尝试从答案倒推必要条件，并写出每一步依据。\n3. 用自己的话解释为什么不能直接套用原题结论。\n\n这是固定规则生成的学习建议，并非已校验的新题或标准答案。`
          : kind === "错因复盘"
            ? `回看「${item.topic}」：\n1. 条件提取：把题干中的限制条件逐项圈出。\n2. 知识连接：确认所用方法的适用范围与边界情况。\n3. 过程检查：对照参考答案，找到第一次出现偏差的步骤。\n\n${item.note ? `你的原有笔记：${item.note}` : "建议写下本次疑问，下一次复习时先回看。"}\n\n以上是复盘清单，尚未分析你的真实作答。`
            : `题目主题：${item.topic}\n\n① 读懂条件\n用自己的话重述问题，把已知与待求分开。\n\n② 找到关键连接\n${item.explanation || `先回顾「${item.topic}」的定义与适用条件，再尝试分步骤推导。`}\n\n③ 回到结论\n${item.answer || "这道题还没有参考答案，请先手动补充，避免把未验证的推导当作正确结论。"}\n\n④ 再多想一步\n改变一个条件，原来的方法还成立吗？`;
      setResult({ id: item.id, kind, text, prompt });
      setBusy(false);
    }, 900);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Beyond the right answer</div>
          <h1>
            AI Studio<span className="title-dot">.</span>
          </h1>
          <p>把「为什么」多问一次，让理解更深一点。</p>
        </div>
        <span className="mock-badge">
          <span />
          Mock 模式 · 无需密钥
        </span>
      </div>
      <div className="studio-layout">
        <section className="studio-config">
          <span className="studio-config-icon">
            <Sparkles size={27} strokeWidth={1.2} />
          </span>
          <h2>从一个问题开始。</h2>
          <p>选一道错题，试着换个角度看它。</p>
          <label className="field-label">
            选择分析题目
            <select
              aria-label="选择分析题目"
              value={selected}
              disabled={busy}
              onChange={(e) => {
                setSelected(e.target.value);
                setResult(null);
              }}
            >
              {data.questions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.subject} · {q.title.slice(0, 34)}
                </option>
              ))}
            </select>
          </label>
          {q && (
            <div className="selected-question">
              <span className="subject-label">{q.topic}</span>
              <p>{q.title}</p>
              <Link className="text-link" href={`/question?id=${q.id}`}>
                查看原题 <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
          <label className="field-label">你想从哪里入手？</label>
          <div className="analysis-modes">
            {[
              {
                name: "思路拆解",
                icon: Lightbulb,
                sub: "从条件到结论，逐步看清",
              },
              {
                name: "错因复盘",
                icon: RefreshCw,
                sub: "找到值得再次留意的地方",
              },
              {
                name: "相似练习",
                icon: BookOpen,
                sub: "试着把理解迁移到新情境",
              },
            ].map((m) => (
              <button
                key={m.name}
                disabled={busy}
                className={kind === m.name ? "active" : ""}
                onClick={() => {
                  setKind(m.name);
                  setResult(null);
                }}
              >
                <m.icon size={18} />
                <span>
                  {m.name}
                  <small>{m.sub}</small>
                </span>
                {kind === m.name && <Check size={16} />}
              </button>
            ))}
          </div>
          <label className="field-label">
            补充你的疑问
            <textarea
              aria-label="补充分析疑问"
              disabled={busy}
              rows={3}
              placeholder="例如：为什么这里需要分类讨论？"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <button
            className="button primary full"
            disabled={busy || !q}
            onClick={analyze}
          >
            <Sparkles size={16} />
            {busy ? "正在准备学习建议…" : "生成模拟分析"}
          </button>
          <p className="privacy-note">
            当前为固定规则演示，不会发送你的题目。
            <br />
            补充疑问仅随分析展示，不进行真实语义理解。
          </p>
        </section>
        <section className="studio-output">
          {busy ? (
            <div className="studio-empty">
              <Sparkles size={36} className="spin-slow" />
              <h2>为思考，留一点时间。</h2>
              <p>正在整理模拟学习建议…</p>
            </div>
          ) : result ? (
            <>
              <div className="output-heading">
                <span className="pill">
                  <Sparkles size={12} />
                  模拟 · {result.kind}
                </span>
                <span className="tiny muted">请对照教材核验</span>
              </div>
              <h2>
                让解题的过程，<em>清晰起来。</em>
              </h2>
              {result.prompt && (
                <blockquote>你的疑问：{result.prompt}</blockquote>
              )}
              <div className="analysis-result">{result.text}</div>
              <div className="analysis-disclaimer">
                <Lightbulb size={17} />
                <span>
                  此内容来自固定模板与已有题目资料，不代表真实 AI
                  推理。参考答案需要人工核验。
                </span>
              </div>
              <button
                className="button secondary"
                onClick={() => {
                  setData((d) => ({
                    ...d,
                    questions: d.questions.map((q) =>
                      q.id === result.id
                        ? {
                            ...q,
                            note: [
                              q.note,
                              `[Mock ${result.kind}]\n${result.text}`,
                            ]
                              .filter(Boolean)
                              .join("\n\n"),
                          }
                        : q,
                    ),
                  }));
                  notify("模拟分析已追加到题目笔记，原有笔记已保留。");
                }}
              >
                <Save size={15} />
                保存到题目笔记
              </button>
            </>
          ) : (
            <div className="studio-empty">
              <div className="studio-orbit">
                <Sparkles size={36} strokeWidth={1} />
                <span />
                <i />
              </div>
              <span className="eyebrow">A space for your curiosity</span>
              <h2>
                好的问题，
                <br />
                比标准答案<em>更有力量。</em>
              </h2>
              <p>
                在左侧选择一道错题，
                <br />
                一起把思路慢慢展开。
              </p>
              <div className="studio-empty-tags">
                <span>发现盲点</span>
                <span>连接知识</span>
                <span>重新理解</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
