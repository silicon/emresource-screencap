import argparse
import os
import sys
from pathlib import Path

from emresource_screencap.scrape import run_scrape


def _build_parser() -> argparse.ArgumentParser:
    epilog = """Environment:
  EMRESOURCE_USERNAME   Account email or username (required).
  EMRESOURCE_PASSWORD   Account password (required).
  EMRESOURCE_USER_AGENT Optional User-Agent (disables per-run rotation from the built-in pool).

By default a persistent Chromium profile is used (cookies/session reuse) under the
cache directory (see --profile-dir). Use --ephemeral for a fresh session each run.

If Okta shows hCaptcha after the email step, use --headed to solve it (and a larger
--timeout-ms if needed), or keep the default profile so the challenge is skipped.

Ubuntu / headless servers: after `poetry install`, install the browser and OS deps:
  poetry run playwright install chromium
  poetry run playwright install-deps chromium
"""
    p = argparse.ArgumentParser(
        prog="emresource-scrape",
        description=(
            "Log in to EMResource, optionally select a region when that UI is shown, "
            "and save a full-page screenshot."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=epilog,
    )
    p.add_argument(
        "-o",
        "--output",
        default="output.png",
        help="Screenshot path: .png, .jpg/.jpeg, or .webp (default: output.png)",
    )
    p.add_argument(
        "--region",
        default="Central AZ",
        help='Region label when a region control exists (default: "Central AZ")',
    )
    p.add_argument(
        "--require-region",
        action="store_true",
        help="Fail if no region dropdown appears within --timeout-ms (default: still capture)",
    )
    p.add_argument(
        "--skip-region",
        action="store_true",
        help="Do not wait for region selection (faster when that step never appears)",
    )
    p.add_argument(
        "--headed",
        action="store_true",
        help="Show the browser window (default is headless)",
    )
    p.add_argument(
        "--timeout-ms",
        type=int,
        default=60_000,
        metavar="MS",
        help="Default Playwright timeout in milliseconds (default: 60000)",
    )
    p.add_argument(
        "--slow-mo-ms",
        type=int,
        default=50,
        metavar="MS",
        help="Delay in ms between Playwright actions (0 = off; default: 50)",
    )
    p.add_argument(
        "--user-agent",
        default=None,
        metavar="STRING",
        help="Fixed HTTP User-Agent (disables rotation; env EMRESOURCE_USER_AGENT same)",
    )
    p.add_argument(
        "--no-rotate-user-agent",
        action="store_true",
        help="Use the first built-in User-Agent every run instead of random from the pool",
    )
    p.add_argument(
        "--channel",
        default=None,
        metavar="NAME",
        help="Browser channel for launch, e.g. chrome or msedge (uses installed browser)",
    )
    p.add_argument(
        "--ephemeral",
        action="store_true",
        help="Do not reuse an on-disk browser profile (fresh context each run)",
    )
    p.add_argument(
        "--profile-dir",
        type=Path,
        default=None,
        metavar="DIR",
        help=(
            "Chromium user-data directory for persistent profile "
            "(default: $XDG_CACHE_HOME/emresource-scrape/chromium-profile or "
            "~/.cache/emresource-scrape/chromium-profile)"
        ),
    )
    p.add_argument(
        "--storage-state",
        type=Path,
        default=None,
        metavar="JSON",
        help="With --ephemeral, load Playwright storage state if this file exists",
    )
    p.add_argument(
        "--save-storage-state",
        type=Path,
        default=None,
        metavar="JSON",
        help="With --ephemeral, save storage state to this path after a successful run",
    )
    p.add_argument(
        "--no-humanize",
        action="store_true",
        help="Disable random pauses and slower typing (faster, more bot-like)",
    )
    p.add_argument(
        "--no-stealth",
        action="store_true",
        help="Disable playwright-stealth init scripts on the browser context",
    )
    return p


def main() -> None:
    args = _build_parser().parse_args()
    username = os.environ.get("EMRESOURCE_USERNAME", "").strip()
    password = os.environ.get("EMRESOURCE_PASSWORD", "")
    if not username or not password:
        print(
            "Set EMRESOURCE_USERNAME and EMRESOURCE_PASSWORD in the environment.",
            file=sys.stderr,
        )
        sys.exit(1)
    try:
        raw_ua = (
            args.user_agent or os.environ.get("EMRESOURCE_USER_AGENT") or ""
        ).strip()
        run_scrape(
            output_path=Path(args.output),
            username=username,
            password=password,
            region=args.region,
            headed=args.headed,
            timeout_ms=args.timeout_ms,
            channel=args.channel,
            ephemeral=args.ephemeral,
            humanize=not args.no_humanize,
            profile_dir=args.profile_dir,
            require_region=args.require_region,
            rotate_user_agent=not args.no_rotate_user_agent,
            save_storage_state=args.save_storage_state,
            skip_region=args.skip_region,
            slow_mo_ms=args.slow_mo_ms,
            stealth=not args.no_stealth,
            storage_state_path=args.storage_state,
            user_agent=raw_ua or None,
        )
    except Exception as exc:
        print(exc, file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
