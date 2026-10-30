import { NextRequest, NextResponse } from "next/server";
import { ocrCapability, recognizePng } from "@/lib/ocr-server";
export const runtime = "nodejs";
let active = false;
export async function GET() {
  return NextResponse.json(await ocrCapability(), {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  let sameOrigin = true;
  if (origin) {
    try {
      const incoming = new URL(origin);
      const host = request.headers.get("host") || request.nextUrl.host;
      const protocol =
        (request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
          request.nextUrl.protocol.replace(":", "")) + ":";
      sameOrigin =
        incoming.host.toLowerCase() === host.toLowerCase() &&
        incoming.protocol === protocol;
    } catch {
      sameOrigin = false;
    }
  }
  if (!sameOrigin)
    return NextResponse.json(
      { error: "只接受本站发起的识别请求。" },
      { status: 403 },
    );
  if (active)
    return NextResponse.json(
      { error: "正在处理另一份小样本，请稍后重试。" },
      { status: 429 },
    );
  active = true;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error("请选择裁剪图片。");
    let total = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 9 * 1024 * 1024) {
        await reader.cancel();
        return NextResponse.json(
          { error: "请求超出 9 MB 限制。" },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    const form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const image = form.get("image");
    if (!(image instanceof File)) throw Error("请选择 PNG 裁剪图片。");
    const mode = form.get("mode") === "sparse" ? "sparse" : "block";
    const language =
      form.get("language") === "en"
        ? "en"
        : form.get("language") === "mixed"
          ? "mixed"
          : "zh";
    const result = await recognizePng(
      new Uint8Array(await image.arrayBuffer()),
      mode,
      request.signal,
      language,
    );
    return NextResponse.json(
      { ...result, reviewRequired: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "识别失败";
    const known = /图片|OCR|尚未安装/.test(message);
    return NextResponse.json(
      { error: known ? message : "OCR 处理失败或超时，请重试或手动录入。" },
      { status: 422 },
    );
  } finally {
    active = false;
  }
}
