import { NextRequest, NextResponse } from "next/server";
import { inspectPdf } from "@/lib/pdf-server";
export const runtime = "nodejs";
let active = false;
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") || request.nextUrl.host;
  const protocol =
    (request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      request.nextUrl.protocol.replace(":", "")) + ":";
  if (origin && origin !== `${protocol}//${host}`)
    return NextResponse.json(
      { error: "只接受本站发起的导入请求。" },
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
    if (!reader) throw Error("请选择 PDF。");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 129 * 1024 * 1024) {
        await reader.cancel();
        return NextResponse.json(
          { error: "请求超过 128 MiB 文件限制。" },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    const form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw Error("请选择 PDF。");
    const result = await inspectPdf(
      new Uint8Array(await file.arrayBuffer()),
      Number(form.get("start")),
      Number(form.get("end")),
      form.get("ocr") === "1",
      request.signal,
    );
    return NextResponse.json(
      { ...result, reviewRequired: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error: /^请选择|^每次/.test(message)
          ? message
          : "PDF 无法解析、页范围无效或处理超时。请检查文件是否加密，缩小页范围后重试。",
      },
      { status: 422 },
    );
  } finally {
    active = false;
  }
}
