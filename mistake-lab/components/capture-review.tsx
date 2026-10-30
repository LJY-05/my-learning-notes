"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ScanLine, Trash2, X } from "lucide-react";
import { useLab } from "./store";
import { Modal } from "./ui";
import {
  moveFragment,
  parseOcrDraft,
  unchecked,
  validateCapture,
  type CaptureFields,
} from "@/lib/capture";
import { parseOptions } from "@/lib/materials";
import { mergePreview } from "@/lib/image-capture";
import { today, type Question } from "@/lib/data";
export function CaptureReview({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { data, setData, notify } = useLab();
  const draft = data.captureDraft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [mode, setMode] = useState<"block" | "sparse">("block");
  const [language, setLanguage] = useState("zh");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  if (!draft) return null;
  const raw = draft.fragments
    .map(
      (f, i) =>
        `[片段 ${i + 1} / 原书第 ${f.pageNumber} 页]\n${f.ocr?.text || "尚未识别"}`,
    )
    .join("\n\n");
  function fields(patch: Partial<CaptureFields>) {
    setData((d) =>
      d.captureDraft
        ? {
            ...d,
            captureDraft: {
              ...d.captureDraft,
              fields: { ...d.captureDraft.fields, ...patch },
              review: unchecked(),
            },
          }
        : d,
    );
  }
  async function recognize() {
    setBusy(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      for (let i = 0; i < draft!.fragments.length; i++) {
        const fragment = draft!.fragments[i];
        setProgress(`正在识别片段 ${i + 1}/${draft!.fragments.length}…`);
        const blob = await (await fetch(fragment.crop)).blob();
        const form = new FormData();
        form.append("image", blob, "crop.png");
        form.append("mode", mode);
        form.append("language", language);
        const response = await fetch("/api/ocr", {
          method: "POST",
          body: form,
          signal: abort.signal,
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "OCR 失败。");
        setData((d) =>
          d.captureDraft?.id === draft!.id
            ? {
                ...d,
                captureDraft: {
                  ...d.captureDraft,
                  review: unchecked(),
                  fragments: d.captureDraft.fragments.map((f) =>
                    f.id === fragment.id ? { ...f, ocr: result } : f,
                  ),
                },
              }
            : d,
        );
      }
      notify("识别完成，请查看原始输出、应用建议并人工核对。");
    } catch (err) {
      setError(
        abort.signal.aborted
          ? "识别已取消；已完成片段的结果仍保留。"
          : err instanceof Error
            ? err.message
            : "OCR 失败，请手动录入。",
      );
    } finally {
      controller.current = null;
      setBusy(false);
      setProgress("");
    }
  }
  function apply() {
    const recognized = draft!.fragments
      .map((f) => f.ocr?.text || "")
      .join("\n");
    if (!recognized.trim()) {
      setError("OCR 没有识别出文字，可切换版面模式重试或手动录入。");
      return;
    }
    const parsed = parseOcrDraft(recognized);
    fields({
      stem: parsed.stem,
      optionsText: parsed.optionsText,
      questionNumber: parsed.questionNumber || draft!.fields.questionNumber,
      questionType:
        parsed.questionType === "待整理"
          ? draft!.fields.questionType
          : parsed.questionType,
      title: parsed.stem.split("\n")[0]?.slice(0, 100) || draft!.fields.title,
    });
    notify("建议已写入可编辑草稿，尚未归档。请重新逐项核对。");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const options = parseOptions(draft!.fields.optionsText);
      validateCapture(draft!, options);
      if (
        draft!.fragments.some((f) => !data.pages.some((p) => p.id === f.pageId))
      )
        throw Error("有原书页已不存在，请重新采集。");
      if (
        draft!.fragments.some((f) =>
          data.questions.some(
            (q) =>
              q.regionId === f.regionId ||
              q.fragments?.some((part) => part.regionId === f.regionId),
          ),
        )
      )
        throw Error("有片段已属于其他错题，请移除重复片段。");
      setBusy(true);
      const crop = await mergePreview(draft!.fragments.map((f) => f.crop));
      const first = draft!.fragments[0];
      const q: Question = {
        id: crypto.randomUUID(),
        title: draft!.fields.title.trim(),
        structuredText: draft!.fields.stem.trim(),
        questionNumber: draft!.fields.questionNumber.trim(),
        questionType: draft!.fields.questionType,
        options,
        book: draft!.book,
        chapter: draft!.chapter,
        subject: draft!.subject,
        topic: draft!.fields.topic.trim() || "待整理",
        note: draft!.fields.note,
        answer: "",
        explanation: "",
        status: "待复习",
        created: today(),
        due: today(),
        favorite: false,
        reviews: 0,
        pageId: first.pageId,
        regionId: first.regionId,
        rect: first.rect,
        crop,
        fragments: draft!.fragments,
        extraction: {
          method: draft!.fragments.some((f) => f.ocr) ? "ocr" : "manual",
          reviewedAt: new Date().toISOString(),
          rawText: draft!.fragments.map((f) => f.ocr?.text || "").join("\n\n"),
          engine: draft!.fragments.find((f) => f.ocr)?.ocr?.engine,
        },
      };
      setData((d) => ({
        ...d,
        questions: [...d.questions, q],
        regions: [
          ...d.regions.filter(
            (r) => !draft!.fragments.some((f) => f.regionId === r.id),
          ),
          ...draft!.fragments.map((f) => ({
            id: f.regionId,
            pageId: f.pageId,
            rect: f.rect,
            questionNumber: q.questionNumber || "",
            questionType: q.questionType || "",
            topic: q.topic,
            structuredText: q.structuredText || "",
            origin: (f.ocr ? "ocr" : "manual") as "ocr" | "manual",
            recognition: "confirmed" as const,
          })),
        ],
        captureDraft: undefined,
      }));
      onOpenChange(false);
      notify(
        `已保存已核对题目，保留 ${q.fragments!.length} 个原书片段；答案仍待单独确认。`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
      title="先看清，再收进错题本。"
      description="原图、OCR 原始输出与可编辑草稿分开保留。识别不会自动归档，更不会自动写入答案。"
      wide
    >
      <div className="capture-review-grid">
        <section className="fragment-review">
          <h3>原图片段 · 按阅读顺序</h3>
          {draft.fragments.map((f, i) => (
            <article key={f.id}>
              <div className="fragment-meta">
                <span>
                  片段 {i + 1} · 第 {f.pageNumber} 页
                </span>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`上移片段 ${i + 1}`}
                  disabled={busy || i === 0}
                  onClick={() =>
                    setData((d) =>
                      d.captureDraft
                        ? {
                            ...d,
                            captureDraft: moveFragment(
                              d.captureDraft,
                              f.id,
                              -1,
                            ),
                          }
                        : d,
                    )
                  }
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`下移片段 ${i + 1}`}
                  disabled={busy || i === draft.fragments.length - 1}
                  onClick={() =>
                    setData((d) =>
                      d.captureDraft
                        ? {
                            ...d,
                            captureDraft: moveFragment(d.captureDraft, f.id, 1),
                          }
                        : d,
                    )
                  }
                >
                  <ArrowDown size={14} />
                </button>
              </div>
              <img
                src={f.crop}
                alt={`第 ${f.pageNumber} 页题目片段 ${i + 1}`}
              />
              <details className="fragment-full-resolution">
                <summary>放大核对原图片段</summary>
                <div>
                  <img
                    src={f.crop}
                    alt={`原始分辨率片段 ${i + 1}`}
                    style={{
                      maxWidth: "none",
                      width: f.pixels.width,
                      height: f.pixels.height,
                    }}
                  />
                </div>
              </details>
              <p className="tiny muted">
                原图 {f.originalWidth}×{f.originalHeight} · 裁剪{" "}
                {f.pixels.width}×{f.pixels.height}
                <br />
                像素起点 ({f.pixels.x}, {f.pixels.y}) ·{" "}
                {f.originalFileUsed
                  ? "基于原始文件"
                  : "基于现有页图，原文件不可用"}
              </p>
              {f.ocr && (
                <span className="pill">
                  {f.ocr.engine} · 引擎置信值 {f.ocr.confidence ?? "未知"}
                  （非准确率）
                </span>
              )}
            </article>
          ))}
          <div className="ocr-controls">
            <select
              aria-label="OCR识别语言"
              value={language}
              disabled={busy}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="zh">中文优先（含选项字母）</option>
              <option value="mixed">中文 / 英文混排</option>
              <option value="en">英文</option>
            </select>
            <select
              aria-label="OCR版面模式"
              value={mode}
              disabled={busy}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="block">连续题干 / 普通选项</option>
              <option value="sparse">稀疏版面 / 分栏选项</option>
            </select>
            <button
              className="button primary"
              type="button"
              disabled={busy}
              onClick={recognize}
            >
              <ScanLine size={15} />
              {busy ? progress || "正在处理…" : "执行真实 OCR"}
            </button>
            {busy && controller.current && (
              <button
                className="button secondary"
                type="button"
                onClick={() => controller.current?.abort()}
              >
                <X size={14} />
                取消识别
              </button>
            )}
          </div>
          <p className="form-hint">
            仅将这些裁剪图临时发送到本站 OCR
            服务，不调用第三方。水印、表格、公式和分栏可能识别错误，必须对照原图。
          </p>
          <details className="ocr-raw">
            <summary>查看 OCR 原始输出（不可改写）</summary>
            <pre>{raw}</pre>
          </details>
          <button
            className="button secondary full"
            type="button"
            disabled={busy || !draft.fragments.some((f) => f.ocr)}
            onClick={apply}
          >
            将识别建议应用到右侧草稿
          </button>
        </section>
        <form className="form-stack" onSubmit={save}>
          <div className="draft-state">
            <span className="pill">待人工核对 · 未归档</span>
            <small>
              {draft.book} / {draft.chapter}
            </small>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <fieldset disabled={busy} className="review-fields">
            <label>
              题目摘要
              <input
                aria-label="核对题目摘要"
                required
                value={draft.fields.title}
                onChange={(e) => fields({ title: e.target.value })}
              />
            </label>
            <div className="form-row">
              <label>
                题号
                <input
                  aria-label="核对题号"
                  required
                  value={draft.fields.questionNumber}
                  onChange={(e) => fields({ questionNumber: e.target.value })}
                />
              </label>
              <label>
                题型
                <select
                  aria-label="核对题型"
                  value={draft.fields.questionType}
                  onChange={(e) => fields({ questionType: e.target.value })}
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
            </div>
            <label>
              结构化题干
              <textarea
                aria-label="核对题干"
                required
                rows={6}
                value={draft.fields.stem}
                onChange={(e) => fields({ stem: e.target.value })}
              />
            </label>
            <label>
              选项（每项一行；判断/填空可不填）
              <textarea
                aria-label="核对选项"
                rows={5}
                placeholder={"A. 选项内容\nB. 选项内容"}
                value={draft.fields.optionsText}
                onChange={(e) => fields({ optionsText: e.target.value })}
              />
            </label>
            <label>
              知识点（手动校对，OCR 不自动推断）
              <input
                value={draft.fields.topic}
                onChange={(e) => fields({ topic: e.target.value })}
              />
            </label>
            <label>
              我的疑问
              <textarea
                rows={2}
                value={draft.fields.note}
                onChange={(e) => fields({ note: e.target.value })}
              />
            </label>
            <label className="review-check">
              <input
                type="checkbox"
                aria-label="已核对题干与选项"
                checked={draft.review.text}
                onChange={(e) =>
                  setData((d) =>
                    d.captureDraft
                      ? {
                          ...d,
                          captureDraft: {
                            ...d.captureDraft,
                            review: {
                              ...d.captureDraft.review,
                              text: e.target.checked,
                            },
                          },
                        }
                      : d,
                  )
                }
              />
              我已对照每个原图片段，核对完整题干与选项。
            </label>
            <label className="review-check">
              <input
                type="checkbox"
                aria-label="已核对题型和跨页完整性"
                checked={draft.review.scope}
                onChange={(e) =>
                  setData((d) =>
                    d.captureDraft
                      ? {
                          ...d,
                          captureDraft: {
                            ...d.captureDraft,
                            review: {
                              ...d.captureDraft.review,
                              scope: e.target.checked,
                            },
                          },
                        }
                      : d,
                  )
                }
              />
              我已确认题号、题型，以及片段顺序和跨页完整性。
            </label>
          </fieldset>
          <button
            className="button primary full"
            disabled={busy || !draft.review.text || !draft.review.scope}
          >
            <Check size={15} />
            确认校对并保存题目
          </button>
          <button
            type="button"
            className="button secondary full"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            暂存草稿，继续查看原书
          </button>
          <p className="form-hint">
            改动文字、片段或 OCR
            结果后，需要重新核对。答案解析在归档后单独匹配，不能由 OCR
            自动确认。
          </p>
        </form>
      </div>
    </Modal>
  );
}
