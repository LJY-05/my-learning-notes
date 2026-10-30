import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const book = "合成图验收（非用户原图）";
async function state<T>(page: Page, read: (data: any) => T): Promise<T> {
  const d = await page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const r = indexedDB.open("mistake-lab", 1);
        r.onsuccess = () => {
          const db = r.result;
          const q = db
            .transaction("workspace")
            .objectStore("workspace")
            .get("data");
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
          q.onerror = () => reject(q.error);
        };
        r.onerror = () => reject(r.error);
      }),
  );
  return read(d);
}
async function upload(page: Page, two = true) {
  await page.goto("/reader");
  await page.getByRole("button", { name: "上传书页", exact: true }).click();
  await page
    .getByLabel("选择书页图片")
    .setInputFiles(
      two
        ? [
            "output/test-fixtures/page-19.png",
            "output/test-fixtures/page-20.png",
          ]
        : ["output/test-fixtures/page-19.png"],
    );
  await page.getByLabel("习题册名称", { exact: true }).fill(book);
  await page.getByLabel("章节", { exact: true }).fill("人工合成验收章");
  await page.getByLabel("原书起始页码").fill("19");
  await page
    .getByRole("button", { name: "导入并开始阅读", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `${book} 第 19 页`, exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("原书页码", { exact: true })).toHaveValue("19");
}
async function selectQuestion(page: Page) {
  const paper = page.getByLabel("书页框选区域", { exact: true });
  await expect(paper.locator("img")).toBeVisible();
  await paper.locator("img").evaluate(async (element) => {
    const img = element as HTMLImageElement;
    if (!img.complete)
      await new Promise((r) => img.addEventListener("load", r, { once: true }));
  });
  await paper.evaluate((el) => el.scrollIntoView({ block: "start" }));
  const b = await paper.boundingBox();
  if (!b) throw Error("No page image");
  await page.mouse.move(b.x + b.width * 0.0596, b.y + b.height * 0.1069);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.9423, b.y + b.height * 0.2834, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "保存片段，继续下一页", exact: true }),
  ).toBeVisible();
}
test.use({ reducedMotion: "reduce" });
let pageErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
});
test.afterEach(async () => {
  expect(pageErrors).toEqual([]);
});
test("原图字节保留，110% 缩放裁剪逐像素一致，页码与草稿刷新后保留", async ({
  page,
}) => {
  await upload(page);
  await page.getByRole("button", { name: "放大书页", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "重置缩放", exact: true }),
  ).toHaveText("110%");
  await selectQuestion(page);
  await page
    .getByRole("button", { name: "保存片段，继续下一页", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "跨页采集篮" })).toBeVisible();
  await expect
    .poll(() => state(page, (d) => d?.captureDraft?.fragments.length))
    .toBe(1);
  const precision = await page.evaluate(async () => {
    const d: any = await new Promise((resolve) => {
      const r = indexedDB.open("mistake-lab");
      r.onsuccess = () => {
        const db = r.result,
          q = db.transaction("workspace").objectStore("workspace").get("data");
        q.onsuccess = () => {
          resolve(q.result);
          db.close();
        };
      };
    });
    const f = d.captureDraft.fragments[0],
      asset = d.assets.find((a: any) => a.id === f.sourceId);
    async function image(url: string) {
      const i = new Image();
      i.src = url;
      await i.decode();
      return i;
    }
    const original = await image(asset.originalDataUrl),
      cropped = await image(f.crop),
      preview = await image(d.pages.find((p: any) => p.id === f.pageId).image);
    const c = document.createElement("canvas");
    c.width = original.naturalWidth;
    c.height = original.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(original, 0, 0);
    const expected = ctx.getImageData(
      f.pixels.x,
      f.pixels.y,
      f.pixels.width,
      f.pixels.height,
    ).data;
    const actualCanvas = document.createElement("canvas");
    actualCanvas.width = cropped.naturalWidth;
    actualCanvas.height = cropped.naturalHeight;
    const actualCtx = actualCanvas.getContext("2d")!;
    actualCtx.drawImage(cropped, 0, 0);
    const actual = actualCtx.getImageData(
      0,
      0,
      cropped.naturalWidth,
      cropped.naturalHeight,
    ).data;
    const hash = async (b: ArrayBuffer) =>
      Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b)))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
    return {
      originalWidth: f.originalWidth,
      previewWidth: preview.naturalWidth,
      cropWidth: cropped.naturalWidth,
      metadataWidth: f.pixels.width,
      pixelsEqual:
        expected.length === actual.length &&
        expected.every((v, i) => v === actual[i]),
      sourceHash: await hash(
        await (await fetch(asset.originalDataUrl)).arrayBuffer(),
      ),
      pageNumber: f.pageNumber,
      originalFileUsed: f.originalFileUsed,
    };
  });
  expect(precision.originalWidth).toBe(2600);
  expect(precision.previewWidth).toBeLessThan(2600);
  expect(precision.originalFileUsed).toBe(true);
  expect(precision.pixelsEqual).toBe(true);
  expect(precision.cropWidth).toBe(precision.metadataWidth);
  expect(precision.pageNumber).toBe(19);
  expect(precision.sourceHash).toBe(
    createHash("sha256")
      .update(await readFile("output/test-fixtures/page-19.png"))
      .digest("hex"),
  );
  await page.reload();
  await expect(page.getByRole("region", { name: "跨页采集篮" })).toBeVisible();
  expect(
    await state(page, (d) => d.captureDraft.fragments[0].pixels),
  ).toBeTruthy();
});
test("真实中文 OCR 只写草稿，核对门禁与改动后重置生效，不自动写入答案", async ({
  page,
}) => {
  await upload(page, false);
  await selectQuestion(page);
  await page
    .getByRole("button", { name: "识别并核对题目", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const save = page.getByRole("button", {
    name: "确认校对并保存题目",
    exact: true,
  });
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "执行真实 OCR", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "将识别建议应用到右侧草稿", exact: true }),
  ).toBeEnabled({ timeout: 65000 });
  await expect
    .poll(
      () => state(page, (d) => d.captureDraft.fragments[0].ocr?.text || ""),
      { timeout: 65000 },
    )
    .toContain("遗传");
  await page
    .getByRole("button", { name: "将识别建议应用到右侧草稿", exact: true })
    .click();
  await expect(page.getByLabel("核对题号", { exact: true })).toHaveValue("19");
  expect(
    await page.getByLabel("核对题干", { exact: true }).inputValue(),
  ).toContain("身心发展");
  await page.getByLabel("核对题型", { exact: true }).selectOption("多选题");
  await page
    .getByLabel("核对选项", { exact: true })
    .fill("A. 遗传\nB. 环境\nC. 教育\nD. 个体主观能动性");
  await page.getByLabel("已核对题干与选项").check();
  await page.getByLabel("已核对题型和跨页完整性").check();
  await expect(save).toBeEnabled();
  await page
    .getByLabel("核对题目摘要", { exact: true })
    .fill("OCR 人工核对验收");
  await expect(save).toBeDisabled();
  await page.getByLabel("已核对题干与选项").check();
  await page.getByLabel("已核对题型和跨页完整性").check();
  await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(() =>
      state(page, (d) =>
        d.questions.some((q: any) => q.title === "OCR 人工核对验收"),
      ),
    )
    .toBe(true);
  const q = await state(page, (d) =>
    d.questions.find((q: any) => q.title === "OCR 人工核对验收"),
  );
  expect(q.answer).toBe("");
  expect(q.answerId).toBeUndefined();
  expect(q.extraction.method).toBe("ocr");
  expect(q.extraction.rawText).toContain("遗传");
  expect(q.options).toHaveLength(4);
  expect(q.fragments[0].originalWidth).toBe(2600);
  expect(await state(page, (d) => d.captureDraft)).toBeUndefined();
  await page.goto(`/question?id=${q.id}`);
  await expect(
    page.getByRole("list", { name: "题目选项" }).locator("li"),
  ).toHaveCount(4);
  await expect(page.locator(".saved-ocr")).toContainText("遗传");
});
test("跨页采集、排序、刷新和人工合并只生成一道题，每段可回到原书", async ({
  page,
}) => {
  await upload(page);
  await selectQuestion(page);
  await page
    .getByRole("button", { name: "保存片段，继续下一页", exact: true })
    .click();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByLabel("原书页码", { exact: true })).toHaveValue("20");
  await selectQuestion(page);
  await page
    .getByRole("button", { name: "保存片段，继续下一页", exact: true })
    .click();
  await expect
    .poll(() => state(page, (d) => d.captureDraft?.fragments.length))
    .toBe(2);
  await page.reload();
  await expect(page.getByRole("region", { name: "跨页采集篮" })).toContainText(
    "2/5",
  );
  await page
    .getByRole("button", { name: "合并核对并归档", exact: true })
    .click();
  await page.getByRole("button", { name: "上移片段 2", exact: true }).click();
  await expect
    .poll(() => state(page, (d) => d.captureDraft.fragments[0].pageNumber))
    .toBe(20);
  await page.getByRole("button", { name: "下移片段 1", exact: true }).click();
  await page.getByLabel("核对题目摘要", { exact: true }).fill("跨页填空验收");
  await page.getByLabel("核对题号", { exact: true }).fill("1");
  await page.getByLabel("核对题型", { exact: true }).selectOption("填空题");
  await page
    .getByLabel("核对题干", { exact: true })
    .fill("前页题干，续页补充，请填写____。");
  await page.getByLabel("已核对题干与选项").check();
  await page.getByLabel("已核对题型和跨页完整性").check();
  await page
    .getByRole("button", { name: "确认校对并保存题目", exact: true })
    .click();
  await expect
    .poll(() =>
      state(
        page,
        (d) =>
          d.questions.filter((q: any) => q.title === "跨页填空验收").length,
      ),
    )
    .toBe(1);
  const q = await state(page, (d) =>
    d.questions.find((q: any) => q.title === "跨页填空验收"),
  );
  expect(q.fragments.map((f: any) => f.pageNumber)).toEqual([19, 20]);
  expect(q.answer).toBe("");
  await page.goto(`/question?id=${q.id}`);
  await page
    .getByRole("button", { name: "片段 2 · 第 20 页", exact: true })
    .click();
  await expect(page.locator(".original-highlight")).toBeVisible();
  const href = await page
    .getByRole("link", { name: "回到原书位置", exact: true })
    .getAttribute("href");
  expect(href).toContain(q.fragments[1].pageId);
  await page.getByRole("link", { name: "回到原书位置", exact: true }).click();
  await expect(page.getByLabel("原书页码", { exact: true })).toHaveValue("20");
  await expect(
    page.getByRole("link", { name: "查看第 1 题", exact: true }),
  ).toBeVisible();
});
test("OCR 服务真实可用，拒绝跨来源和非 PNG 内容", async ({ request }) => {
  const capability = await request.get("/api/ocr");
  expect((await capability.json()).available).toBe(true);
  const forbidden = await request.post("/api/ocr", {
    headers: { origin: "https://example.com" },
    data: "x",
  });
  expect(forbidden.status()).toBe(403);
  const bad = await request.post("/api/ocr", {
    multipart: {
      image: {
        name: "bad.png",
        mimeType: "image/png",
        buffer: Buffer.from("not a png"),
      },
    },
  });
  expect(bad.status()).toBe(422);
});

