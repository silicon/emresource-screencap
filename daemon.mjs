#!/usr/bin/env node
import { parseArgs } from "node:util";

import { bootHero, runJob } from "./src/scrape.mjs";

const username = process.env.EMRESOURCE_USERNAME?.trim();
const password = process.env.EMRESOURCE_PASSWORD ?? "";

if (!username || !password) {
  console.error(
    "Set EMRESOURCE_USERNAME and EMRESOURCE_PASSWORD in the environment.",
  );
  process.exit(1);
}

const { values } = parseArgs({
  allowPositionals: false,
  options: {
    output: { type: "string", short: "o", default: "output.png" },
    region: { type: "string", default: "Central AZ" },
    "require-region": { type: "boolean", default: false },
    "skip-region": { type: "boolean", default: false },
    headed: { type: "boolean", default: false },
    "timeout-ms": { type: "string", default: "60000" },
    "interval-ms": { type: "string", default: "60000" },
    once: { type: "boolean", default: false },
    "no-session-reuse": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`emresource-screencap-daemon — one browser, loop: warm session / login + screenshot

Environment:
  EMRESOURCE_USERNAME       Required
  EMRESOURCE_PASSWORD       Required
  EMRESOURCE_BASE_URL       Login flow URL (default production)
  EMRESOURCE_TARGET_URL     First navigation for reuse check (default: same as base)
  EMRESOURCE_SESSION_DIR    Optional Hero session DB directory (disk persistence)

Options:
  -o, --output PATH     Screenshot path (default: output.png)
  --region, --headed, --timeout-ms, --skip-region, --require-region (same as cli.mjs)
  --interval-ms MS      Pause after each successful job (default: 60000)
  --once                  Single job then exit
  --no-session-reuse      Skip warm session; always full login
  -h, --help
`);
  process.exit(0);
}

const timeoutMs = Number.parseInt(values["timeout-ms"], 10) || 60_000;
const intervalMs = Number.parseInt(values["interval-ms"], 10) || 60_000;
const trySessionReuse = !values["no-session-reuse"];

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

(async () => {
  const optsBase = {
    outputPath: values.output,
    username,
    password,
    region: values.region,
    headed: values.headed,
    timeoutMs,
    requireRegion: values["require-region"],
    skipRegion: values["skip-region"],
    trySessionReuse,
  };

  const hero = bootHero(optsBase);

  const shutdown = async () => {
    try {
      await hero.close();
    } catch {}
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    while (true) {
      try {
        const out = await runJob(hero, optsBase);
        console.log("emresource-screencap-daemon: saved", out);
      } catch (err) {
        console.error("emresource-screencap-daemon:", err?.message ?? err);
      }
      if (values.once) break;
      await delay(intervalMs);
    }
  } finally {
    try {
      await hero.close();
    } catch {}
  }
})();
