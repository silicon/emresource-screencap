import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { runScrape } from "../src/scrape.mjs";
import { startFixtureServer } from "./fixtures/server.mjs";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test(
  "runScrape against local fixture produces non-empty PNG",
  { timeout: 180_000 },
  async () => {
    const { baseUrl, close } = await startFixtureServer();
    const dir = await mkdtemp(join(tmpdir(), "hero-e2e-"));
    const outPath = join(dir, "capture.png");
    try {
      await runScrape({
        baseUrl,
        outputPath: outPath,
        username: "fixture-user",
        password: "fixture-pass",
        region: "Central AZ",
        headed: false,
        timeoutMs: 120_000,
        skipRegion: true,
        requireRegion: false,
      });
      const buf = await readFile(outPath);
      assert.ok(buf.length > 0);
      assert.equal(Buffer.compare(buf.subarray(0, 4), PNG_MAGIC), 0);
    } finally {
      await close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