test.describe("手机触屏采集", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("触屏框选保留原图像素，人工核对弹窗无横向溢出", async ({ page }) => {
    await upload(page, false);
    const paper = page.getByLabel("书页框选区域", { exact: true });
    await paper.locator("img").evaluate(async (element) => {
      const img = element as HTMLImageElement;
      await img.decode();
    });
    await paper.evaluate((el) => el.scrollIntoView({ block: "start" }));
    const b = await paper.boundingBox();
    if (!b) throw Error("Missing paper");
    const c = await page.context().newCDPSession(page);
    const x = b.x + b.width * 0.06,
      y = b.y + b.height * 0.107;
    await c.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let i = 1; i <= 12; i++)
      await c.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: x + (b.width * 0.88 * i) / 12,
            y: y + (b.height * 0.176 * i) / 12,
          },
        ],
      });
    await c.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page
      .getByRole("button", { name: "识别并核对题目", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const f = await state(page, (d) => d.captureDraft.fragments[0]);
    expect(f.originalWidth).toBe(2600);
    expect(f.originalFileUsed).toBe(true);
    const overflow = await page.evaluate(() => {
      const modal = document.querySelector("[role=dialog]") as HTMLElement;
      return {
        page: document.documentElement.scrollWidth > innerWidth + 1,
        modal: modal.scrollWidth > modal.clientWidth + 1,
      };
    });
    expect(overflow).toEqual({ page: false, modal: false });
    await expect(
      page.getByRole("button", { name: "确认校对并保存题目", exact: true }),
    ).toBeDisabled();
    await page.screenshot({ path: "output/playwright/ocr-review-mobile.png" });
  });
});
