import type { BookPage, LabData, Question, Rect } from "./data";

/** Source files are independent from page previews, crops and OCR output. */
export type SourceAsset = {
  id: string;
  role: "workbook" | "answer";
  format: "pdf" | "image";
  name: string;
  book: string;
  chapter: string;
  subject: string;
  originalDataUrl: string;
  size: number;
  created: string;
  state: "registered" | "ready";
  batchId?: string;
};
export type QuestionRegion = {
  id: string;
  pageId: string;
  rect: Rect;
  questionNumber: string;
  questionType: string;
  topic: string;
  structuredText: string;
  origin: "manual" | "demo" | "ocr";
  recognition: "manual" | "demo" | "pending" | "confirmed";
};
export type AnswerEntry = {
  id: string;
  sourceId?: string;
  book: string;
  chapter: string;
  questionNumber: string;
  questionType?: string;
  answer: string;
  explanation: string;
  origin: "manual" | "demo" | "ocr";
  revision: number;
  fragments?: import("./capture").CaptureFragment[];
  rawText?: string;
  reviewedAt?: string;
};
export type MatchCandidate = {
  id: string;
  questionId: string;
  answerId: string;
  answerRevision: number;
  state: "pending" | "confirmed" | "rejected" | "superseded";
  reason: string;
  confirmedAt?: string;
  snapshot?: Pick<
    AnswerEntry,
    | "answer"
    | "explanation"
    | "book"
    | "chapter"
    | "questionNumber"
    | "sourceId"
    | "questionType"
  >;
};
export type ImportBatch = {
  id: string;
  role: "workbook" | "answer";
  name: string;
  state: "staged" | "awaiting-review" | "completed" | "failed";
  sourceIds: string[];
  created: string;
  error?: string;
};

/** Future adapters must return drafts; they cannot save questions or confirmed matches. */
export interface MaterialProcessor {
  renderPdf(
    source: SourceAsset,
    pages: number[],
    signal: AbortSignal,
  ): Promise<BookPage[]>;
  recognizeRegion(
    source: SourceAsset,
    page: BookPage,
    rect: Rect,
    signal: AbortSignal,
  ): Promise<
    Pick<
      QuestionRegion,
      "questionNumber" | "questionType" | "topic" | "structuredText"
    >
  >;
  extractAnswers(
    source: SourceAsset,
    signal: AbortSignal,
  ): Promise<Omit<AnswerEntry, "id" | "revision">[]>;
}
export function canonicalType(value?: string) {
  const aliases: Record<string, string> = {
    单项选择题: "单选题",
    单选: "单选题",
    多项选择题: "多选题",
    多选: "多选题",
  };
  const type = value?.trim().normalize("NFKC") || "";
  const normalized = aliases[type] || type;
  return ["单选题", "多选题", "判断题", "填空题", "解答题", "探究题"].includes(
    normalized,
  )
    ? normalized
    : "";
}
export function parseOptions(text: string): NonNullable<Question["options"]> {
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const result = lines.map((line) => {
    const m = line.match(/^([A-ZＡ-Ｚ])[.．、:：)）\s]+(.+)$/);
    if (!m) throw Error("每个选项单独一行，例如 A. 课堂中心");
    return { label: m[1].normalize("NFKC"), text: m[2].trim() };
  });
  if (new Set(result.map((o) => o.label)).size !== result.length)
    throw Error("选项标记重复，请人工校对。");
  return result;
}
export const matchKey = (
  book: string,
  chapter: string,
  number: string,
  questionType?: string,
) =>
  JSON.stringify([
    book.trim().normalize("NFKC").toLowerCase(),
    chapter.trim().normalize("NFKC").toLowerCase(),
    number
      .trim()
      .normalize("NFKC")
      .replace(/^第|[题.。]$/g, "")
      .replace(/^0+(?=\d)/, ""),
    canonicalType(questionType),
  ]);
