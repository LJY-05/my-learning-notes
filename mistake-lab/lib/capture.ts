import type { Rect, Question } from "./data";
export type PixelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type OcrResult = {
  text: string;
  confidence: number | null;
  engine: string;
  recognizedAt: string;
};
export type CaptureFragment = {
  id: string;
  regionId: string;
  pageId: string;
  pageNumber: number;
  sourceId?: string;
  book: string;
  chapter: string;
  subject: string;
  rect: Rect;
  originalWidth: number;
  originalHeight: number;
  pixels: PixelBounds;
  crop: string;
  originalFileUsed: boolean;
  ocr?: OcrResult;
};
export type CaptureFields = {
  title: string;
  questionNumber: string;
  questionType: string;
  stem: string;
  optionsText: string;
  topic: string;
  note: string;
};
export type CaptureDraft = {
  id: string;
  book: string;
  chapter: string;
  subject: string;
  fragments: CaptureFragment[];
  fields: CaptureFields;
  review: { text: boolean; scope: boolean };
};
export const unchecked = () => ({ text: false, scope: false });
export function pixelBounds(
  rect: Rect,
  width: number,
  height: number,
): PixelBounds {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  )
    throw Error("原图尺寸无效。");
  if (
    ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.w <= 0 ||
    rect.h <= 0 ||
    rect.x + rect.w > 1.000001 ||
    rect.y + rect.h > 1.000001
  )
    throw Error("框选坐标超出原图范围。");
  const x = Math.floor(rect.x * width),
    y = Math.floor(rect.y * height);
  const right = Math.min(width, Math.ceil((rect.x + rect.w) * width)),
    bottom = Math.min(height, Math.ceil((rect.y + rect.h) * height));
  if (right <= x || bottom <= y) throw Error("框选区域为空。");
  return { x, y, width: right - x, height: bottom - y };
}
export function appendFragment(
  draft: CaptureDraft | undefined,
  fragment: CaptureFragment,
  fields: CaptureFields,
): CaptureDraft {
  if (draft && draft.book !== fragment.book)
    throw Error("不能把不同习题册的片段合并到同一道题，请先完成当前采集。");
  if ((draft?.fragments.length || 0) >= 5)
    throw Error("小样本模式每道题最多 5 个片段。");
  if (
    draft?.fragments.some(
      (f) =>
        f.pageId === fragment.pageId &&
        JSON.stringify(f.pixels) === JSON.stringify(fragment.pixels),
    )
  )
    throw Error("这个区域已经在采集篮中。");
  return draft
    ? {
        ...draft,
        fragments: [...draft.fragments, fragment],
        review: unchecked(),
      }
    : {
        id: crypto.randomUUID(),
        book: fragment.book,
        chapter: fragment.chapter,
        subject: fragment.subject,
        fragments: [fragment],
        fields,
        review: unchecked(),
      };
}
export function moveFragment(
  draft: CaptureDraft,
  id: string,
  offset: number,
): CaptureDraft {
  const fragments = [...draft.fragments],
    index = fragments.findIndex((f) => f.id === id),
    next = index + offset;
  if (index < 0 || next < 0 || next >= fragments.length) return draft;
  [fragments[index], fragments[next]] = [fragments[next], fragments[index]];
  return { ...draft, fragments, review: unchecked() };
}
export function parseOcrDraft(
  text: string,
): Pick<
  CaptureFields,
  "questionNumber" | "questionType" | "stem" | "optionsText"
> {
  const normalized = text.normalize("NFKC").replace(/\r/g, "");
  const number =
    normalized.match(/^\s*(\d{1,4}(?:\(\d+\))?)[.、．\s]/m)?.[1] || "";
  const type = /多项选择|多选题/.test(normalized)
    ? "多选题"
    : /单项选择|单选题/.test(normalized)
      ? "单选题"
      : /判断题/.test(normalized)
        ? "判断题"
        : /填空题/.test(normalized)
          ? "填空题"
          : "待整理";
  // Only explicit option markers are split. Reading order and missing labels require human review.
  const marked = normalized.replace(/([A-H])[.、:：]\s*/g, "\n$1. ");
  const lines = marked
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    stem: string[] = [],
    options: string[] = [];
  for (const line of lines) {
    if (
      /^[一二三四五六七八九十]+\s*[、.]\s*.*(?:单项选择|多项选择|单选题|多选题|判断题|填空题)/.test(
        line,
      )
    )
      continue;
    if (/^[A-H][.]\s*\S/.test(line)) options.push(line);
    else if (options.length) options[options.length - 1] += " " + line;
    else stem.push(line);
  }
  return {
    questionNumber: number,
    questionType: type,
    stem: stem.join("\n"),
    optionsText: options.join("\n"),
  };
}
export function validateCapture(
  draft: CaptureDraft,
  options: NonNullable<Question["options"]>,
) {
  if (!draft.fragments.length) throw Error("请先添加题目片段。");
  if (!draft.review.text || !draft.review.scope)
    throw Error("请逐页核对文字、选项、题型及片段完整性，再确认保存。");
  if (
    !draft.fields.title.trim() ||
    !draft.fields.stem.trim() ||
    !draft.fields.questionNumber.trim()
  )
    throw Error("请补齐题目摘要、题号和题干。");
  if (
    !["单选题", "多选题", "判断题", "填空题", "解答题", "探究题"].includes(
      draft.fields.questionType,
    )
  )
    throw Error("请人工确认具体题型，不能仅填写“选择题”。");
  if (["单选题", "多选题"].includes(draft.fields.questionType)) {
    if (options.length < 2) throw Error("选择题需要至少两个已核对选项。");
    if (!options.every((o, i) => o.label === String.fromCharCode(65 + i)))
      throw Error("选项须从 A 连续排列，存在缺项或顺序错误，请人工校对。");
  }
}
