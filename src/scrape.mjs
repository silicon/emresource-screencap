import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import Hero from "@ulixee/hero-playground";

import { DEFAULT_VIEWPORT } from "./constants.mjs";
import { runLoginFlow } from "./flow.mjs";

function resolveViewport() {
  const raw = process.env.EMRESOURCE_VIEWPORT?.trim();
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

function screenshotOptionsForPath(outputPath) {
  const lower = outputPath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return { fullPage: true, format: "jpeg", quality: 90 };
  }
  if (lower.endsWith(".webp")) {
    return { fullPage: true, format: "webp", quality: 90 };
  }
  return { fullPage: true, format: "png" };
}

function resolveOutputPath(outputPath) {
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

async function waitShellReady(hero, timeoutMs) {
  const per = Math.min(Math.max(12_000, Math.floor(timeoutMs / 3)), 45_000, timeoutMs);
  const safe = Math.max(5000, per);
  try {
    await hero.waitForPaintingStable({ timeoutMs: safe });
  } catch {}
  await hero.waitForMillis(400);
}

export async function runScrape(options) {
  const {
    outputPath,
    username,
    password,
    region,
    headed,
    timeoutMs,
    requireRegion,
    skipRegion,
  } = options;

  const out = resolveOutputPath(outputPath);
  await mkdir(dirname(out), { recursive: true });

  const hero = new Hero({
    showChrome: headed,
    showChromeInteractions: headed,
    viewport: resolveViewport(),
  });

  try {
    await runLoginFlow(hero, {
      username,
      password,
      region,
      skipRegion,
      requireRegion,
      timeoutMs,
    });
    await waitShellReady(hero, timeoutMs);
    const shotOpts = screenshotOptionsForPath(out);
    let buf;
    try {
      buf = await hero.takeScreenshot(shotOpts);
    } catch {
      buf = await hero.takeScreenshot({ fullPage: true });
    }
    await writeFile(out, buf);
    return out;
  } finally {
    try {
      await hero.close();
    } catch {}
  }
}
