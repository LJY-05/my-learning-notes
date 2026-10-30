import test from "node:test";
import assert from "node:assert/strict";
import {
  pixelBounds,
  appendFragment,
  moveFragment,
  parseOcrDraft,
  validateCapture,
  type CaptureFragment,
} from "./capture";
import { parseTsv, validatePng } from "./ocr-server";
function fragment(id = "f", pageId = "p"): CaptureFragment {
  return {
    id,
    regionId: id,
    pageId,
    pageNumber: 19,
    book: "测试书",
    chapter: "章",
    subject: "教育学",
    rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 },
    originalWidth: 2600,
    originalHeight: 3600,
    pixels: { x: 260, y: 720, width: 1300, height: 900 },
    crop: "data:image/png;base64,test",
    originalFileUsed: true,
  };
}
const fields = {
  title: "题目",
  questionNumber: "19",
  questionType: "多选题",
  stem: "题干",
  optionsText: "A. 遗传\nB. 环境",
  topic: "",
  note: "",
};
test("原图坐标向外取整，缩放无关，保留像素精度", () => {
  assert.deepEqual(
    pixelBounds({ x: 0.1001, y: 0.2001, w: 0.5001, h: 0.2501 }, 2600, 3600),
    { x: 260, y: 720, width: 1301, height: 901 },
  );
  assert.deepEqual(pixelBounds({ x: 0, y: 0, w: 1, h: 1 }, 2600, 3600), {
    x: 0,
    y: 0,
    width: 2600,
    height: 3600,
  });
  assert.throws(
    () => pixelBounds({ x: 0.9, y: 0, w: 0.2, h: 1 }, 2600, 3600),
    /超出/,
  );
  assert.throws(
    () => pixelBounds({ x: NaN, y: 0, w: 1, h: 1 }, 2600, 3600),
    /超出/,
  );
});
test("跨页片段保留独立页码、坐标，可排序；拒绝跨书与重复区域", () => {
  let d = appendFragment(undefined, fragment(), fields);
  d = appendFragment(d, { ...fragment("f2", "p2"), pageNumber: 20 }, fields);
  assert.equal(d.fragments[1].pageNumber, 20);
  const n = moveFragment(d, "f2", -1);
  assert.equal(n.fragments[0].pageId, "p2");
  assert.equal(n.review.scope, false);
  assert.throws(
    () => appendFragment(d, { ...fragment("f3"), book: "另一书" }, fields),
    /不同习题册/,
  );
  assert.throws(() => appendFragment(d, fragment(), fields), /已经在/);
  assert.equal(d.fragments[0].pageId, "p");
});
test("保存门禁必须核对文字与完整性，单选多选不能遗漏选项", () => {
  const d = appendFragment(undefined, fragment(), fields);
  assert.throws(() => validateCapture(d, []), /逐页核对/);
  d.review = { text: true, scope: true };
  assert.throws(() => validateCapture(d, []), /至少两个/);
  assert.doesNotThrow(() =>
    validateCapture(d, [
      { label: "A", text: "遗传" },
      { label: "B", text: "环境" },
    ]),
  );
  d.fields.questionType = "判断题";
  assert.doesNotThrow(() => validateCapture(d, []));
  d.fields.questionType = "填空题";
  assert.doesNotThrow(() => validateCapture(d, []));
});
test("OCR 解析仅提出题号和选项草稿，未出现题型标题时不猜单选多选", () => {
  const d = parseOcrDraft(
    "19. 影响身心发展的因素有 A. 遗传 B. 环境 C. 教育 D. 主观能动性",
  );
  assert.equal(d.questionNumber, "19");
  assert.equal(d.questionType, "待整理");
  assert.equal(d.optionsText.split("\n").length, 4);
  assert.equal(
    parseOcrDraft("三、判断题\n1. 文化是一部分").questionType,
    "判断题",
  );
  assert.equal(
    parseOcrDraft("四、填空题\n1. 教学要____").questionType,
    "填空题",
  );
});
test("TSV 解析保留中文行及引擎置信值，未知值不伪造", () => {
  const header =
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n";
  const r = parseTsv(
    header +
      "5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t80\t教\n5\t1\t1\t1\t1\t2\t12\t0\t10\t10\t90\t育",
  );
  assert.equal(r.text, "教育");
  assert.equal(r.confidence, 85);
  assert.equal(parseTsv(header).confidence, null);
  assert.throws(() => validatePng(new Uint8Array([1, 2, 3])), /PNG/);
});
