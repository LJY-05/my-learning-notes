import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const execute = promisify(execFile);
const dataDir = () =>
  process.env.MISTAKE_LAB_OCR_DATA ||
  "/workspace/.environment-tools/mistake-lab-ocr/tessdata";
export function validatePng(bytes: Uint8Array) {
  if (bytes.length > 8 * 1024 * 1024)
    throw Error("OCR 裁剪图片不能超过 8 MB。");
  const b = Buffer.from(bytes);
  if (
    b.length < 33 ||
    b.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    b.subarray(12, 16).toString() !== "IHDR"
  )
    throw Error("OCR 仅接受本站生成的 PNG 裁剪图片。");
  const width = b.readUInt32BE(16),
    height = b.readUInt32BE(20);
  if (
    !width ||
    !height ||
    width > 12000 ||
    height > 12000 ||
    width * height > 20_000_000
  )
    throw Error("OCR 图片尺寸超出小样本限制。");
  return { width, height };
}
export function parseTsv(tsv: string) {
  const lines = new Map<
    string,
    { text: string; left: number; top: number }[]
  >();
  const confidences: number[] = [];
  for (const row of tsv.split("\n").slice(1)) {
    const c = row.split("\t");
    if (c.length < 12 || c[0] !== "5" || !c[11]?.trim()) continue;
    const text = c.slice(11).join("\t").trim(),
      confidence = Number(c[10]);
    if (confidence >= 0) confidences.push(confidence);
    const key = c.slice(1, 5).join(":");
    const items = lines.get(key) || [];
    items.push({ text, left: Number(c[6]), top: Number(c[7]) });
    lines.set(key, items);
  }
  return {
    text: [...lines.values()]
      .map((words) =>
        words
          .sort((a, b) => a.left - b.left)
          .map((w) => w.text)
          .join(" ")
          .replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, "$1"),
      )
      .join("\n"),
    confidence: confidences.length
      ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
      : null,
  };
}
export async function ocrCapability() {
  try {
    await Promise.all(
      ["chi_sim", "eng"].map((lang) =>
        access(join(dataDir(), `${lang}.traineddata`)),
      ),
    );
    const { stdout } = await execute("tesseract", ["--version"], {
      timeout: 5000,
      maxBuffer: 16384,
    });
    return {
      available: true,
      engine: stdout.split("\n")[0],
      languages: ["chi_sim", "eng"],
    };
  } catch {
    return {
      available: false,
      engine: "Tesseract",
      languages: [],
      error: "本站 OCR 尚未安装完成，请按 README 执行 npm run setup:ocr。",
    };
  }
}
export async function recognizePng(
  bytes: Uint8Array,
  mode: "block" | "sparse" = "block",
  signal?: AbortSignal,
  language: "zh" | "mixed" | "en" = "zh",
) {
  validatePng(bytes);
  const capability = await ocrCapability();
  if (!capability.available) throw Error(capability.error);
  const directory = await mkdtemp(join(tmpdir(), "mistake-lab-ocr-"));
  try {
    const path = join(directory, "crop.png");
    await writeFile(path, bytes, { mode: 0o600 });
    const { stdout } = await execute(
      "tesseract",
      [
        path,
        "stdout",
        "--tessdata-dir",
        dataDir(),
        "-l",
        language === "en"
          ? "eng"
          : language === "mixed"
            ? "chi_sim+eng"
            : "chi_sim",
        "--psm",
        mode === "sparse" ? "11" : "6",
        "-c",
        "tessedit_create_tsv=1",
      ],
      {
        timeout: 45000,
        maxBuffer: 8 * 1024 * 1024,
        signal,
        env: { ...process.env, OMP_THREAD_LIMIT: "1" },
      },
    );
    return {
      ...parseTsv(stdout),
      engine: capability.engine,
      recognizedAt: new Date().toISOString(),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