export function compatible(q: Question, a: AnswerEntry) {
  return (
    !!q.questionNumber &&
    !!canonicalType(q.questionType) &&
    !!canonicalType(a.questionType) &&
    matchKey(q.book, q.chapter, q.questionNumber, q.questionType) ===
      matchKey(a.book, a.chapter, a.questionNumber, a.questionType)
  );
}
export function draftMatches(
  data: LabData,
  answerIds: string[],
): MatchCandidate[] {
  return data.answers
    .filter((a) => answerIds.includes(a.id))
    .flatMap((a) =>
      data.questions
        .filter((q) => compatible(q, a))
        .filter(
          (q) =>
            !data.matches.some(
              (m) =>
                m.questionId === q.id &&
                m.answerId === a.id &&
                m.answerRevision === a.revision &&
                ["pending", "confirmed"].includes(m.state),
            ),
        )
        .map((q) => ({
          id: crypto.randomUUID(),
          questionId: q.id,
          answerId: a.id,
          answerRevision: a.revision,
          state: "pending" as const,
          reason: "习题册、章节、题型、题号完全一致（规则匹配）",
        })),
    );
}
export function confirmMatch(
  data: LabData,
  id: string,
  allowReplace = false,
): LabData {
  const m = data.matches.find((m) => m.id === id);
  if (!m || m.state !== "pending") throw Error("候选已处理，请刷新列表。");
  const q = data.questions.find((q) => q.id === m.questionId),
    a = data.answers.find((a) => a.id === m.answerId);
  if (!q || !a) throw Error("题目或解析已删除，请重新选择。");
  if (a.revision !== m.answerRevision)
    throw Error("解析内容已更新，请重新生成候选后确认。");
  if (!canonicalType(q.questionType) || !canonicalType(a.questionType))
    throw Error("原题或解析题型尚未校对，请先区分单选、多选等题型。");
  if (canonicalType(q.questionType) !== canonicalType(a.questionType))
    throw Error("原题与解析题型不一致，不能确认关联。");
  if (!a.answer.trim()) throw Error("答案为空，请先人工补充。");
  if (
    canonicalType(q.questionType) === "判断题" &&
    ![
      "√",
      "✓",
      "✔",
      "V",
      "×",
      "✗",
      "✘",
      "X",
      "正确",
      "错误",
      "对",
      "错",
      "是",
      "否",
      "T",
      "F",
      "TRUE",
      "FALSE",
    ].includes(a.answer.trim().normalize("NFKC").toUpperCase())
  )
    throw Error("判断题答案请使用 √/×、正确/错误等明确标记，解析应单独填写。");
  if (["单选题", "多选题"].includes(canonicalType(q.questionType))) {
    const normalized = a.answer
      .normalize("NFKC")
      .toUpperCase()
      .replace(/[\s,，、;；.。]/g, "");
    if (
      !/^[A-Z]+$/.test(normalized) ||
      new Set(normalized).size !== normalized.length
    )
      throw Error("选择题答案请填写不重复的选项字母，如 D 或 ABD。");
    if (canonicalType(q.questionType) === "单选题" && normalized.length !== 1)
      throw Error("单选题只能有一个答案选项，请核对题型或答案。");
    if (canonicalType(q.questionType) === "多选题" && normalized.length < 2)
      throw Error("多选题答案不足两个选项，请人工核对。");
    if (
      q.options?.length &&
      [...normalized].some(
        (label) => !q.options!.some((o) => o.label === label),
      )
    )
      throw Error("答案包含题干中不存在的选项，请人工校对。");
  }
  if ((q.answer || q.explanation || q.answerId) && !allowReplace)
    throw Error("该题已有答案。请明确勾选替换后再确认。");
  return {
    ...data,
    questions: data.questions.map((x) =>
      x.id === q.id
        ? { ...x, answerId: a.id, answer: a.answer, explanation: a.explanation }
        : x,
    ),
    matches: data.matches.map((x) =>
      x.id === id
        ? {
            ...x,
            state: "confirmed",
            confirmedAt: new Date().toISOString(),
            snapshot: {
              answer: a.answer,
              explanation: a.explanation,
              book: a.book,
              chapter: a.chapter,
              questionNumber: a.questionNumber,
              sourceId: a.sourceId,
              questionType: a.questionType,
            },
          }
        : x.questionId === q.id && x.state === "confirmed"
          ? { ...x, state: "superseded" }
          : x,
    ),
  };
}
export async function archiveFile(file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw Error("每份资料最多 10 MB。");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("无法读取文件。"));
    reader.readAsDataURL(file);
  });
}
export function upgradeData(
  input: Pick<LabData, "version" | "pages" | "questions" | "activity"> &
    Partial<LabData>,
): LabData {
  const regions: QuestionRegion[] = input.regions
    ? [...input.regions]
    : input.pages
        .filter((p) => ["sample-1", "sample-2"].includes(p.id))
        .flatMap((p) =>
          [1, 2, 3].map((n) => ({
            id: `${p.id}-region-${n}`,
            pageId: p.id,
            rect:
              n === 1
                ? { x: 0.08, y: 0.23, w: 0.84, h: 0.25 }
                : n === 2
                  ? { x: 0.08, y: 0.5, w: 0.84, h: 0.25 }
                  : { x: 0.08, y: 0.78, w: 0.84, h: 0.12 },
            questionNumber: String(n),
            questionType: n === 1 ? "解答题" : "探究题",
            topic: p.id === "sample-1" ? "函数与导数" : "数列",
            structuredText:
              n === 1
                ? p.id === "sample-1"
                  ? "已知函数 f(x) = x² − 2ax + 1，求区间 [0, 2] 上的最小值。"
                  : "已知数列 {aₙ} 的前 n 项和 Sₙ = n² + n，求通项公式。"
                : n === 2
                  ? "观察图象，回答下列问题。"
                  : "尝试改变一个条件，构造一道新题。",
            origin: "demo" as const,
            recognition: "demo" as const,
          })),
        );
  function regionId(q: Question) {
    return (
      q.regionId ??
      (q.id === "ml-1"
        ? "sample-1-region-1"
        : q.id === "ml-4"
          ? "sample-2-region-1"
          : q.pageId && q.rect
            ? `legacy-${q.id}`
            : undefined)
    );
  }
  for (const q of input.questions) {
    const id = regionId(q);
    if (id && q.pageId && q.rect && !regions.some((r) => r.id === id))
      regions.push({
        id,
        pageId: q.pageId,
        rect: { ...q.rect },
        questionNumber: q.questionNumber || "",
        questionType: q.questionType || "待整理",
        topic: q.topic,
        structuredText: q.structuredText ?? q.title,
        origin: "manual",
        recognition: "manual",
      });
  }
  return {
    ...input,
    schemaVersion: 2,
    assets: input.assets ?? [],
    regions,
    answers: input.answers ?? [],
    matches: input.matches ?? [],
    batches: input.batches ?? [],
    questions: input.questions.map((q) => ({
      ...q,
      structuredText: q.structuredText ?? q.title,
      questionNumber:
        q.questionNumber ?? (q.id === "ml-1" || q.id === "ml-4" ? "1" : ""),
      questionType: q.questionType ?? "待整理",
      regionId: regionId(q),
    })),
  };
}
