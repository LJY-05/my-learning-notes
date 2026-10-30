/** 人工阅读本次聊天图片的小样本，不是 OCR 输出，也不包含原始图片文件。
 * 书名/章节尚未由用户提供。此文件只用于隔离的领域测试，不自动导入用户工作区。
 */
import { seed, today, type Question, type LabData } from "./data";
import type { AnswerEntry } from "./materials";
const book = "用户图片小样本（书名待核对）";
const chapter = "教育学（章节待核对）";
export function realSampleFixture(): LabData {
  const texts = [
    {
      id: "real-single-19",
      type: "单选题",
      number: "19",
      title: "关于古代教育，下列说法正确的是",
      options: [
        ["A", "孟子在学与思的关系上认为学比思更重要"],
        ["B", "《论语》是孔子所作"],
        ["C", "“君子之教，喻也”体现了循序渐进原则"],
        ["D", "《学记》由思孟学派所作"],
      ],
    },
    {
      id: "real-multiple-19",
      type: "多选题",
      number: "19",
      title: "赫尔巴特所代表的传统教育思想的核心内容一般被概括为",
      options: [
        ["A", "课堂中心"],
        ["B", "教师中心"],
        ["C", "活动中心"],
        ["D", "教材中心"],
        ["E", "学校中心"],
      ],
    },
    {
      id: "real-multiple-20",
      type: "多选题",
      number: "20",
      title: "下列选项中，属于“四书”的是",
      options: [
        ["A", "《大学》"],
        ["B", "《论语》"],
        ["C", "《学记》"],
        ["D", "《中庸》"],
      ],
    },
  ];
  const questions: Question[] = texts.map((t) => ({
    id: t.id,
    title: t.title,
    structuredText: t.title,
    questionNumber: t.number,
    questionType: t.type,
    subject: "教育学",
    book,
    chapter,
    topic: "人工转录待校对",
    answer: "",
    explanation: "",
    note: "从聊天图片人工读取；原图尚未挂载，未校验裁剪坐标。",
    status: "待复习",
    created: today(),
    due: today(),
    favorite: false,
    reviews: 0,
    options: t.options.map(([label, text]) => ({ label, text })),
  }));
  const answers: AnswerEntry[] = texts.map((t, i) => ({
    id: `answer-${t.id}`,
    book,
    chapter,
    questionNumber: t.number,
    questionType: t.type,
    answer: ["D", "ABD", "ABD"][i],
    explanation: [
      "图片4：第19题标注 D；《学记》由思孟学派所作。",
      "图片5：第19题标注 ABD；传统教育的课堂、教师、教材三中心。",
      "图片5：第20题标注 ABD；《大学》《论语》《中庸》。",
    ][i],
    origin: "manual",
    revision: 1,
  }));
  return {
    ...seed(),
    questions,
    answers,
    pages: [],
    assets: [],
    regions: [],
    matches: [],
    batches: [],
    activity: [],
  };
}
