# emresource-screencap

Small CLI that drives Chromium with [Ulixee Hero](https://ulixee.org) to sign in to [EMResource](https://emresource.juvare.com) (Okta/Juvare flow), optionally pick a region when that UI appears, and save a **full-page** screenshot (PNG, JPEG, or WebP). The browser uses a **large default viewport** (1920×1200) so layouts and tables have room to render before capture; override with `EMRESOURCE_VIEWPORT` if needed.

## Requirements

- Node.js 18+
- npm (or pnpm/yarn)

## Install

```bash
npm install
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
- `--timeout-ms` — default timeout for Hero interactions (default: `60000`)

## Development

Generic Git hooks (trailing whitespace, YAML, etc.):

```bash
npx pre-commit install
npx pre-commit run --all-files
```

Use only in line with EMResource’s terms of use and your organization’s access policies.
