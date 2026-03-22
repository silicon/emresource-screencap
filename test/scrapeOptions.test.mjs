import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { DEFAULT_VIEWPORT } from "../src/constants.mjs";
import {
  resolveOutputPath,
  resolveViewport,
  screenshotOptionsForPath,
} from "../src/scrapeOptions.mjs";

test("resolveOutputPath appends .png when no extension", async () => {
  const dir = await mkdtemp(join(tmpdir(), "scrape-opt-"));
  try {
    const base = join(dir, "shot");
    assert.match(resolveOutputPath(base), /\.png$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("resolveOutputPath keeps known image extensions", () => {
  assert.match(resolveOutputPath("/tmp/a.PNG"), /\.PNG$/i);
  assert.match(resolveOutputPath("/tmp/x.jpg"), /\.jpg$/);
  assert.match(resolveOutputPath("/tmp/x.jpeg"), /\.jpeg$/);
  assert.match(resolveOutputPath("/tmp/x.webp"), /\.webp$/);
});

test("resolveViewport default matches DEFAULT_VIEWPORT", () => {
  assert.deepEqual(resolveViewport({}), DEFAULT_VIEWPORT);
});

test("resolveViewport parses WxH", () => {
  const v = resolveViewport({ EMRESOURCE_VIEWPORT: "1920x1200" });
  assert.equal(v.width, 1920);
  assert.equal(v.height, 1200);
  assert.equal(v.deviceScaleFactor, DEFAULT_VIEWPORT.deviceScaleFactor);
});

test("resolveViewport garbage falls back to default", () => {
  assert.deepEqual(
    resolveViewport({ EMRESOURCE_VIEWPORT: "not-a-viewport" }),
    DEFAULT_VIEWPORT,
  );
});

test("resolveViewport out of range falls back", () => {
  assert.deepEqual(
    resolveViewport({ EMRESOURCE_VIEWPORT: "100x100" }),
    DEFAULT_VIEWPORT,
  );
});

test("screenshotOptionsForPath png vs jpeg vs webp", () => {
  assert.deepEqual(screenshotOptionsForPath("/a.png"), {
    fullPage: true,
    format: "png",
  });
  assert.deepEqual(screenshotOptionsForPath("/a.JPG"), {
    fullPage: true,
    format: "jpeg",
    quality: 90,
  });
  assert.deepEqual(screenshotOptionsForPath("/a.jpeg"), {
    fullPage: true,
    format: "jpeg",
    quality: 90,
  });
  assert.deepEqual(screenshotOptionsForPath("/a.webp"), {
    fullPage: true,
    format: "webp",
    quality: 90,
  });
});
