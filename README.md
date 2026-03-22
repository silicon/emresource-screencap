# emresource-screencap

Small CLI that drives Chromium with [Ulixee Hero](https://ulixee.org) to sign in to [EMResource](https://emresource.juvare.com) (Okta/Juvare flow), optionally pick a region when that UI appears, and save a **full-page** screenshot (PNG, JPEG, or WebP).

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
emresource-scrape -o dashboard.png
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
