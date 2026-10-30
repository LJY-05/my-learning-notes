import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PdfInspection } from "./importer";
const execute = promisify(execFile);
export async function inspectPdf(
  bytes: Uint8Array,
  start: number,
  end: number,
  ocr: boolean,
  signal?: AbortSignal,
): Promise<PdfInspection> {
  if (
    bytes.length > 128 * 1024 * 1024 ||
    Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-"
  )
    throw Error("请选择不超过 128 MiB 的有效 PDF。");
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end < start ||
    end - start >= 5
  )
    throw Error("每次请选择连续 1–5 页。");
  const directory = await mkdtemp(join(tmpdir(), "mistake-lab-pdf-"));
  try {
    const path = join(directory, "source.pdf");
    await writeFile(path, bytes, { mode: 0o600 });
    const { stdout } = await execute(
      "python3",
      [
        join(process.cwd(), "scripts/process-pdf.py"),
        path,
        String(start),
        String(end),
        ocr ? "1" : "0",
      ],
      { signal, timeout: 300000, maxBuffer: 48 * 1024 * 1024 },
    );
    return JSON.parse(stdout);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
