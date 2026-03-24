import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import Hero from "@ulixee/hero-playground";

import { BASE_URL } from "./constants.mjs";
import {
  needsFullLogin,
  runLoginFlow,
  waitPaintingStableLenient,
} from "./flow.mjs";
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

function resolveTargetUrl(options) {
  if (options?.targetUrl?.trim()) return options.targetUrl.trim();
  const fromEnv = process.env.EMRESOURCE_TARGET_URL?.trim();
  if (fromEnv) return fromEnv;
  return resolveFlowBaseUrl(options);
}

function resolveSessionDir(options) {
  if (options?.sessionDir?.trim()) return options.sessionDir.trim();
  return process.env.EMRESOURCE_SESSION_DIR?.trim() ?? "";
}

export function buildHeroOptions(options) {
  const headed = Boolean(options?.headed);
  const sessionDir = resolveSessionDir(options);
  const heroOpts = {
    showChrome: headed,
    showChromeInteractions: false,
    viewport: resolveViewport(),
  };
  if (sessionDir) {
    heroOpts.sessionDbDirectory = sessionDir;
    heroOpts.sessionPersistence = true;
  }
  return heroOpts;
}

export function bootHero(options) {
  return new Hero(buildHeroOptions(options));
}

async function waitShellReady(hero, timeoutMs) {
  const per = Math.min(Math.max(12_000, Math.floor(timeoutMs / 3)), 45_000, timeoutMs);
  const safe = Math.max(5000, per);
  try {
    await hero.waitForPaintingStable({ timeoutMs: safe });
  } catch {}
  await hero.waitForMillis(400);
}

async function tryWarmSession(hero, options) {
  const targetUrl = resolveTargetUrl(options);
  const timeoutMs = options.timeoutMs ?? 60_000;
  await hero.goto(targetUrl, {
    timeoutMs: Math.max(timeoutMs, 120_000),
  });
  await waitPaintingStableLenient(hero, timeoutMs);
  await hero.waitForMillis(400);
  return !(await needsFullLogin(hero));
}

export async function runJob(hero, options) {
  const {
    outputPath,
    username,
    password,
    region,
    timeoutMs = 60_000,
    requireRegion,
    skipRegion,
    trySessionReuse = true,
  } = options;

  const out = resolveOutputPath(outputPath);
  await mkdir(dirname(out), { recursive: true });

  const flowOpts = {
    username,
    password,
    region,
    skipRegion,
    requireRegion,
    timeoutMs,
    baseUrl: resolveFlowBaseUrl(options),
  };

  if (trySessionReuse) {
    const reused = await tryWarmSession(hero, options);
    if (!reused) {
      await runLoginFlow(hero, flowOpts);
    }
  } else {
    await runLoginFlow(hero, flowOpts);
  }

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
}

export async function runScrape(options) {
  const hero = bootHero(options);
  try {
    return await runJob(hero, options);
  } finally {
    if (hero) {
      try {
        await hero.close();
      } catch {}
    }
  }
}
