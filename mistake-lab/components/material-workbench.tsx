"use client";
import { useState } from "react";
import {
  BookOpen,
  Check,
  FileText,
  Link2,
  Pencil,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { useLab } from "./store";
import { Empty, Modal } from "./ui";
import {
  archiveFile,
  confirmMatch,
  draftMatches,
  type AnswerEntry,
  type SourceAsset,
} from "@/lib/materials";

const emptyEntry = () => ({
  book: "数学 · 思维进阶",
  chapter: "第一章 函数与导数",
  questionNumber: "1",
  questionType: "待整理",
  answer: "",
  explanation: "",
  sourceId: "",
});
export function MaterialWorkbench() {
  const { data, setData, notify } = useLab();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("sources");
  const [file, setFile] = useState<File | null>(null);
  const [role, setRole] = useState<"workbook" | "answer">("answer");
  const [sourceBook, setSourceBook] = useState("数学 · 思维进阶");
  const [sourceChapter, setSourceChapter] = useState("第一章 函数与导数");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(emptyEntry);
  const [editId, setEditId] = useState<string | null>(null);
  const [replace, setReplace] = useState<Record<string, boolean>>({});
  const pending = data.matches.filter((m) => m.state === "pending");
  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("请选择一份 PDF 或图片资料。");
      return;
    }
    const pdf =
      file.type === "application/pdf" ||
      (!file.type && file.name.toLowerCase().endsWith(".pdf"));
    if (
      !pdf &&
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      setError("仅支持 PDF、JPG、PNG、WebP。");
      return;
    }
    if (!sourceBook.trim() || !sourceChapter.trim()) {
      setError("请填写习题册与章节。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const originalDataUrl = await archiveFile(file);
      const id = crypto.randomUUID();
      const asset: SourceAsset = {
        id,
        role,
        format: pdf ? "pdf" : "image",
        name: file.name,
        book: sourceBook.trim(),
        chapter: sourceChapter.trim(),
        subject:
          data.pages.find((p) => p.book === sourceBook.trim())?.subject ||
          "待整理",
        originalDataUrl,
        size: file.size,
        created: new Date().toISOString(),
        state: "registered",
      };
      setData((d) => ({ ...d, assets: [...d.assets, asset] }));
      setFile(null);
      notify("原始资料已保存；未执行 PDF 解析、OCR 或批量处理。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "资料保存失败。");
    } finally {
      setBusy(false);
    }
  }
  function saveEntry(e: React.FormEvent) {
    e.preventDefault();
    if (
      !draft.book.trim() ||
      !draft.chapter.trim() ||
      !draft.questionNumber.trim() ||
      !draft.answer.trim()
    ) {
      setError("请完整填写习题册、章节、题号和答案。");
      return;
    }
    const prior = data.answers.find((a) => a.id === editId);
    const entry: AnswerEntry = {
      ...draft,
      book: draft.book.trim(),
      chapter: draft.chapter.trim(),
      questionNumber: draft.questionNumber.trim(),
      id: prior?.id || crypto.randomUUID(),
      sourceId: draft.sourceId || undefined,
      origin: prior?.origin || "manual",
      revision: (prior?.revision || 0) + 1,
    };
    setData((d) => ({
      ...d,
      answers: prior
        ? d.answers.map((a) => (a.id === entry.id ? entry : a))
        : [...d.answers, entry],
    }));
    setDraft(emptyEntry());
    setEditId(null);
    setError("");
    notify("解析条目已保存，尚未关联到任何错题。");
  }
  function propose(ids: string[]) {
    const candidates = draftMatches(data, ids);
    setData((d) => ({ ...d, matches: [...d.matches, ...candidates] }));
    setTab("matches");
    notify(
      candidates.length
        ? `生成 ${candidates.length} 个待确认候选；题目答案尚未改变。`
        : "没有新候选，请先校对题型与题号，再尝试人工指定目标。",
    );
  }
  function demo() {
    if (data.batches.some((b) => b.id === "demo-answers-1")) return;
    const entries: AnswerEntry[] = [
      {
        id: "demo-answer-1",
        book: "数学 · 思维进阶",
        chapter: "第一章 函数与导数",
        questionNumber: "1",
        questionType: "解答题",
        answer: "当 a ≤ 0 时为 1；0 < a < 2 时为 1 − a²；a ≥ 2 时为 5 − 4a。",
        explanation: "演示解析：先比较对称轴与区间位置，再分别代入顶点或端点。",
        origin: "demo",
        revision: 1,
      },
      {
        id: "demo-answer-2",
        book: "数学 · 思维进阶",
        chapter: "第二章 数列",
        questionNumber: "1",
        questionType: "解答题",
        answer: "aₙ = 2n。",
        explanation: "演示解析：由前 n 项和作差，n = 1 时单独检验。",
        origin: "demo",
        revision: 1,
      },
      {
        id: "demo-answer-3",
        book: "数学 · 思维进阶",
        chapter: "第一章 函数与导数",
        questionNumber: "999",
        questionType: "解答题",
        answer: "演示待核对答案。",
        explanation: "这条故意没有匹配题目，供人工修正体验。",
        origin: "demo",
        revision: 1,
      },
    ];
    setData((d) => ({
      ...d,
      answers: [...d.answers, ...entries],
      batches: [
        ...d.batches,
        {
          id: "demo-answers-1",
          role: "answer",
          name: "3 条演示解析（非真实资料提取）",
          state: "awaiting-review",
          sourceIds: [],
          created: new Date().toISOString(),
        },
      ],
    }));
    setTab("entries");
    notify("已载入三条演示条目，未处理任何真实文件。");
  }
  return (
    <>
      <button className="button secondary" onClick={() => setOpen(true)}>
        <FileText size={16} />
        资料与答案{" "}
        {pending.length > 0 && (
          <span className="count-dot">{pending.length}</span>
        )}
      </button>
      <Modal
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
        title="原题与解析，各归其位。"
        description="独立保存原始资料，先核对候选，再决定关联。PDF 与 OCR 当前仅预留，上传不会自动识别。"
        wide
      >
        <div className="material-tabs" role="tablist" aria-label="资料工作台">
          <button
            role="tab"
            aria-selected={tab === "sources"}
            onClick={() => {
              setTab("sources");
              setError("");
            }}
          >
            原始资料 <span>{data.assets.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={tab === "entries"}
            onClick={() => {
              setTab("entries");
              setError("");
            }}
          >
            解析条目 <span>{data.answers.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={tab === "matches"}
            onClick={() => {
              setTab("matches");
              setError("");
            }}
          >
            匹配审核 <span>{pending.length}</span>
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {tab === "sources" ? (
          <div className="material-columns">
            <form className="form-stack" onSubmit={register}>
              <h3>保存一份原始资料</h3>
              <label>
                资料用途
                <select
                  aria-label="资料用途"
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                >
                  <option value="answer">独立答案解析</option>
                  <option value="workbook">PDF 习题册（登记）</option>
                </select>
              </label>
              <label>
                原始文件
                <input
                  key={data.assets.length}
                  aria-label="原始资料文件"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                    setError("");
                  }}
                />
              </label>
              <label>
                所属习题册
                <input
                  required
                  value={sourceBook}
                  onChange={(e) => setSourceBook(e.target.value)}
                />
              </label>
              <label>
                所属章节
                <input
                  required
                  value={sourceChapter}
                  onChange={(e) => setSourceChapter(e.target.value)}
                />
              </label>
              <p className="form-hint">
                每份最多 10 MB。保存完整原文件，不渲染
                PDF、不自动提取题目或答案。图片习题册请使用阅读器「上传书页」。
              </p>
              <button className="button primary" disabled={busy}>
                <Upload size={15} />
                {busy ? "正在保存…" : "登记并保存原文件"}
              </button>
            </form>
            <div className="asset-list">
              {data.assets.length ? (
                data.assets.map((a) => (
                  <article key={a.id}>
                    <div className="asset-title">
                      <FileText size={18} />
                      <strong>{a.name}</strong>
                      <span className="pill">{a.format.toUpperCase()}</span>
                    </div>
                    <p>
                      {a.role === "answer" ? "答案解析资料" : "习题册资料"} ·{" "}
                      {a.book} / {a.chapter}
                    </p>
                    {a.format === "image" && (
                      <img
                        src={a.originalDataUrl}
                        alt={`原始解析资料 ${a.name}`}
                      />
                    )}
                    <span className="status">已登记 · 未解析</span>
                    <div className="button-group">
                      <a
                        className="text-link"
                        href={a.originalDataUrl}
                        download={a.name}
                      >
                        下载原文件
                      </a>
                      {a.role === "answer" && (
                        <button
                          className="text-link"
                          onClick={() => {
                            setDraft({
                              ...emptyEntry(),
                              book: a.book,
                              chapter: a.chapter,
                              sourceId: a.id,
                            });
                            setEditId(null);
                            setTab("entries");
                          }}
                        >
                          手动录入解析
                        </button>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <Empty
                  title="让资料保留自己的出处"
                  description="原书与答案解析分别保存；当前只登记文件，不自动识别内容。"
                />
              )}
            </div>
          </div>
        ) : tab === "entries" ? (
          <div className="material-columns">
            <form className="form-stack" onSubmit={saveEntry}>
              <h3>{editId ? "修正解析条目" : "手动录入一条解析"}</h3>
              <label>
                解析来源
                <select
                  aria-label="解析来源"
                  value={draft.sourceId}
                  onChange={(e) =>
                    setDraft({ ...draft, sourceId: e.target.value })
                  }
                >
                  <option value="">手动输入，无原文件</option>
                  {data.assets
                    .filter((a) => a.role === "answer")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                习题册
                <input
                  aria-label="解析习题册"
                  required
                  value={draft.book}
                  onChange={(e) => setDraft({ ...draft, book: e.target.value })}
                />
              </label>
              <label>
                章节
                <input
                  aria-label="解析章节"
                  required
                  value={draft.chapter}
                  onChange={(e) =>
                    setDraft({ ...draft, chapter: e.target.value })
                  }
                />
              </label>
              <label>
                题号
                <input
                  aria-label="解析题号"
                  required
                  value={draft.questionNumber}
                  onChange={(e) =>
                    setDraft({ ...draft, questionNumber: e.target.value })
                  }
                />
              </label>
              <label>
                题型（需人工校对）
                <select
                  aria-label="解析题型"
                  value={draft.questionType}
                  onChange={(e) =>
                    setDraft({ ...draft, questionType: e.target.value })
                  }
                >
                  {[
                    "待整理",
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
              <label>
                答案
                <textarea
                  aria-label="解析答案"
                  required
                  rows={2}
                  value={draft.answer}
                  onChange={(e) =>
                    setDraft({ ...draft, answer: e.target.value })
                  }
                />
              </label>
              <label>
                解析过程
                <textarea
                  aria-label="解析过程"
                  rows={3}
                  value={draft.explanation}
                  onChange={(e) =>
                    setDraft({ ...draft, explanation: e.target.value })
                  }
                />
              </label>
              <button className="button primary">
                <Plus size={15} />
                {editId
                  ? "保存修正（不自动更新已确认答案）"
                  : "保存独立解析条目"}
              </button>
              {editId && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setEditId(null);
                    setDraft(emptyEntry());
                  }}
                >
                  取消编辑
                </button>
              )}
            </form>
            <div>
              <div className="material-actions">
                <button
                  className="button secondary"
                  disabled={data.batches.some((b) => b.id === "demo-answers-1")}
                  onClick={demo}
                >
                  载入 3 条演示解析
                </button>
                <button
                  className="button primary"
                  disabled={!data.answers.length}
                  onClick={() => propose(data.answers.map((a) => a.id))}
                >
                  <Link2 size={14} />
                  生成匹配候选
                </button>
              </div>
              <div className="entry-list">
                {data.answers.map((a) => (
                  <article key={a.id}>
                    <div className="entry-heading">
                      <span className="subject-label">
                        {a.questionType || "题型待校对"} · 第 {a.questionNumber}{" "}
                        题
                      </span>
                      <span className="tiny muted">
                        {a.origin === "demo" ? "演示条目" : "手动录入"} · v
                        {a.revision}
                      </span>
                      <button
                        className="icon-button"
                        aria-label={`编辑解析 ${a.questionNumber}`}
                        onClick={() => {
                          setEditId(a.id);
                          setDraft({
                            book: a.book,
                            chapter: a.chapter,
                            questionNumber: a.questionNumber,
                            questionType: a.questionType || "待整理",
                            answer: a.answer,
                            explanation: a.explanation,
                            sourceId: a.sourceId || "",
                          });
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                    <h4>{a.book}</h4>
                    <p>{a.chapter}</p>
                    <div className="entry-answer">{a.answer}</div>
                    <details>
                      <summary>查看解析与手动指定目标</summary>
                      <p>{a.explanation || "尚无解析过程。"}</p>
                      <label className="field-label">
                        关联目标
                        <select
                          aria-label={`为解析 ${a.questionNumber} 指定题目`}
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const qid = e.target.value;
                            setData((d) => ({
                              ...d,
                              matches: [
                                ...d.matches,
                                {
                                  id: crypto.randomUUID(),
                                  answerId: a.id,
                                  answerRevision: a.revision,
                                  questionId: qid,
                                  state: "pending",
                                  reason: "人工指定目标",
                                },
                              ],
                            }));
                            setTab("matches");
                            notify("人工候选已建立，请核对后确认。");
                          }}
                        >
                          <option value="">选择错题，创建人工候选</option>
                          {data.questions.map((q) => (
                            <option key={q.id} value={q.id}>
                              {q.book} / {q.chapter} /{" "}
                              {q.questionNumber || "未编号"} ·{" "}
                              {q.title.slice(0, 25)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </details>
                  </article>
                ))}
                {!data.answers.length && (
                  <Empty
                    title="解析是独立的一份资料"
                    description="先手动录入少量内容，或载入三条演示解析体验匹配审核。"
                  />
                )}
              </div>
              {data.batches
                .filter((b) => b.id === "demo-answers-1")
                .map((b) => (
                  <div className="batch-note" key={b.id}>
                    <span className="pill">演示批次</span>
                    {b.name}
                    <small>待人工审核，不代表真实资料已识别。</small>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="match-list">
            <div className="review-policy">
              <Check size={18} />
              <p>
                候选不会改变题目答案。人工确认后保存关联与当前解析快照，旧的确认记录会保留。习题册、章节、题型和题号相同仍可能有歧义，请逐项核对。
              </p>
            </div>
            {data.matches
              .filter((m) => m.state === "pending" || m.state === "confirmed")
              .map((m) => {
                const q = data.questions.find((q) => q.id === m.questionId),
                  a = data.answers.find((a) => a.id === m.answerId);
                return (
                  <article className="match-card" key={m.id}>
                    <div className="entry-heading">
                      <span className="pill">
                        {m.state === "confirmed" ? "已人工确认" : "待人工确认"}
                      </span>
                      <span className="tiny muted">
                        {m.state === "confirmed"
                          ? m.reason.replace(
                              /，尚未人工确认|（仍需审核确认）|（待确认）/g,
                              "",
                            )
                          : m.reason}
                      </span>
                    </div>
                    <div className="match-pair">
                      <div>
                        <span className="eyebrow">原题</span>
                        <h4>{q?.title || "目标题目已删除"}</h4>
                        <p>
                          {q?.book} / {q?.chapter} / 第{" "}
                          {q?.questionNumber || "未编号"} 题 ·{" "}
                          {q?.questionType || "题型待校对"}
                        </p>
                        {q?.crop && <img src={q.crop} alt="待匹配题目原图" />}
                      </div>
                      <div>
                        <span className="eyebrow">
                          答案解析 ·{" "}
                          {m.state === "confirmed"
                            ? m.snapshot?.questionType
                            : a?.questionType || "题型待校对"}{" "}
                          · v
                          {m.state === "confirmed"
                            ? m.answerRevision
                            : a?.revision}
                        </span>
                        <h4>
                          {(m.state === "confirmed"
                            ? m.snapshot?.answer
                            : a?.answer) || "解析已删除"}
                        </h4>
                        <p>
                          {m.state === "confirmed"
                            ? m.snapshot?.explanation
                            : a?.explanation}
                        </p>
                        <p>
                          {m.state === "confirmed" ? m.snapshot?.book : a?.book}{" "}
                          /{" "}
                          {m.state === "confirmed"
                            ? m.snapshot?.chapter
                            : a?.chapter}{" "}
                          / 第{" "}
                          {m.state === "confirmed"
                            ? m.snapshot?.questionNumber
                            : a?.questionNumber}{" "}
                          题
                        </p>
                      </div>
                    </div>
                    {m.state === "pending" ? (
                      <>
                        <label className="field-label">
                          修正匹配目标
                          <select
                            aria-label={`修正匹配目标 ${m.id}`}
                            value={m.questionId}
                            onChange={(e) => {
                              const questionId = e.target.value;
                              setReplace((r) => ({ ...r, [m.id]: false }));
                              setData((d) => ({
                                ...d,
                                matches: d.matches.map((x) =>
                                  x.id === m.id
                                    ? {
                                        ...x,
                                        questionId,
                                        reason: "人工修正目标",
                                      }
                                    : x,
                                ),
                              }));
                            }}
                          >
                            {data.questions.map((q) => (
                              <option key={q.id} value={q.id}>
                                {q.book} / {q.chapter} /{" "}
                                {q.questionNumber || "未编号"} ·{" "}
                                {q.title.slice(0, 30)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {q && (q.answer || q.explanation || q.answerId) && (
                          <label className="replace-check">
                            <input
                              type="checkbox"
                              checked={!!replace[m.id]}
                              onChange={(e) =>
                                setReplace((r) => ({
                                  ...r,
                                  [m.id]: e.target.checked,
                                }))
                              }
                            />
                            该题已有答案，我确认用当前解析替换（历史确认记录保留）
                          </label>
                        )}
                        <div className="button-group">
                          <button
                            className="button primary"
                            disabled={
                              !q || !a || a.revision !== m.answerRevision
                            }
                            onClick={() => {
                              try {
                                setData(
                                  confirmMatch(data, m.id, !!replace[m.id]),
                                );
                                setError("");
                                notify(
                                  "已人工确认匹配，答案与来源关联已保存。",
                                );
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "确认失败",
                                );
                              }
                            }}
                          >
                            <Check size={15} />
                            确认匹配并保存
                          </button>
                          <button
                            className="button secondary"
                            onClick={() => {
                              setData((d) => ({
                                ...d,
                                matches: d.matches.map((x) =>
                                  x.id === m.id
                                    ? { ...x, state: "rejected" }
                                    : x,
                                ),
                              }));
                              notify("候选已拒绝，题目答案没有改变。");
                            }}
                          >
                            <X size={14} />
                            不是这道题
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="confirmed-note">
                        已保存确认时的解析快照。修订解析不会静默覆盖题目答案；需要重新生成候选并确认。
                      </p>
                    )}
                  </article>
                );
              })}
            {!data.matches.some(
              (m) => m.state === "pending" || m.state === "confirmed",
            ) && (
              <Empty
                title="先提出候选，再由你确认"
                description="在解析条目录入答案后生成规则候选，也可以为未匹配条目人工指定题目。"
                action={
                  <button
                    className="button secondary"
                    onClick={() => setTab("entries")}
                  >
                    整理解析条目
                  </button>
                }
              />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
