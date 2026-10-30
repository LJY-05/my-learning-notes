import type { BookPage, LabData, Rect, Question } from "./data";
import { today } from "./data";
import type { CaptureFields, CaptureFragment } from "./capture";
import { parseOcrDraft, validateCapture } from "./capture";
import {
  canonicalType,
  parseOptions,
  draftMatches,
  compatible,
  type AnswerEntry,
} from "./materials";
export type PdfLine = { text: string; rect: Rect };
export type PdfPage = {
  pdfPage: number;
  label: string;
  width: number;
  height: number;
  image: string;
  lines: PdfLine[];
  method: "pdf-text" | "ocr";
};
export type PdfInspection = {
  pageCount: number;
  toc: { level: number; title: string; pdfPage: number }[];
  pages: PdfPage[];
};
export type ImportItem = {
  id: string;
  role: "workbook" | "answer";
  book: string;
  chapter: string;
  subject: string;
  fields: CaptureFields;
  raw: string;
  answer: string;
  explanation: string;
  fragments: CaptureFragment[];
  warnings: string[];
  textReviewed: boolean;
  scopeReviewed: boolean;
  state: "draft" | "archived" | "rejected";
};
export type ImportJob = {
  id: string;
  sourceId: string;
  name: string;
  book: string;
  chapter: string;
  created: string;
  pageCount: number;
  toc: PdfInspection["toc"];
  items: ImportItem[];
};
export type Segment = {
  page: PdfPage;
  lines: PdfLine[];
  rect: Rect;
  number: string;
  questionType: string;
  continuation: boolean;
};
const numberOf = (text: string) =>
  text.normalize("NFKC").match(/^\s*(\d{1,4})\s*[.、)]\s*(?!\d)/)?.[1] || "";
