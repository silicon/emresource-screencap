import { resolve } from "node:path";

import { DEFAULT_VIEWPORT } from "./constants.mjs";

export function resolveViewport(env = process.env) {
  const raw = env.EMRESOURCE_VIEWPORT?.trim();
  if (!raw) return DEFAULT_VIEWPORT;
  const m = /^(\d+)\s*[xX]\s*(\d+)$/.exec(raw);
  if (!m) return DEFAULT_VIEWPORT;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (width < 800 || height < 600 || width > 7680 || height > 4320) {
    return DEFAULT_VIEWPORT;
  }
  return { ...DEFAULT_VIEWPORT, width, height };
}

export function screenshotOptionsForPath(outputPath) {
  const lower = outputPath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return { fullPage: true, format: "jpeg", quality: 90 };
  }
  if (lower.endsWith(".webp")) {
    return { fullPage: true, format: "webp", quality: 90 };
  }
  return { fullPage: true, format: "png" };
}

export function resolveOutputPath(outputPath) {
  const p = resolve(outputPath);
  const lower = p.toLowerCase();
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp")
  ) {
    return p;
  }
  return `${p}.png`;
}
