# emresource-screencap

Small CLI that drives Chromium with [Playwright](https://playwright.dev/python/) to sign in to [EMResource](https://emresource.juvare.com) (Okta/Juvare flow), optionally pick a region when that UI appears, and save a **full-page** screenshot (PNG, JPEG, or WebP). It uses a persistent browser profile by default so repeat runs can reuse cookies and often avoid interactive challenges.

## Requirements

- Python 3.11+
- [Poetry](https://python-poetry.org/) for dependency management

## Install

```bash
poetry install --with dev
poetry run playwright install chromium
```

On Linux servers or minimal images you may also need OS libraries:

```bash
poetry run playwright install-deps chromium
```

## Configuration

Set credentials in the environment (never commit them):

| Variable | Required | Purpose |
|----------|----------|---------|
| `EMRESOURCE_USERNAME` | Yes | Account email or username |
| `EMRESOURCE_PASSWORD` | Yes | Account password |
| `EMRESOURCE_USER_AGENT` | No | Fixed User-Agent; if unset, the CLI can rotate from a built-in pool |

## Usage

Entry point: `emresource-scrape` (from `[tool.poetry.scripts]`).

```bash
export EMRESOURCE_USERNAME='you@example.com'
export EMRESOURCE_PASSWORD='…'
poetry run emresource-scrape -o dashboard.png
```

Useful flags (see `poetry run emresource-scrape --help` for the full list):

- `--headed` — show the browser (needed if Okta shows hCaptcha in headless mode)
- `--region` — region label when a dropdown exists (default: `Central AZ`)
- `--require-region` — fail if no region control appears within the timeout
- `--skip-region` — do not wait for region selection
- `--ephemeral` — fresh context each run (no on-disk profile)
- `--profile-dir` — override the persistent Chromium user-data directory
- `--timeout-ms` — default Playwright timeout

## Development

Format and lint (matches CI-style checks via pre-commit):

```bash
poetry run ruff format .
poetry run ruff check .
```

Install Git hooks so the same checks run on commit:

```bash
poetry run pre-commit install
poetry run pre-commit run --all-files
```

Use only in line with EMResource’s terms of use and your organization’s access policies.
