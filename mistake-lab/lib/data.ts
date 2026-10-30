import {
  upgradeData,
  type SourceAsset,
  type QuestionRegion,
  type AnswerEntry,
  type MatchCandidate,
  type ImportBatch,
} from "./materials";
import type { CaptureDraft, CaptureFragment } from "./capture";
import type { ImportJob } from "./importer";
export type Rect = { x: number; y: number; w: number; h: number };
export type BookPage = {
  id: string;
  book: string;
  chapter: string;
  subject: string;
  image: string;
  number: number;
  pdfPage?: number;
  pdfLabel?: string;
  sourceId?: string;
};
export type Question = {
  id: string;
  title: string;
  subject: string;
  book: string;
  chapter: string;
  topic: string;
  answer: string;
  explanation: string;
  note: string;
  status: "待复习" | "巩固中" | "已掌握";
  pageId?: string;
  rect?: Rect;
  crop?: string;
  created: string;
  due: string;
  favorite: boolean;
  reviews: number;
  regionId?: string;
  questionNumber?: string;
  questionType?: string;
  structuredText?: string;
  answerId?: string;
  options?: { label: string; text: string }[];
  fragments?: CaptureFragment[];
  extraction?: {
    method: "manual" | "ocr";
    reviewedAt: string;
    rawText: string;
    engine?: string;
  };
};
export type LabData = {
  version: 1;
  questions: Question[];
  pages: BookPage[];
  activity: { date: string; count: number }[];
  schemaVersion: 2;
  assets: SourceAsset[];
  regions: QuestionRegion[];
  answers: AnswerEntry[];
  matches: MatchCandidate[];
  batches: ImportBatch[];
  captureDraft?: CaptureDraft;
  importJobs?: ImportJob[];
};
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
export function seed(): LabData {
  const titles = [
    "已知函数 f(x) = x² − 2ax + 1，求函数在区间 [0, 2] 上的最小值。",
    "在探究加速度与力的关系时，如何控制实验中的变量？",
    "阅读短文，分析作者以「窗」为线索展开叙事的作用。",
    "已知数列 {aₙ} 的前 n 项和 Sₙ = n² + n，求通项公式。",
    "Choose the correct form: If I ___ you, I would try again.",
    "判断直线 y = kx + 2 与圆 x² + y² = 4 的位置关系。",
    "结合材料，说明光合作用中光反应与暗反应的联系。",
    "求函数 y = sin(2x + π/3) 的最小正周期与单调区间。",
  ];
  return upgradeData({
    version: 1,
    pages: [
      {
        id: "sample-1",
        book: "数学 · 思维进阶",
        chapter: "第一章 函数与导数",
        subject: "数学",
        image: "/workbook-1.svg",
        number: 1,
      },
      {
        id: "sample-2",
        book: "数学 · 思维进阶",
        chapter: "第二章 数列",
        subject: "数学",
        image: "/workbook-2.svg",
        number: 2,
      },
    ],
    activity: [],
    questions: titles.map((title, i) => ({
      id: `ml-${i + 1}`,
      title,
      questionType: [
        "解答题",
        "探究题",
        "解答题",
        "解答题",
        "单选题",
        "解答题",
        "解答题",
        "解答题",
      ][i],
      subject: ["数学", "物理", "语文", "数学", "英语", "数学", "生物", "数学"][
        i
      ],
      book: [
        "数学 · 思维进阶",
        "物理 · 实验探究",
        "语文 · 阅读练习",
        "数学 · 思维进阶",
        "英语 · 每日精练",
        "数学 · 思维进阶",
        "生物 · 知识手册",
        "数学 · 思维进阶",
      ][i],
      chapter: [
        "第一章 函数与导数",
        "第二章 牛顿运动定律",
        "现代文阅读",
        "第二章 数列",
        "虚拟语气",
        "第三章 解析几何",
        "细胞代谢",
        "第四章 三角函数",
      ][i],
      topic: [
        "二次函数",
        "控制变量法",
        "叙事线索",
        "数列通项",
        "虚拟语气",
        "直线与圆",
        "光合作用",
        "三角函数",
      ][i],
      answer: [
        "当 a ≤ 0 时为 1；0 < a < 2 时为 1 − a²；a ≥ 2 时为 5 − 4a。",
        "保持小车的总质量不变，改变所受合外力。",
        "贯穿全文、串联场景；以窗内外的变化映照人物情感。",
        "aₙ = Sₙ − Sₙ₋₁ = 2n（n ≥ 1）。",
        "were",
        "k = 0 时相切，k ≠ 0 时相交。",
        "光反应提供 ATP 与 NADPH，暗反应利用它们完成碳的固定与还原。",
        "最小正周期 T = π；单调区间需由复合角的不等式求得。",
      ][i],
      explanation:
        i === 0
          ? "先找到对称轴 x = a，再比较它与区间 [0, 2] 的相对位置。对称轴在区间内时取顶点值，在区间外时取最近端点值。不要遗漏 a = 0 和 a = 2 的边界。"
          : "先明确题目条件，找到对应知识点，再分步骤推导。检查结论是否满足题目中的全部条件。",
      note: i === 0 ? "容易忽略对称轴在区间外的情况，下次先画草图。" : "",
      status:
        i === 2 || i === 6
          ? "已掌握"
          : i === 3 || i === 4
            ? "巩固中"
            : "待复习",
      pageId: i === 0 ? "sample-1" : i === 3 ? "sample-2" : undefined,
      rect:
        i === 0
          ? { x: 0.08, y: 0.23, w: 0.84, h: 0.25 }
          : i === 3
            ? { x: 0.08, y: 0.23, w: 0.84, h: 0.25 }
            : undefined,
      created: today(),
      due: today(),
      favorite: i === 0 || i === 3,
      reviews: i % 3,
    })),
  });
}
