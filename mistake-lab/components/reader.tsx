"use client";
import { useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Upload,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  ScanLine,
  X,
  Check,
  ArrowUpRight,
  BookOpen,
  MousePointer2,
  RotateCcw,
} from "lucide-react";
import { useLab } from "./store";
import { Modal, Empty } from "./ui";
import { MaterialWorkbench } from "./material-workbench";
import { CaptureReview } from "./capture-review";
import { appendFragment, unchecked, type CaptureFragment } from "@/lib/capture";
import { cropOriginal } from "@/lib/image-capture";
import {
  archiveFile,
  parseOptions,
  type QuestionRegion,
  type SourceAsset,
} from "@/lib/materials";
import { today, type Rect, type BookPage, type Question } from "@/lib/data";
const clamp = (n: number) => Math.max(0, Math.min(1, n));
async function imageFile(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error(`${file.name}：仅支持 JPG、PNG、WebP 图片。`);
  if (file.size > 10 * 1024 * 1024)
    throw Error(`${file.name}：图片不能超过 10 MB。`);
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(Error("图片无法解码，请更换文件。"));
      i.src = url;
    });
    const scale = Math.min(
      1,
      2000 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("当前浏览器不支持图片处理。");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function Reader() {
  const params = useSearchParams();
  const initialPage = params.get("page") || "sample-1";
  return <ReaderWorkspace key={initialPage} initialPage={initialPage} />;
}
function ReaderWorkspace({ initialPage }: { initialPage: string }) {
  const { data, setData, notify } = useLab();
  const [pageId, setPageId] = useState(initialPage);
  const [zoom, setZoom] = useState(100);
  const [mode, setMode] = useState(true);
  const [rect, setRect] = useState<Rect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const paper = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [upload, setUpload] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [book, setBook] = useState("我的习题册");
  const [subject, setSubject] = useState("数学");
  const [chapter, setChapter] = useState("第一章");
  const [startingPage, setStartingPage] = useState(1);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cardView, setCardView] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [pageAnswers, setPageAnswers] = useState(false);
  const page = data.pages.find((p) => p.id === pageId) || data.pages[0];
  const pageRole = (sourceId?: string) =>
    data.assets.find((a) => a.id === sourceId)?.role || "workbook";
  const visiblePages = data.pages.filter(
    (p) =>
      p.book === page?.book &&
      pageRole(p.sourceId) === pageRole(page?.sourceId),
  );
  const index = visiblePages.findIndex((p) => p.id === page?.id);
  const pageRegions = data.regions.filter((r) => r.pageId === page?.id);
  const linked = data.questions.filter(
    (q) =>
      q.pageId === page?.id || q.fragments?.some((f) => f.pageId === page?.id),
  );
  function position(e: PointerEvent) {
    const bounds = paper.current!.getBoundingClientRect();
    return {
      x: clamp((e.clientX - bounds.left) / bounds.width),
      y: clamp((e.clientY - bounds.top) / bounds.height),
    };
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    if (!mode || e.button !== 0) return;
    e.preventDefault();
    const p = position(e);
    start.current = p;
    setRect(null);
    setSelectedRegion(null);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const p = position(e),
      s = start.current;
    setRect({
      x: Math.min(p.x, s.x),
      y: Math.min(p.y, s.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const p = position(e),
      s = start.current;
    const r = {
      x: Math.min(p.x, s.x),
      y: Math.min(p.y, s.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    };
    setRect(
      r.w * (image.current?.naturalWidth || 0) >= 8 &&
        r.h * (image.current?.naturalHeight || 0) >= 8
        ? r
        : null,
    );
    start.current = null;
  }
  function changePage(id: string) {
    setPageId(id);
    setCardView(false);
    setPageAnswers(false);
    setSelectedRegion(null);
    setRect(null);
    start.current = null;
  }
  async function uploadFiles(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) {
      setUploadError("请先选择至少一张书页图片。");
      return;
    }
    if (files.length > 20) {
      setUploadError("每次最多上传 20 张图片。");
      return;
    }
    setBusy(true);
    setUploadError("");
    try {
      if (!book.trim() || !chapter.trim()) throw Error("请填写习题册和章节。");
      if (!Number.isInteger(startingPage) || startingPage < 1)
        throw Error("请填写有效的原书起始页码。");
      if (
        data.pages.some(
          (p) =>
            p.book === book.trim() &&
            p.number >= startingPage &&
            p.number < startingPage + files.length,
        )
      )
        throw Error("该习题册的页码已存在，请检查书名或起始页码。");
      const originals = await Promise.all(files.map(archiveFile));
      const images = await Promise.all(files.map(imageFile));
      const batchId = crypto.randomUUID();
      const assets: SourceAsset[] = files.map((file, i) => ({
        id: crypto.randomUUID(),
        role: "workbook",
        format: "image",
        name: file.name,
        book: book.trim(),
        chapter: chapter.trim(),
        subject,
        originalDataUrl: originals[i],
        size: file.size,
        created: new Date().toISOString(),
        state: "ready",
        batchId,
      }));
      const pages: BookPage[] = images.map((src, i) => ({
        id: crypto.randomUUID(),
        book: book.trim(),
        chapter: chapter.trim(),
        subject,
        image: src,
        sourceId: assets[i].id,
        number: startingPage + i,
      }));
      setData((d) => ({
        ...d,
        pages: [...d.pages, ...pages],
        assets: [...d.assets, ...assets],
        batches: [
          ...d.batches,
          {
            id: batchId,
            role: "workbook",
            name: `手动上传 ${pages.length} 张书页`,
            state: "completed",
            sourceIds: assets.map((a) => a.id),
            created: new Date().toISOString(),
          },
        ],
      }));
      changePage(pages[0].id);
      setUpload(false);
      setFiles([]);
      notify(`已导入 ${pages.length} 张书页，可以开始框选题目。`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上传失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  async function beginAdd(region?: QuestionRegion, reviewImmediately = true) {
    if (!page || captureBusy) return;
    const chosen = region?.rect || rect;
    if (!chosen) return;
    setCaptureBusy(true);
    try {
      const source = data.assets.find(
        (a) => a.id === page.sourceId && a.format === "image",
      );
      const cropped = await cropOriginal(
        source?.originalDataUrl || page.image,
        chosen,
      );
      const fragment: CaptureFragment = {
        id: crypto.randomUUID(),
        regionId: region?.id || crypto.randomUUID(),
        pageId: page.id,
        pageNumber: page.number,
        sourceId: page.sourceId,
        book: page.book,
        chapter: page.chapter,
        subject: page.subject,
        rect: { ...chosen },
        originalFileUsed: !!source,
        ...cropped,
      };
      const draft = appendFragment(data.captureDraft, fragment, {
        title: region?.structuredText || "",
        questionNumber: region?.questionNumber || "",
        questionType: region?.questionType || "待整理",
        stem: region?.structuredText || "",
        optionsText: "",
        topic: region?.topic || "",
        note: "",
      });
      setData((d) => ({ ...d, captureDraft: draft }));
      setRect(null);
      setSelectedRegion(null);
      if (reviewImmediately) setAdding(true);
      notify("已保存原图片段与坐标，尚未归档；可以继续采集下一页。");
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法采集此区域。");
    } finally {
      setCaptureBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading compact">
        <div>
          <div className="eyebrow">From paper to possibility</div>
          <h1>
            Book Reader<span className="title-dot">.</span>
          </h1>
          <p>留住原书里的思路，把一道题认真收藏。</p>
        </div>
        <div className="button-group reader-actions">
          <MaterialWorkbench />
          <button className="button primary" onClick={() => setUpload(true)}>
            <Upload size={16} />
            上传书页
          </button>
        </div>
      </div>
      {data.captureDraft && (
        <section className="capture-tray" aria-label="跨页采集篮">
          <div>
            <h2>
              这一道题的片段 <span>{data.captureDraft.fragments.length}/5</span>
            </h2>
            <p>
              切换原书页继续框选，按阅读顺序合并；草稿已本地保留，尚未归档。
            </p>
          </div>
          <div className="tray-fragments">
            {data.captureDraft.fragments.map((f, i) => (
              <div key={f.id}>
                <button
                  type="button"
                  aria-label={`定位片段 ${i + 1}`}
                  onClick={() => changePage(f.pageId)}
                >
                  <img
                    src={f.crop}
                    alt={`第 ${f.pageNumber} 页片段 ${i + 1}`}
                  />
                  <span>
                    {i + 1} · 第 {f.pageNumber} 页
                  </span>
                </button>
                <button
                  className="icon-button"
                  aria-label={`移除片段 ${i + 1}`}
                  onClick={() =>
                    setData((d) => {
                      if (!d.captureDraft) return d;
                      const fragments = d.captureDraft.fragments.filter(
                        (x) => x.id !== f.id,
                      );
                      return {
                        ...d,
                        captureDraft: fragments.length
                          ? {
                              ...d.captureDraft,
                              fragments,
                              review: unchecked(),
                            }
                          : undefined,
                      };
                    })
                  }
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <button className="button primary" onClick={() => setAdding(true)}>
            合并核对并归档
          </button>
        </section>
      )}
      <div className="book-context">
        <label>
          习题册
          <select
            aria-label="阅读器习题册"
            value={page?.book || ""}
            onChange={(e) => {
              const p = data.pages.find((p) => p.book === e.target.value);
              if (p) changePage(p.id);
            }}
          >
            {[...new Set(data.pages.map((p) => p.book))].map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          章节
          <select
            aria-label="阅读器章节"
            value={page?.chapter || ""}
            onChange={(e) => {
              const p = visiblePages.find((p) => p.chapter === e.target.value);
              if (p) changePage(p.id);
            }}
          >
            {[...new Set(visiblePages.map((p) => p.chapter))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          原书页码
          <input
            aria-label="原书页码"
            type="number"
            min={1}
            value={page?.number || 1}
            onChange={(e) => {
              const number = Number(e.target.value);
              if (!Number.isInteger(number) || number < 1 || !page) return;
              setData((d) => ({
                ...d,
                pages: d.pages.map((p) =>
                  p.id === page.id ? { ...p, number } : p,
                ),
                questions: d.questions.map((q) => ({
                  ...q,
                  fragments: q.fragments?.map((f) =>
                    f.pageId === page.id ? { ...f, pageNumber: number } : f,
                  ),
                })),
                captureDraft: d.captureDraft
                  ? {
                      ...d.captureDraft,
                      review: unchecked(),
                      fragments: d.captureDraft.fragments.map((f) =>
                        f.pageId === page.id ? { ...f, pageNumber: number } : f,
                      ),
                    }
                  : undefined,
              }));
            }}
          />
        </label>
        <span className="book-context-count">
          本书 {visiblePages.length} 页 · 已收集{" "}
          {data.questions.filter((q) => q.book === page?.book).length} 道
        </span>
        <Link
          className="text-link"
          href={`/library?book=${encodeURIComponent(page?.book || "")}`}
        >
          管理本书错题 <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="reader-workspace">
        <aside className="book-rail">
          <div className="book-rail-heading">
            <BookOpen size={16} />
            <strong>我的原书</strong>
            <span>{data.pages.length} 页</span>
          </div>
          <div className="book-pages">
            {visiblePages.map((p, i) => (
              <button
                key={p.id}
                className={`page-thumbnail ${page?.id === p.id ? "active" : ""}`}
                onClick={() => changePage(p.id)}
                aria-label={`${p.book} 第 ${p.number} 页`}
              >
                <span className="thumbnail-image">
                  <img src={p.image} alt="" />
                  <span>{String(i + 1).padStart(2, "0")}</span>
                </span>
                <strong>{p.book}</strong>
                <small>
                  第 {p.number} 页 · {p.subject}
                </small>
              </button>
            ))}
          </div>
          <button className="rail-upload" onClick={() => setUpload(true)}>
            <Plus size={18} />
            添加书页
          </button>
        </aside>
        <section className="reader-center" aria-label="原书阅读工作台">
          <div className="reader-toolbar">
            <div className="segmented">
              <button
                className={!cardView ? "active" : ""}
                onClick={() => setCardView(false)}
              >
                原书视图
              </button>
              <button
                className={cardView ? "active" : ""}
                onClick={() => setCardView(true)}
              >
                错题卡 <span>{linked.length}</span>
              </button>
            </div>
            <button
              className="text-link page-answer-toggle"
              aria-pressed={pageAnswers}
              onClick={() => setPageAnswers((v) => !v)}
            >
              {pageAnswers ? "隐藏本页解析" : "查看本页解析"}
            </button>
            <div className="zoom-tools">
              <button
                className="icon-button"
                aria-label="缩小书页"
                disabled={zoom <= 60 || cardView}
                onClick={() => setZoom((z) => Math.max(60, z - 10))}
              >
                <Minus size={16} />
              </button>
              <button
                className="zoom-reset"
                aria-label="重置缩放"
                disabled={cardView}
                onClick={() => setZoom(100)}
              >
                {zoom}%
              </button>
              <button
                className="icon-button"
                aria-label="放大书页"
                disabled={zoom >= 180 || cardView}
                onClick={() => setZoom((z) => Math.min(180, z + 10))}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          {pageAnswers && (
            <div className="page-answers">
              <h3>本页答案与解析</h3>
              <p>只展示已保存或人工确认的内容，不自动套用待审核候选。</p>
              {linked.length ? (
                linked.map((q) => (
                  <article key={q.id}>
                    <strong>
                      第 {q.questionNumber || "未编号"} 题 · {q.title}
                    </strong>
                    <p>
                      {q.answer || "未补充答案，点击「资料与答案」录入并匹配。"}
                    </p>
                    {q.explanation && <p>{q.explanation}</p>}
                    <span className="tiny muted">
                      {q.answerId ? "已人工确认关联" : "手动 / 演示答案"}
                    </span>
                  </article>
                ))
              ) : (
                <p>本页尚未收集题目。先逐题收集，再关联解析。</p>
              )}
            </div>
          )}
          {!page ? (
            <Empty
              title="上传你的第一张书页"
              description="支持 JPG、PNG、WebP，每张不超过 10 MB。"
              action={
                <button
                  className="button primary"
                  onClick={() => setUpload(true)}
                >
                  上传书页
                </button>
              }
            />
          ) : cardView ? (
            <div className="reader-cards">
              {linked.length ? (
                linked.map((q) => <ReaderCard key={q.id} q={q} />)
              ) : (
                <Empty
                  title="这一页还没有收集错题"
                  description="切换到原书视图，框选一道题试试。"
                  action={
                    <button
                      className="button secondary"
                      onClick={() => setCardView(false)}
                    >
                      返回原书
                    </button>
                  }
                />
              )}
            </div>
          ) : (
            <>
              <div className="selection-instruction">
                <ScanLine size={15} />
                <span>
                  {mode
                    ? "在书页上按住并拖动，框选一道题目"
                    : "浏览模式：可滚动查看完整书页"}
                </span>
                <button onClick={() => setMode((m) => !m)}>
                  {mode ? "切换浏览" : "切换框选"}
                </button>
              </div>
              <div className="paper-viewport">
                <div className="paper-width" style={{ width: `${zoom}%` }}>
                  <div
                    ref={paper}
                    className={`paper ${mode ? "selecting" : ""}`}
                    style={{ touchAction: mode ? "none" : "auto" }}
                    onPointerDown={down}
                    onPointerMove={move}
                    onPointerUp={up}
                    onPointerCancel={() => {
                      start.current = null;
                      setRect(null);
                    }}
                    aria-label="书页框选区域"
                  >
                    <img
                      ref={image}
                      src={page.image}
                      draggable={false}
                      alt={`${page.book} 第 ${page.number} 页，拖动框选题目`}
                    />
                    {pageRegions.map((region) => {
                      const collected = linked.find(
                        (q) =>
                          q.regionId === region.id ||
                          q.fragments?.some((f) => f.regionId === region.id),
                      );
                      return (
                        <div
                          key={region.id}
                          className={`question-region ${collected ? "is-collected" : ""}`}
                          style={{
                            left: `${region.rect.x * 100}%`,
                            top: `${region.rect.y * 100}%`,
                            width: `${region.rect.w * 100}%`,
                            height: `${region.rect.h * 100}%`,
                          }}
                        >
                          <span className="region-number">
                            {region.questionNumber || "未编号"}
                          </span>
                          {collected ? (
                            <Link
                              className="region-action"
                              href={`/question?id=${collected.id}`}
                              onPointerDown={(e) => e.stopPropagation()}
                              aria-label={`查看第 ${region.questionNumber} 题`}
                            >
                              已收集 · 查看 <ArrowUpRight size={12} />
                            </Link>
                          ) : (
                            <button
                              className="region-action"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => beginAdd(region)}
                              aria-label={`收集第 ${region.questionNumber} 题`}
                            >
                              <Plus size={12} />
                              加入错题本
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {rect && (
                      <div
                        className="selection-box"
                        style={{
                          left: `${rect.x * 100}%`,
                          top: `${rect.y * 100}%`,
                          width: `${rect.w * 100}%`,
                          height: `${rect.h * 100}%`,
                        }}
                      >
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="reader-page-controls">
                <button
                  className="icon-button"
                  aria-label="上一页"
                  disabled={index <= 0}
                  onClick={() => changePage(visiblePages[index - 1].id)}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  第 {index + 1} / {visiblePages.length} 页
                </span>
                <button
                  className="icon-button"
                  aria-label="下一页"
                  disabled={index >= visiblePages.length - 1}
                  onClick={() => changePage(visiblePages[index + 1].id)}
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  className="text-link keyboard-select"
                  onClick={() => {
                    setSelectedRegion(null);
                    setRect({ x: 0.08, y: 0.23, w: 0.84, h: 0.25 });
                  }}
                >
                  键盘框选
                </button>
              </div>
            </>
          )}
        </section>
        <aside className="capture-panel">
          <div className="capture-heading">
            <span className="capture-symbol">
              <ScanLine size={21} />
            </span>
            <h2>收集一个新发现</h2>
            <p>
              纸上的一道题，
              <br />
              也是知识拼图的一小块。
            </p>
          </div>
          <div className="capture-steps">
            <span className={page ? "done" : ""}>
              <b>1</b>打开一张书页 <Check size={13} />
            </span>
            <span className={rect ? "done" : ""}>
              <b>2</b>框选目标题目 {rect && <Check size={13} />}
            </span>
            <span>
              <b>3</b>补充信息，加入错题本
            </span>
          </div>
          {rect ? (
            <div className="capture-ready">
              <span className="pill">
                <Check size={13} />
                已选中区域
              </span>
              <p>
                宽 {Math.round(rect.w * 100)}% · 高 {Math.round(rect.h * 100)}%
              </p>
              <details>
                <summary>微调框选范围</summary>
                {(["x", "y", "w", "h"] as const).map((key, i) => (
                  <label key={key}>
                    {["左边距", "上边距", "宽度", "高度"][i]}
                    <input
                      type="range"
                      aria-label={
                        ["左边距", "上边距", "框选宽度", "框选高度"][i]
                      }
                      min={key === "w" || key === "h" ? 0.03 : 0}
                      max={
                        key === "w"
                          ? 1 - rect.x
                          : key === "h"
                            ? 1 - rect.y
                            : key === "x"
                              ? 1 - rect.w
                              : 1 - rect.h
                      }
                      step="0.01"
                      value={rect[key]}
                      onChange={(e) =>
                        setRect((r) =>
                          r ? { ...r, [key]: Number(e.target.value) } : r,
                        )
                      }
                    />
                  </label>
                ))}
              </details>
              <button
                className="button primary full"
                onClick={() => beginAdd()}
                disabled={captureBusy}
              >
                <Plus size={16} />
                {captureBusy ? "正在裁剪原图…" : "识别并核对题目"}
              </button>
              <button
                className="button secondary full"
                disabled={captureBusy}
                onClick={() => beginAdd(undefined, false)}
              >
                保存片段，继续下一页
              </button>
              <button
                className="button ghost full"
                onClick={() => setRect(null)}
              >
                <RotateCcw size={14} />
                重新框选
              </button>
            </div>
          ) : (
            <div className="capture-placeholder">
              <MousePointer2 size={26} strokeWidth={1} />
              <span>等待你框选一道题</span>
              <small>支持鼠标与触屏拖动</small>
            </div>
          )}
          <div className="source-info">
            <span>当前书页</span>
            <strong>{page?.book || "尚未上传"}</strong>
            <p>{page?.chapter}</p>
            {pageRegions.some((r) => r.origin === "demo") && (
              <small>示例预设题区，不是 OCR 识别结果。</small>
            )}
            <small>题目将自动关联原书与页码。</small>
          </div>
          <p className="privacy-note">
            原书与采集草稿保存在浏览器。OCR 仅按需将裁剪片段临时发送到本站处理。
          </p>
        </aside>
      </div>
      <Modal
        open={upload}
        onOpenChange={(v) => {
          if (!busy) setUpload(v);
        }}
        title="把书页带进实验室"
        description="选择一张或多张图片，按选择顺序添加。每张最多 10 MB，一次最多 20 张。"
      >
        <form className="form-stack" onSubmit={uploadFiles}>
          <label className="upload-drop">
            <Upload size={27} />
            <strong>
              {files.length
                ? `已选择 ${files.length} 张图片`
                : "选择纸质习题册图片"}
            </strong>
            <span>JPG / PNG / WebP</span>
            <input
              aria-label="选择书页图片"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => {
                setFiles(Array.from(e.target.files || []));
                setUploadError("");
              }}
            />
          </label>
          <label>
            习题册名称
            <input
              required
              maxLength={80}
              value={book}
              onChange={(e) => setBook(e.target.value)}
            />
          </label>
          <div className="form-row">
            <label>
              学科
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                {[
                  "数学",
                  "语文",
                  "英语",
                  "物理",
                  "化学",
                  "生物",
                  "政治",
                  "历史",
                  "地理",
                  "其他",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              章节
              <input
                required
                maxLength={80}
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
              />
            </label>
          </div>
          <label>
            原书起始页码
            <input
              aria-label="原书起始页码"
              type="number"
              min={1}
              required
              value={startingPage}
              onChange={(e) => setStartingPage(Number(e.target.value))}
            />
          </label>
          {uploadError && (
            <p role="alert" className="form-error">
              {uploadError}
            </p>
          )}
          <button className="button primary full" disabled={busy}>
            {busy ? "正在处理图片…" : "导入并开始阅读"}{" "}
            <ArrowUpRight size={16} />
          </button>
        </form>
      </Modal>
      <CaptureReview open={adding} onOpenChange={setAdding} />
    </>
  );
}
function ReaderCard({ q }: { q: Question }) {
  const [show, setShow] = useState(false);
  return (
    <article className="reader-question-card">
      <div className="card-meta">
        <span className="subject-label">{q.topic}</span>
        <Link className="text-link" href={`/question?id=${q.id}`}>
          查看详情 <ArrowUpRight size={14} />
        </Link>
      </div>
      {q.crop && (
        <img className="cropped-question" src={q.crop} alt="框选题目图片" />
      )}
      <h3>{q.title}</h3>
      <button className="button secondary" onClick={() => setShow((s) => !s)}>
        {show ? "隐藏答案" : "显示答案"}
      </button>
      {show && (
        <div className="answer-block">
          {q.answer || "尚未填写答案，可在错题详情中补充。"}
        </div>
      )}
    </article>
  );
}
