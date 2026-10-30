"use client";
import { pixelBounds } from "./capture";
import type { Rect } from "./data";
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(Error("原图加载失败，请重新上传该书页。"));
    image.src = url;
  });
}
export async function cropOriginal(url: string, rect: Rect) {
  const image = await loadImage(url);
  const pixels = pixelBounds(rect, image.naturalWidth, image.naturalHeight);
  if (pixels.width * pixels.height > 20_000_000)
    throw Error("单片段超过 2000 万像素，请缩小框选范围。");
  const canvas = document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("浏览器不支持裁剪。");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    image,
    pixels.x,
    pixels.y,
    pixels.width,
    pixels.height,
    0,
    0,
    pixels.width,
    pixels.height,
  );
  return {
    crop: canvas.toDataURL("image/png"),
    pixels,
    originalWidth: image.naturalWidth,
    originalHeight: image.naturalHeight,
  };
}
export async function mergePreview(crops: string[]) {
  if (crops.length === 1) return crops[0];
  const images = await Promise.all(crops.map(loadImage));
  const width = Math.min(1400, Math.max(...images.map((i) => i.naturalWidth)));
  const heights = images.map((i) => (i.naturalHeight * width) / i.naturalWidth);
  const rawHeight =
    heights.reduce((a, b) => a + b, 0) + 24 * (images.length - 1);
  const scale = Math.min(1, 12000 / rawHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(rawHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("无法生成合并预览。");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  images.forEach((image, i) => {
    ctx.drawImage(
      image,
      0,
      Math.round(y * scale),
      canvas.width,
      Math.round(heights[i] * scale),
    );
    y += heights[i] + 24;
  });
  return canvas.toDataURL("image/png");
}
