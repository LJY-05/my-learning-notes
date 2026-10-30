"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Upload, FileText, Check, ArrowDown, X } from "lucide-react";
import { useLab } from "./store";
import { MaterialWorkbench } from "./material-workbench";
import { cropOriginal, mergePreview } from "@/lib/image-capture";
import {
  draftFields,
  segmentPages,
  parseAnswer,
  mergeItems,
  splitItem,
  commitItems,
  type PdfInspection,
  type ImportItem,
  type ImportJob,
} from "@/lib/importer";
import type { BookPage } from "@/lib/data";
import type { SourceAsset } from "@/lib/materials";
const types = ["待整理", "单选题", "多选题", "判断题", "填空题", "解答题"];
const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(Error("原始文件读取失败。"));
    r.readAsDataURL(file);
  });
export function ImportCenter() {
  const { data, setData, notify } = useLab();
  const [file, setFile] = useState<File | null>(null),
    [role, setRole] = useState<"workbook" | "answer">("workbook");
  const [book, setBook] = useState(""),
    [chapter, setChapter] = useState(""),
    [subject, setSubject] = useState("教育综合");
  const [start, setStart] = useState(1),
    [end, setEnd] = useState(2),
    [printed, setPrinted] = useState(1),
    [columns, setColumns] = useState<1 | 2>(1),
    [type, setType] = useState("待整理"),
    [ocr, setOcr] = useState(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(""),
    [jobId, setJobId] = useState(""),
    [activeId, setActiveId] = useState("");
  const controller = useRef<AbortController | null>(null);
  const latestData = useRef(data);
  useEffect(() => {
    latestData.current = data;
  }, [data]);
  useEffect(() => () => controller.current?.abort(), []);
  const jobs = data.importJobs || [];
  const job = jobs.find((j) => j.id === jobId) || jobs.at(-1);
  const item =
    job?.items.find((i) => i.id === activeId) ||
    job?.items.find((i) => i.state === "draft");
  function patch(patch: Partial<ImportItem>) {
    if (!job || !item) return;
    setData((d) => ({
      ...d,
      importJobs: d.importJobs?.map((j) =>
        j.id === job.id
          ? {
              ...j,
              items: j.items.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      ...patch,
                      textReviewed: false,
                      scopeReviewed: false,
                    }
                  : i,
              ),
            }
          : j,
      ),
    }));
  }
  function review(key: "textReviewed" | "scopeReviewed", value: boolean) {
    if (!job || !item) return;
    setData((d) => ({
      ...d,
      importJobs: d.importJobs?.map((j) =>
        j.id === job.id
          ? {
              ...j,
              items: j.items.map((i) =>
                i.id === item.id ? { ...i, [key]: value } : i,
              ),
            }
          : j,
      ),
    }));
  }
  async function process(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!file || !book.trim() || !chapter.trim()) {
      setError("请选择 PDF，并填写统一书名及本次章节。");
      return;
    }
    if (file.size > 128 * 1024 * 1024) {
      setError("网站每份 PDF 暂限 128 MiB，请先拆成章节文件。");
      return;
    }
    if (
      !Number.isInteger(printed) ||
      printed < 1 ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1 ||
      end < start ||
      end - start >= 5
    ) {
      setError("每批只处理 1–5 页；原书起始页码须为正整数。");
      return;
    }
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      setProgress("正在读取指定页；扫描 PDF 将逐页识别…");
      const form = new FormData();
      form.append("file", file);
      form.append("start", String(start));
      form.append("end", String(end));
      form.append("ocr", ocr ? "1" : "0");
      const response = await fetch("/api/import-pdf", {
        method: "POST",
        body: form,
        signal: abort.signal,
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      const inspection = result as PdfInspection;
      const hash = [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        ),
      ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const sourceId = `pdf-${hash}-${role}-${book.trim()}`;
      const asset: SourceAsset = {
        id: sourceId,
        name: file.name,
        role,
        format: "pdf",
        book: book.trim(),
        chapter: chapter.trim(),
        subject,
        originalDataUrl:
          data.assets.find((a) => a.id === sourceId)?.originalDataUrl ||
          (await readFile(file)),
        size: file.size,
        created: new Date().toISOString(),
        state: "ready",
      };
      const pages: BookPage[] = inspection.pages.map((p) => ({
        id: `${sourceId}-page-${p.pdfPage}`,
        sourceId,
        book: book.trim(),
        chapter: chapter.trim(),
        subject,
        image: p.image,
        number: printed + p.pdfPage - start,
        pdfPage: p.pdfPage,
        pdfLabel: p.label,
      }));
      for (const page of pages) {
        const existing = data.pages.find((p) => p.id === page.id);
        if (existing && existing.number !== page.number)
          throw Error(
            `PDF 第 ${page.pdfPage} 页已登记为原书第 ${existing.number} 页，请使用一致的原书页码。`,
          );
      }
      const segments = segmentPages(inspection.pages, columns, type);
      const items: ImportItem[] = [];
      for (const [index, s] of segments.entries()) {
        if (abort.signal.aborted) throw Error("已取消导入。");
        setProgress(`正在保存题目区域 ${index + 1}/${segments.length}…`);
        const page = pages.find((p) => p.pdfPage === s.page.pdfPage)!;
        const cut = await cropOriginal(page.image, s.rect);
        const raw = s.lines.map((l) => l.text).join("\n");
        const fields = draftFields(raw, s.questionType, s.number);
        const answer = parseAnswer(raw);
        items.push({
          id: crypto.randomUUID(),
          role,
          book: book.trim(),
          chapter: chapter.trim(),
          subject,
          fields,
          raw,
          answer: role === "answer" ? answer.answer : "",
          explanation: role === "answer" ? answer.explanation : "",
          fragments: [
            {
              id: crypto.randomUUID(),
              regionId: crypto.randomUUID(),
              pageId: page.id,
              pageNumber: page.number,
              sourceId,
              book: book.trim(),
              chapter: chapter.trim(),
              subject,
              rect: s.rect,
              ...cut,
              originalFileUsed: false,
              ocr: {
                text: raw,
                confidence: null,
                engine:
                  s.page.method === "pdf-text"
                    ? "PDF text layer"
                    : "Tesseract page OCR",
                recognizedAt: new Date().toISOString(),
              },
            },
          ],
          warnings: [
            s.continuation
              ? "未检测到题号：可能是跨页续题、目录或页眉，请人工判断。"
              : "规则切题草稿，边界需要核对。",
            ...(s.questionType === "待整理"
              ? ["题型未知，请人工指定，不能根据选项个数推测单选或多选。"]
              : []),
          ],
          textReviewed: false,
          scopeReviewed: false,
          state: "draft",
        });
      }
      if (abort.signal.aborted) throw Error("已取消导入。");
      const nextJob: ImportJob = {
        id: crypto.randomUUID(),
        sourceId,
        name: file.name,
        book: book.trim(),
        chapter: chapter.trim(),
        created: new Date().toISOString(),
        pageCount: inspection.pageCount,
        toc: inspection.toc,
        items,
      };
      setData((d) => ({
        ...d,
        assets: d.assets.some((a) => a.id === sourceId)
          ? d.assets
          : [...d.assets, asset],
        pages: [
          ...d.pages,
          ...pages.filter((p) => !d.pages.some((old) => old.id === p.id)),
        ],
        importJobs: [...(d.importJobs || []), nextJob],
      }));
      setJobId(nextJob.id);
      setActiveId(items[0]?.id || "");
      notify(`生成 ${items.length} 个待校对条目；没有题目或答案自动入库。`);
    } catch (err) {
      setError(
        abort.signal.aborted
          ? "已取消本次处理；未保存不完整批次。"
          : err instanceof Error
            ? err.message
            : "导入失败。",
      );
    } finally {
      setBusy(false);
      setProgress("");
      controller.current = null;
    }
  }
  async function archive(ids: string[]) {
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      const previews: Record<string, string> = {};
      for (const i of job.items.filter(
        (i) => ids.includes(i.id) && i.role === "workbook",
      ))
        previews[i.id] = await mergePreview(i.fragments.map((f) => f.crop));
      // Validate against the latest complete workspace before a single atomic update.
      const next = commitItems(latestData.current, job.id, ids, previews);
      setData(next);
      notify("已核对条目已入库；答案匹配仍待人工确认。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "归档失败。");
    } finally {
      setBusy(false);
    }
  }
  function mergeNext() {
    if (!job || !item) return;
    const next = job.items[job.items.findIndex((i) => i.id === item.id) + 1];
    if (!next) return;
    try {
      const merged = mergeItems(item, next);
      setData((d) => ({
        ...d,
        importJobs: d.importJobs?.map((j) =>
          j.id === job.id
            ? {
                ...j,
                items: j.items
                  .filter((i) => i.id !== next.id)
                  .map((i) => (i.id === item.id ? merged : i)),
              }
            : j,
        ),
      }));
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <div className="import-center">
      <div className="import-heading">
        <div>
          <span className="import-caption">教辅资料导入中心</span>
          <h1>A book, made yours.</h1>
          <p>从原书到自己的题库。先选几页，逐题核对，再按章节整理。</p>
        </div>
        <MaterialWorkbench />
      </div>
      <section className="import-intro">
        <FileText size={32} strokeWidth={1} />
        <div>
          <strong>先处理一小段，把每一道题留完整。</strong>
          <p>
            每批选择 1–5 页。原始
            PDF、渲染页和题目区域独立保留。文字提取、切题及答案匹配均为建议，只有核对后的内容才能入库。
          </p>
        </div>
      </section>
      <form className="form-stack import-form" onSubmit={process}>
        <fieldset disabled={busy}>
          <legend>选择资料与章节</legend>
          <div className="import-fields">
            <label>
              PDF 资料
              <input
                aria-label="导入 PDF 资料"
                type="file"
                accept="application/pdf,.pdf"
                required
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            <label>
              资料类型
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                <option value="workbook">题本</option>
                <option value="answer">答案解析本</option>
              </select>
            </label>
            <label>
              统一习题册名称
              <input
                required
                value={book}
                onChange={(e) => setBook(e.target.value)}
                placeholder="题本与答案使用同一名称"
              />
            </label>
            <label>
              本次导入章节
              <input
                required
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                placeholder="如 第一章 教育及其发展"
              />
            </label>
            <label>
              学科
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label>
              本节起始题型
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {types.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              PDF 起始页
              <input
                type="number"
                min="1"
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
              />
            </label>
            <label>
              PDF 结束页
              <input
                type="number"
                min="1"
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
              />
            </label>
            <label>
              对应原书起始页码
              <input
                type="number"
                min="1"
                value={printed}
                onChange={(e) => setPrinted(Number(e.target.value))}
              />
            </label>
            <label>
              页面排版
              <select
                value={columns}
                onChange={(e) => setColumns(Number(e.target.value) as 1 | 2)}
              >
                <option value="1">单栏</option>
                <option value="2">双栏（先左后右）</option>
              </select>
            </label>
          </div>
          <label className="review-check">
            <input
              type="checkbox"
              checked={ocr}
              onChange={(e) => setOcr(e.target.checked)}
            />
            无可用文字层时，对所选扫描页执行 OCR
          </label>
          <button className="button primary" type="submit">
            <Upload size={16} />
            分析所选页并生成草稿
          </button>
        </fieldset>
      </form>
      {busy && (
        <p role="status">
          {progress || "正在保存…"}{" "}
          <button
            className="button"
            onClick={() => controller.current?.abort()}
            disabled={!controller.current}
          >
            取消处理
          </button>
        </p>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {jobs.length > 0 && (
        <label className="import-history">
          继续校对章节
          <select
            aria-label="导入批次"
            value={job?.id}
            onChange={(e) => {
              setJobId(e.target.value);
              setActiveId("");
            }}
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.book} / {j.chapter} / {j.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {job && (
        <>
          <div className="import-summary">
            <p>
              原始文档共 {job.pageCount} 页，本次草稿 {job.items.length}{" "}
              条，已入库{" "}
              {job.items.filter((i) => i.state === "archived").length} 条。
            </p>
            <details>
              <summary>文档目录与来源</summary>
              <p>
                PDF 自带目录 {job.toc.length}{" "}
                项；无内嵌目录时请手动指定章节。纸面页码由你指定，PDF
                页索引独立保留。
              </p>
              {job.toc.map((t, i) => (
                <p key={i}>
                  {t.title} — PDF 第 {t.pdfPage} 页
                </p>
              ))}
              <a
                className="button"
                href={
                  data.assets.find((a) => a.id === job.sourceId)
                    ?.originalDataUrl
                }
                download={job.name}
              >
                下载原始 PDF
              </a>
            </details>
            <button
              className="button primary"
              disabled={
                busy ||
                !job.items.some(
                  (i) =>
                    i.state === "draft" && i.textReviewed && i.scopeReviewed,
                )
              }
              onClick={() =>
                archive(
                  job.items
                    .filter(
                      (i) =>
                        i.state === "draft" &&
                        i.textReviewed &&
                        i.scopeReviewed,
                    )
                    .map((i) => i.id),
                )
              }
            >
              <Check size={16} />
              批量归档已核对条目
            </button>
          </div>
          <div className="import-workspace">
            <nav className="import-items" aria-label="切题草稿">
              {job.items.map((i, index) => (
                <button
                  key={i.id}
                  className={item?.id === i.id ? "selected" : ""}
                  onClick={() => setActiveId(i.id)}
                >
                  <small>
                    {i.state === "archived"
                      ? "已入库"
                      : i.state === "rejected"
                        ? "已排除"
                        : i.textReviewed && i.scopeReviewed
                          ? "已核对"
                          : "待核对"}
                  </small>
                  <strong>
                    {i.fields.questionNumber
                      ? `第 ${i.fields.questionNumber} 题`
                      : `片段 ${index + 1}`}
                  </strong>
                  <span>
                    {i.fields.questionType} / 原书{" "}
                    {i.fragments.map((f) => f.pageNumber).join("、")} 页
                  </span>
                </button>
              ))}
            </nav>
            {item ? (
              <section className="import-editor" key={item.id}>
                <fieldset disabled={busy || item.state !== "draft"}>
                  <legend>
                    {item.role === "answer" ? "答案解析校对" : "题目校对"}
                  </legend>
                  <div className="import-evidence">
                    {item.fragments.map((f, index) => (
                      <div key={f.id}>
                        <a href={f.crop} target="_blank" rel="noreferrer">
                          <img src={f.crop} alt={`待核对片段 ${index + 1}`} />
                        </a>
                        <p>
                          原书第 {f.pageNumber} 页 · PDF 第{" "}
                          {data.pages.find((p) => p.id === f.pageId)?.pdfPage}{" "}
                          页 · x {f.pixels.x}, y {f.pixels.y}, {f.pixels.width}{" "}
                          × {f.pixels.height}
                        </p>
                        <Link
                          href={`/reader?page=${encodeURIComponent(f.pageId)}`}
                          className="button"
                        >
                          回原书框选修正
                        </Link>
                        <details>
                          <summary>微调切题边界</summary>
                          <BoundsEditor
                            fragment={f}
                            disabled={busy || item.state !== "draft"}
                            onApply={async (rect) => {
                              setError("");
                              try {
                                const page = data.pages.find(
                                  (p) => p.id === f.pageId,
                                );
                                if (!page) throw Error("原书页不存在。");
                                const cut = await cropOriginal(
                                  page.image,
                                  rect,
                                );
                                patch({
                                  fragments: item.fragments.map((part) =>
                                    part.id === f.id
                                      ? { ...part, rect, ...cut }
                                      : part,
                                  ),
                                });
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          />
                        </details>
                      </div>
                    ))}
                  </div>
                  {item.warnings.map((w, index) => (
                    <p className="import-warning" key={index}>
                      {w}
                    </p>
                  ))}
                  <div className="form-stack">
                    <div className="import-fields">
                      <label>
                        条目章节
                        <input
                          value={item.chapter}
                          onChange={(e) => patch({ chapter: e.target.value })}
                        />
                      </label>
                      <label>
                        题号
                        <input
                          value={item.fields.questionNumber}
                          onChange={(e) =>
                            patch({
                              fields: {
                                ...item.fields,
                                questionNumber: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        题型
                        <select
                          value={item.fields.questionType}
                          onChange={(e) =>
                            patch({
                              fields: {
                                ...item.fields,
                                questionType: e.target.value,
                              },
                            })
                          }
                        >
                          {types.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {item.role === "workbook" ? (
                      <>
                        <label>
                          题目摘要
                          <input
                            value={item.fields.title}
                            onChange={(e) =>
                              patch({
                                fields: {
                                  ...item.fields,
                                  title: e.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          题干
                          <textarea
                            rows={5}
                            value={item.fields.stem}
                            onChange={(e) =>
                              patch({
                                fields: {
                                  ...item.fields,
                                  stem: e.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          选项（每行一个，如 A. 内容）
                          <textarea
                            rows={5}
                            value={item.fields.optionsText}
                            onChange={(e) =>
                              patch({
                                fields: {
                                  ...item.fields,
                                  optionsText: e.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          知识点
                          <input
                            value={item.fields.topic}
                            onChange={(e) =>
                              patch({
                                fields: {
                                  ...item.fields,
                                  topic: e.target.value,
                                },
                              })
                            }
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <label>
                          标准答案
                          <textarea
                            rows={2}
                            value={item.answer}
                            onChange={(e) => patch({ answer: e.target.value })}
                          />
                        </label>
                        <label>
                          详细解析
                          <textarea
                            rows={7}
                            value={item.explanation}
                            onChange={(e) =>
                              patch({ explanation: e.target.value })
                            }
                          />
                        </label>
                      </>
                    )}
                    <details className="ocr-raw">
                      <summary>查看原始提取文字</summary>
                      <pre>{item.raw}</pre>
                    </details>
                    <label className="review-check">
                      <input
                        type="checkbox"
                        checked={item.textReviewed}
                        onChange={(e) =>
                          review("textReviewed", e.target.checked)
                        }
                      />
                      已核对文字、选项或标准答案与解析
                    </label>
                    <label className="review-check">
                      <input
                        type="checkbox"
                        checked={item.scopeReviewed}
                        onChange={(e) =>
                          review("scopeReviewed", e.target.checked)
                        }
                      />
                      已核对章节、题号、题型和所有页面片段的完整性
                    </label>
                    <div className="import-actions">
                      <button
                        className="button primary"
                        disabled={!item.textReviewed || !item.scopeReviewed}
                        onClick={() => archive([item.id])}
                      >
                        确认入库此条目
                      </button>
                      <button
                        className="button"
                        disabled={
                          job.items.findIndex((i) => i.id === item.id) ===
                          job.items.length - 1
                        }
                        onClick={mergeNext}
                      >
                        <ArrowDown size={15} />
                        与下一片段合并
                      </button>
                      {item.fragments.length > 1 && (
                        <button
                          className="button"
                          onClick={() => {
                            try {
                              const parts = splitItem(item);
                              setData((d) => ({
                                ...d,
                                importJobs: d.importJobs?.map((j) =>
                                  j.id === job.id
                                    ? {
                                        ...j,
                                        items: j.items.flatMap((i) =>
                                          i.id === item.id ? parts : [i],
                                        ),
                                      }
                                    : j,
                                ),
                              }));
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          拆开所有片段重新校对
                        </button>
                      )}
                      <button
                        className="button"
                        onClick={() => patch({ state: "rejected" })}
                      >
                        <X size={15} />
                        排除此片段
                      </button>
                    </div>
                  </div>
                </fieldset>
                {item.state === "rejected" && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => patch({ state: "draft" })}
                  >
                    恢复为待校对草稿
                  </button>
                )}
              </section>
            ) : (
              <p className="import-empty">
                本批草稿已处理。选择条目可查看记录，或导入下一章节。
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
function BoundsEditor({
  fragment,
  disabled,
  onApply,
}: {
  fragment: ImportItem["fragments"][number];
  disabled: boolean;
  onApply: (rect: ImportItem["fragments"][number]["rect"]) => Promise<void>;
}) {
  const [rect, setRect] = useState(fragment.rect);
  const [working, setWorking] = useState(false);
  return (
    <div className="import-bounds">
      {(["x", "y", "w", "h"] as const).map((key) => (
        <label key={key}>
          {key}（0–1）
          <input
            aria-label={`边界 ${key}`}
            type="number"
            step="0.001"
            min="0"
            max="1"
            disabled={disabled || working}
            value={rect[key]}
            onChange={(e) =>
              setRect((r) => ({ ...r, [key]: Number(e.target.value) }))
            }
          />
        </label>
      ))}
      <button
        className="button"
        disabled={disabled || working}
        onClick={async () => {
          setWorking(true);
          try {
            await onApply(rect);
          } finally {
            setWorking(false);
          }
        }}
      >
        应用边界并重新核对
      </button>
    </div>
  );
}