function heading(text: string) {
  if (
    !/^(?:[一二三四五六七八九十]+[、.．\s])?\s*(?:单项选择题|多项选择题|单选题|多选题|判断题|填空题)/.test(
      text.trim(),
    )
  )
    return "";
  return canonicalType(
    text
      .replace(/^[一二三四五六七八九十]+[、.．\s]+/, "")
      .split(/[（(：:]/)[0]
      .trim(),
  );
}
function union(lines: PdfLine[]): Rect {
  const left = Math.max(0, Math.min(...lines.map((l) => l.rect.x)) - 0.005),
    top = Math.max(0, Math.min(...lines.map((l) => l.rect.y)) - 0.003);
  const right = Math.min(
      1,
      Math.max(...lines.map((l) => l.rect.x + l.rect.w)) + 0.005,
    ),
    bottom = Math.min(
      1,
      Math.max(...lines.map((l) => l.rect.y + l.rect.h)) + 0.003,
    );
  return { x: left, y: top, w: right - left, h: bottom - top };
}
/** Conservative rule proposals. Explicit column mode; no implied semantic correctness. */
export function segmentPages(
  pages: PdfPage[],
  columns: 1 | 2,
  initialType: string,
): Segment[] {
  const result: Segment[] = [];
  let type = canonicalType(initialType) || "待整理";
  for (const page of pages) {
    const lists =
      columns === 1
        ? [page.lines]
        : [
            page.lines.filter((l) => l.rect.x < 0.5),
            page.lines.filter((l) => l.rect.x >= 0.5),
          ];
    for (const list of lists) {
      let current: PdfLine[] = [];
      let number = "";
      let currentType = type;
      const flush = () => {
        if (current.length)
          result.push({
            page,
            lines: current,
            rect: union(current),
            number,
            questionType: currentType,
            continuation: !number,
          });
        current = [];
        number = "";
      };
      for (const line of [...list].sort(
        (a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x,
      )) {
        const nextType = heading(line.text);
        if (nextType) {
          flush();
          type = nextType;
          currentType = type;
          continue;
        }
        // Ignore isolated page counters; original page image retains them.
        if (
          /^\s*[-—–]?\s*\d{1,4}\s*[-—–]?\s*$/.test(line.text) &&
          (line.rect.y > 0.92 || line.rect.y < 0.03)
        )
          continue;
        const n = numberOf(line.text);
        if (n) {
          flush();
          number = n;
          currentType = type;
        }
        current.push(line);
      }
      flush();
    }
  }
  return result;
}
export function parseAnswer(raw: string) {
  const text = raw.normalize("NFKC");
  const match = text.match(
    /^\s*\d{1,4}\s*[.、)]\s*([A-H](?:[\s、,，]*[A-H])*|[√×ⅤVXTＦF]|正确|错误|对|错)(?=\s|[【\[(（]|$)/i,
  );
  if (match) {
    const after = text
      .slice(match[0].length)
      .replace(/^\s*(?:【解析】|\[解析\]|解析[:：]?)\s*/, "");
    return {
      answer: match[1].replace(/[\s、,，]/g, "").toUpperCase(),
      explanation: after,
    };
  }
  const explicit = text.match(
    /^\s*\d{1,4}\s*[.、)]\s*(.+?)\s*(?:【解析】|\[解析\])([\s\S]*)$/,
  );
  if (explicit)
    return { answer: explicit[1].trim(), explanation: explicit[2].trim() };
  return { answer: "", explanation: raw };
}
export function mergeItems(a: ImportItem, b: ImportItem): ImportItem {
  if (
    a.id === b.id ||
    a.role !== b.role ||
    a.book !== b.book ||
    a.chapter !== b.chapter ||
    a.state !== "draft" ||
    b.state !== "draft"
  )
    throw Error("只可合并同书、同章节、同资料类型的未归档片段。");
  if (a.fragments.length + b.fragments.length > 5)
    throw Error("每道题最多合并 5 个片段。");
  return {
    ...a,
    fragments: [...a.fragments, ...b.fragments],
    raw: a.raw + "\n" + b.raw,
    fields: {
      ...a.fields,
      stem: a.fields.stem + "\n" + b.fields.stem,
      optionsText: [a.fields.optionsText, b.fields.optionsText]
        .filter(Boolean)
        .join("\n"),
    },
    explanation: [a.explanation, b.explanation].filter(Boolean).join("\n"),
    textReviewed: false,
    scopeReviewed: false,
    warnings: [...a.warnings, "已人工合并，请核对片段顺序与完整性。"],
  };
}
export function splitItem(item: ImportItem): ImportItem[] {
  if (item.state !== "draft" || item.fragments.length < 2)
    throw Error("只可拆分未入库的合并条目。");
  return item.fragments.map((fragment, index) => {
    const raw = fragment.ocr?.text || "";
    const parsed = parseOcrDraft(raw);
    const answer = parseAnswer(raw);
    return {
      ...item,
      id: index === 0 ? item.id : crypto.randomUUID(),
      fragments: [fragment],
      raw,
      fields: draftFields(raw, item.fields.questionType, parsed.questionNumber),
      answer: item.role === "answer" ? answer.answer : "",
      explanation: item.role === "answer" ? answer.explanation : "",
      textReviewed: false,
      scopeReviewed: false,
      warnings: ["已拆开合并片段，请重新核对每段内容。"],
    };
  });
}
export function draftFields(
  raw: string,
  type: string,
  number: string,
): CaptureFields {
  const parsed = parseOcrDraft(raw);
  return {
    ...parsed,
    questionType: type,
    questionNumber: number,
    title: parsed.stem.split("\n")[0]?.slice(0, 100) || "待校对题目",
    topic: "",
    note: "",
  };
}
export function commitItems(
  data: LabData,
  jobId: string,
  ids: string[],
  previews: Record<string, string>,
): LabData {
  const job = data.importJobs?.find((j) => j.id === jobId);
  if (!job) throw Error("导入批次不存在。");
  const selected = job.items.filter((i) => ids.includes(i.id));
  if (!selected.length) throw Error("请先选择已核对条目。");
  if (selected.length !== new Set(ids).size)
    throw Error("条目已改变，请刷新。");
  const questions: Question[] = [];
  const answers: AnswerEntry[] = [];
  for (const item of selected) {
    if (item.state !== "draft" || !item.textReviewed || !item.scopeReviewed)
      throw Error("每个条目都必须核对文字与来源范围，禁止自动入库。");
    if (
      !item.book.trim() ||
      !item.chapter.trim() ||
      !item.fields.questionNumber.trim() ||
      !canonicalType(item.fields.questionType)
    )
      throw Error("请补齐书名、章节、题号及具体题型。");
    if (
      !item.fragments.length ||
      item.fragments.some((f) => !data.pages.some((p) => p.id === f.pageId))
    )
      throw Error("原始页面或片段缺失。");
    if (item.role === "answer") {
      if (!item.answer.trim()) throw Error("请核对并补齐标准答案。");
      answers.push({
        id: crypto.randomUUID(),
        book: item.book,
        chapter: item.chapter,
        questionNumber: item.fields.questionNumber,
        questionType: item.fields.questionType,
        answer: item.answer.trim(),
        explanation: item.explanation,
        sourceId: job.sourceId,
        origin: "ocr",
        revision: 1,
        fragments: item.fragments,
        rawText: item.raw,
        reviewedAt: new Date().toISOString(),
      });
    } else {
      if (
        item.fragments.some((fragment) =>
          data.questions.some((q) =>
            q.fragments?.some(
              (prior) =>
                prior.pageId === fragment.pageId &&
                JSON.stringify(prior.pixels) ===
                  JSON.stringify(fragment.pixels),
            ),
          ),
        )
      )
        throw Error("相同原书区域已入库，请排除重复条目。");
      const options = parseOptions(item.fields.optionsText);
      validateCapture(
        {
          id: item.id,
          book: item.book,
          chapter: item.chapter,
          subject: item.subject,
          fields: item.fields,
          fragments: item.fragments,
          review: { text: item.textReviewed, scope: item.scopeReviewed },
        },
        options,
      );
      const first = item.fragments[0];
      if (!previews[item.id]) throw Error("裁剪预览缺失。");
      questions.push({
        id: crypto.randomUUID(),
        title: item.fields.title,
        structuredText: item.fields.stem,
        options,
        questionNumber: item.fields.questionNumber,
        questionType: item.fields.questionType,
        book: item.book,
        chapter: item.chapter,
        subject: item.subject,
        topic: item.fields.topic || "待整理",
        note: item.fields.note,
        answer: "",
        explanation: "",
        status: "待复习",
        favorite: false,
        reviews: 0,
        created: today(),
        due: today(),
        pageId: first.pageId,
        regionId: first.regionId,
        rect: first.rect,
        crop: previews[item.id],
        fragments: item.fragments,
        extraction: {
          method: "ocr",
          rawText: item.raw,
          reviewedAt: new Date().toISOString(),
          engine: first.ocr?.engine || "PDF text",
        },
      });
    }
  }
  let next: LabData = {
    ...data,
    questions: [...data.questions, ...questions],
    answers: [...data.answers, ...answers],
    regions: [
      ...data.regions,
      ...questions.flatMap((q) =>
        (q.fragments || []).map((f) => ({
          id: f.regionId,
          pageId: f.pageId,
          rect: f.rect,
          questionNumber: q.questionNumber!,
          questionType: q.questionType!,
          topic: q.topic,
          structuredText: q.structuredText!,
          origin: "ocr" as const,
          recognition: "confirmed" as const,
        })),
      ),
    ],
    importJobs: data.importJobs!.map((j) =>
      j.id === jobId
        ? {
            ...j,
            items: j.items.map((i) =>
              ids.includes(i.id) ? { ...i, state: "archived" as const } : i,
            ),
          }
        : j,
    ),
  };
  // Every rule match remains pending; this function never fills a question answer.
  next = {
    ...next,
    matches: [
      ...next.matches,
      ...draftMatches(
        next,
        next.answers.map((a) => a.id),
      ).map((m) => {
        const q = next.questions.find((q) => q.id === m.questionId)!;
        const a = next.answers.find((a) => a.id === m.answerId)!;
        const ambiguous =
          next.answers.filter((other) => compatible(q, other)).length > 1 ||
          next.questions.filter((other) => compatible(other, a)).length > 1;
        return {
          ...m,
          reason: ambiguous
            ? "存在同号或重复候选，匹配有歧义，必须人工选择。"
            : m.reason + "；待人工确认",
        };
      }),
    ],
  };
  return next;
}
