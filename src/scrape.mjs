import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import Hero from "@ulixee/hero-playground";

import { BASE_URL } from "./constants.mjs";
import { runLoginFlow } from "./flow.mjs";
import {
  resolveOutputPath,
  resolveViewport,
  screenshotOptionsForPath,
} from "./scrapeOptions.mjs";

function resolveFlowBaseUrl(options) {
  if (options?.baseUrl?.trim()) return options.baseUrl.trim();
  const fromEnv = process.env.EMRESOURCE_BASE_URL?.trim();
  if (fromEnv) return fromEnv;
  return BASE_URL;
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
      baseUrl: resolveFlowBaseUrl(options),
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
