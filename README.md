# emresource-screencap

Small CLI that drives Chromium with [Ulixee Hero](https://ulixee.org) to sign in to [EMResource](https://emresource.juvare.com) (Okta/Juvare flow), optionally pick a region when that UI appears, and save a **full-page** screenshot (PNG, JPEG, or WebP). The browser uses a **large default viewport** (1920×1200) so layouts and tables have room to render before capture; override with `EMRESOURCE_VIEWPORT` if needed.

## Requirements

- Node.js 18+
- npm (or pnpm/yarn)

## Install

```bash
npm install
```

Hero needs a pinned Chromium from **`@ulixee/chrome-139-0`** (listed as a direct dependency). Do **not** use `npm install --ignore-scripts`, or the browser binary may never download and you will see errors like “Failed to launch chrome” / “Please re-install the browser engine”. If that happens, run `npm install` again with scripts enabled, or `npm rebuild @ulixee/chrome-139-0`.

The npm package can be present while the **executable is still missing**: Ulixee’s `postinstall` downloads Chrome into your cache (e.g. under `~/.cache/.../ulixee/chrome/` on Linux), and that step can fail quietly. If the error tells you to reinstall the engine but `npm rebuild` does not help—especially on **Linux arm64**—use a **system Chromium/Chrome** and point Hero at it with **`CHROME_139_BIN`** (see the table below).

**Do not** set `CHROME_139_BIN` to a path under **`/usr/bin`** (or other root-owned dirs): Ulixee writes a **`.validated` marker file next to the binary** (`dirname(CHROME_139_BIN)/.validated`). That fails with `EACCES: permission denied` for normal users. Instead, symlink the real binary into a directory you own, then point the env var at the symlink:

```bash
mkdir -p ~/.local/bin
ln -sf "$(command -v chromium)" ~/.local/bin/emresource-chromium
export CHROME_139_BIN="$HOME/.local/bin/emresource-chromium"
```

Use a current **LTS** Node if native addons (e.g. `better-sqlite3` under Hero) fail to build on bleeding-edge Node.

## Configuration

Set credentials in the environment (never commit them):

| Variable | Required | Purpose |
|----------|----------|---------|
| `EMRESOURCE_USERNAME` | Yes | Account email or username |
| `EMRESOURCE_PASSWORD` | Yes | Account password |
| `EMRESOURCE_VIEWPORT` | No | Browser viewport `WIDTHxHEIGHT` (e.g. `2560x1440`). Default is `1920x1200`. |
| `EMRESOURCE_BASE_URL` | No | Override the login URL (defaults to production). Used by tests and scripts; programmatic `runScrape({ baseUrl })` wins over this env var when set. |
| `CHROME_139_BIN` | No | Absolute path to a Chrome/Chromium **139.x** binary when the bundled engine from `@ulixee/chrome-139-0` is missing or will not run (common on **Linux arm64**). Use a path in a **writable** directory (e.g. `~/.local/bin/...` via symlink); not `/usr/bin/...` (see Install note above). |

## Testing

Fast checks (CLI subprocess smoke tests and pure helper unit tests; no browser):

```bash
npm test
```

Hero integration test against a local HTTP fixture (starts Chromium via Ulixee Hero; slower):

```bash
npm run test:e2e
```

On **Linux CI** (e.g. Ubuntu), ensure Chromium/OS libraries Hero needs are installed—the same system packages you use for Puppeteer/Playwright Chromium often apply. Run Hero tests **serialized** (one process) if you see core conflicts. **macOS** often works without extra setup.

## Usage

After `npm install`, run:

```bash
export EMRESOURCE_USERNAME='you@example.com'
export EMRESOURCE_PASSWORD='…'
node cli.mjs -o dashboard.png
```

Or:

```bash
npm start -- -o dashboard.png
```

With a global link from the repo root:

```bash
npm link
emresource-screencap -o dashboard.png
```

Useful flags (see `node cli.mjs --help`):

- `--headed` — show the browser (needed if Okta shows hCaptcha; headless cannot solve interactive challenges)
- `--region` — region label when a dropdown exists (default: `Central AZ`)
- `--require-region` — exit with an error if no region control appears within the timeout
- `--skip-region` — do not wait for region selection
- `--timeout-ms` — default timeout for Hero interactions and painting-stable waits (default: `60000`). Use a higher value (e.g. `120000`) on slow networks or if you see `Timeout waiting for navigation "PaintingStable"`.

### hCaptcha / CAPTCHA

Okta/Juvare may show a **human verification** step. This tool does not and cannot solve CAPTCHAs automatically—that is intentional.

**Practical options (comply with EMResource / your org’s policies):**

1. **`--headed`** — Open a real browser window so you can complete the challenge yourself. Increase **`--timeout-ms`** (e.g. `300000`) so the run does not exit while you work.
2. **Run from an environment similar to normal use** — Very locked-down or “datacenter” networks sometimes see challenges more often. Same VPN or office network as interactive login can help; there are no guarantees.
3. **Ask your organization** — IT may offer **SSO**, **device trust**, or a **staging** tenant with relaxed checks for automation. Juvare may document supported integration paths.
4. **Session reuse (if policy allows)** — After a manual login in a normal browser, some teams export cookies into a profile Hero can load; that is not implemented here and must match your security rules.

Third-party “CAPTCHA solving” services are a poor fit for production credentials and often violate terms of use.

**If challenges started only after recent updates**, consider:

- **Browser binary** — `CHROME_139_BIN` (e.g. system Chromium on arm64) uses a **different** fingerprint than the bundled `@ulixee/chrome-139-0`. When the bundled engine runs on your machine, try **unset** `CHROME_139_BIN` and compare behavior.
- **More automation on the login page** — Extra waits, fallback selector paths, and optional “Sign In” / “Log In” clicks mean **more DOM events** than a minimal flow; risk systems may react. Okta/org policies and IP reputation also change over time.

## Development

Generic Git hooks (trailing whitespace, YAML, etc.):

```bash
npx pre-commit install
npx pre-commit run --all-files
```

Use only in line with EMResource’s terms of use and your organization’s access policies.
