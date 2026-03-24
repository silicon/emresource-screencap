#!/usr/bin/env node
import { parseArgs } from "node:util";

import { runScrape } from "./src/scrape.mjs";

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
    "no-session-reuse": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`emresource-screencap — EMResource login + full-page screenshot (Ulixee Hero)

Environment:
  EMRESOURCE_USERNAME   Account email or username (required)
  EMRESOURCE_PASSWORD   Account password (required)
  EMRESOURCE_TARGET_URL First URL for session reuse (default: base/login URL)
  EMRESOURCE_SESSION_DIR Optional Hero session database directory

Options:
  -o, --output PATH     Screenshot path: .png, .jpg, .webp (default: output.png)
  --region LABEL        Region when that UI appears (default: Central AZ)
  --require-region      Fail if no region control appears in time
  --skip-region         Do not wait for region selection
  --headed              Show the browser (needed to complete hCaptcha/CAPTCHA manually)
  --timeout-ms MS       Default Hero timeout (default: 60000)
  --no-session-reuse    Skip warm navigation; always run the full login flow
  -h, --help            Show this help
`);
  process.exit(0);
}

const timeoutMs = Number.parseInt(values["timeout-ms"], 10) || 60_000;

(async () => {
  try {
    const out = await runScrape({
      outputPath: values.output,
      username,
      password,
      region: values.region,
      headed: values.headed,
      timeoutMs,
      requireRegion: values["require-region"],
      skipRegion: values["skip-region"],
      trySessionReuse: !values["no-session-reuse"],
    });
    console.log("emresource-screencap: saved", out);
  } catch (err) {
    console.error(err?.message ?? err);
    process.exit(2);
  }
})();
