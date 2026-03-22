import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "cli.mjs");

function runCli(args, { withoutCredentials = false, env = {} } = {}) {
  const merged = { ...process.env };
  if (withoutCredentials) {
    delete merged.EMRESOURCE_USERNAME;
    delete merged.EMRESOURCE_PASSWORD;
  }
  Object.assign(merged, env);
  return execFileAsync(process.execPath, [cli, ...args], {
    cwd: root,
    env: merged,
  });
}

test("cli --help exits 0 and prints usage", async () => {
  const { stdout, stderr } = await runCli(["--help"]);
  assert.equal(stderr, "");
  assert.match(stdout, /EMRESOURCE_USERNAME/);
  assert.match(stdout, /--region/);
  assert.match(stdout, /Ulixee Hero/);
});

test("cli -h exits 0", async () => {
  const { stdout } = await runCli(["-h"]);
  assert.match(stdout, /EMRESOURCE_USERNAME/);
});

test("cli without credentials exits 1 and mentions env", async () => {
  await assert.rejects(
    () => runCli([], { withoutCredentials: true }),
    (err) => {
      assert.equal(err.code, 1);
      assert.match(err.stderr, /EMRESOURCE_USERNAME/);
      assert.match(err.stderr, /EMRESOURCE_PASSWORD/);
      return true;
    },
  );
});

test("cli without username exits 1", async () => {
  await assert.rejects(
    () =>
      runCli([], {
        withoutCredentials: true,
        env: { EMRESOURCE_PASSWORD: "x" },
      }),
    (err) => {
      assert.equal(err.code, 1);
      return true;
    },
  );
});
