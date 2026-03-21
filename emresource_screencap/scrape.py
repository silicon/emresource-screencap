import os
import random
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import Error
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

BASE_URL = "https://emresource.juvare.com"

REGION_CONTROL_SELECTOR = (
    'select:visible, [role="combobox"]:visible, [aria-haspopup="listbox"]:visible'
)

USER_AGENT_POOL = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/144.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/145.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; arm64 Mac OS X 14_6_0) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/144.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; arm64 Mac OS X 14_6_0) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/145.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/144.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/145.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/145.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/144.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/145.0.0.0 Safari/537.36",
)

DEFAULT_VIEWPORT = {"width": 1710, "height": 1112}

CHROMIUM_LAUNCH_ARGS = [
    "--disable-blink-features=AutomationControlled",
]


def default_persistent_profile_dir() -> Path:
    xdg = (os.environ.get("XDG_CACHE_HOME") or "").strip()
    base = Path(xdg) if xdg else Path.home() / ".cache"
    d = (base / "emresource-scrape" / "chromium-profile").resolve()
    d.mkdir(parents=True, exist_ok=True)
    return d


def _human_pause(lo_s: float, hi_s: float) -> None:
    time.sleep(random.uniform(lo_s, hi_s))


def _pick_user_agent(explicit: str | None, *, rotate: bool) -> str:
    raw = (explicit or "").strip()
    if raw:
        return raw
    if rotate:
        return random.choice(USER_AGENT_POOL)
    return USER_AGENT_POOL[0]


def _navigator_platform_for_ua(ua: str) -> str:
    if "X11; Linux" in ua or "Linux x86_64" in ua:
        return "Linux x86_64"
    if "Macintosh" in ua or "Mac OS X" in ua:
        return "MacIntel"
    if "Windows" in ua:
        return "Win32"
    return "Linux x86_64"


def _apply_playwright_stealth(context, ua: str) -> None:
    Stealth(
        navigator_user_agent_override=ua,
        navigator_platform_override=_navigator_platform_for_ua(ua),
    ).apply_stealth_sync(context)


def _visible_username_locator(page):
    by_identifier = page.locator(
        'input[name="identifier"]:visible, input[autocomplete="identifier"]:visible, '
        "#input27:visible"
    )
    by_css_legacy = page.locator(
        'input[type="email"]:visible, input[name="email"]:visible, #email:visible, '
        'input[name="loginName"]:visible, #username:visible'
    )
    by_aria = page.get_by_role(
        "textbox",
        name=re.compile(r"email|username", re.I),
    ).locator(":visible")
    return by_identifier.or_(by_css_legacy).or_(by_aria).first


def _reliable_fill(
    locator,
    value: str,
    timeout_ms: int,
    *,
    humanize: bool = False,
    verify: bool = True,
) -> None:
    key_delay = random.randint(40, 95) if humanize else 25
    locator.wait_for(state="visible", timeout=timeout_ms)
    locator.scroll_into_view_if_needed(timeout=timeout_ms)
    if humanize:
        _human_pause(0.05, 0.22)
    locator.click(timeout=timeout_ms)
    if humanize:
        _human_pause(0.08, 0.28)
    locator.fill(value, force=True)
    if verify and locator.input_value() == value:
        return
    locator.fill("", force=True)
    locator.press_sequentially(value, delay=key_delay)
    if verify and locator.input_value() == value:
        return
    locator.evaluate(
        """(el, v) => {
            el.value = v;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        }""",
        value,
    )


def _visible_password_locator(root):
    by_css = root.locator(
        'input[type="password"]:visible, '
        'input[name="credentials.passcode"]:visible, '
        'input[name="password"]:visible, '
        'input[name="passwd"]:visible, '
        'input[autocomplete="current-password"]:visible, '
        'input[autocomplete="password"]:visible, '
        "#password:visible, "
        "#okta-signin-password:visible, "
        '[data-se="password-input"]:visible'
    )
    by_ph = root.get_by_placeholder(re.compile(r"password|passcode", re.I)).locator(
        ":visible",
    )
    by_aria = root.get_by_role(
        "textbox",
        name=re.compile(r"password|passcode", re.I),
    ).locator(":visible")
    by_label = root.get_by_label(
        re.compile(r"password|passcode", re.I),
    ).locator(":visible")
    return by_css.or_(by_ph).or_(by_aria).or_(by_label).first


def _find_visible_password_any_frame(page, budget_ms: int):
    deadline = time.monotonic() + budget_ms / 1000.0
    while time.monotonic() < deadline:
        remaining_ms = int(max(400, (deadline - time.monotonic()) * 1000))
        frames = list(page.frames)
        n = max(1, len(frames))
        slice_ms = max(500, min(3_000, remaining_ms // n))
        for fr in frames:
            if fr.is_detached():
                continue
            candidates = (
                fr.locator('input[name="credentials.passcode"]').first,
                _visible_password_locator(fr),
                fr.locator('input[type="password"]').first,
            )
            for loc in candidates:
                try:
                    loc.wait_for(state="visible", timeout=slice_ms)
                    return loc
                except PlaywrightTimeoutError:
                    continue
                except Error as e:
                    if _recoverable_playwright_target_error(e):
                        continue
                    raise
        try:
            page.wait_for_timeout(150)
        except Error as e:
            if page.is_closed():
                break
            if not _recoverable_playwright_target_error(e):
                raise
    return None


def _resolve_visible_password_locator(
    page,
    timeout_ms: int,
    *,
    headed: bool,
    humanize: bool,
):
    probe = min(6_000, max(3_000, timeout_ms // 6))
    pwd = _find_visible_password_any_frame(page, probe)
    if pwd is not None:
        return pwd
    next_clicked = _try_click_visible_next_any_frame(page, timeout_ms)
    if next_clicked:
        if humanize:
            _human_pause(0.25, 0.65)
        try:
            page.wait_for_load_state(
                "domcontentloaded",
                timeout=min(15_000, timeout_ms),
            )
        except PlaywrightTimeoutError:
            pass
    pwd = _find_visible_password_any_frame(page, timeout_ms)
    if pwd is not None:
        return pwd
    if _page_has_hcaptcha(page):
        parts = [
            "hCaptcha is present on the Okta/Juvare login flow; the password field is "
            "not available in any frame until the challenge completes.",
        ]
        if not headed:
            parts.append(
                "Headless mode cannot complete CAPTCHAs; use --headed and solve the "
                "challenge in the browser window.",
            )
        else:
            parts.append(
                "Complete the challenge in the browser window before the timeout.",
            )
        parts.append(
            "Increase wait time if needed (e.g. --timeout-ms 300000). "
            "Reusing an existing persistent profile often skips the challenge.",
        )
        raise RuntimeError(" ".join(parts))
    raise PlaywrightTimeoutError(
        "Password field not visible in any frame (including OAuth iframes).",
    )


def _try_click_visible_log_in(page, timeout_ms: int) -> bool:
    t = max(1_000, min(5_000, timeout_ms))
    for role in ("button", "link"):
        loc = page.get_by_role(role, name="Log In", exact=True)
        for i in range(loc.count()):
            cand = loc.nth(i)
            if cand.is_visible(timeout=t):
                cand.click()
                return True
    return False


def _try_click_visible_next(root, timeout_ms: int) -> bool:
    t = max(1_000, min(10_000, timeout_ms))
    for role in ("button", "link"):
        loc = root.get_by_role(role, name="Next", exact=True)
        for i in range(loc.count()):
            cand = loc.nth(i)
            if cand.is_visible(timeout=t):
                cand.click()
                return True
    for role in ("button", "link"):
        loc = root.get_by_role(role, name=re.compile(r"^\s*next\s*$", re.I))
        for i in range(loc.count()):
            cand = loc.nth(i)
            if cand.is_visible(timeout=t):
                cand.click()
                return True
    return False


def _try_click_visible_next_any_frame(page, timeout_ms: int) -> bool:
    budget = min(8_000, max(2_000, timeout_ms // 15))
    for fr in list(page.frames):
        if fr.is_detached():
            continue
        if _try_click_visible_next(fr, budget):
            return True
    return False


def _try_click_visible_verify(page, timeout_ms: int) -> bool:
    t = max(1_000, min(10_000, timeout_ms))
    for role in ("button", "link"):
        loc = page.get_by_role(role, name="Verify", exact=True)
        for i in range(loc.count()):
            cand = loc.nth(i)
            if cand.is_visible(timeout=t):
                cand.click()
                return True
    for role in ("button", "link"):
        loc = page.get_by_role(role, name=re.compile(r"^\s*verify\s*$", re.I))
        for i in range(loc.count()):
            cand = loc.nth(i)
            if cand.is_visible(timeout=t):
                cand.click()
                return True
    return False


def _click_log_in_as_different_user(page, timeout_ms: int) -> None:
    t = min(5_000, timeout_ms)
    pat = re.compile(r"different\s+user", re.I)
    for role in ("button", "link"):
        loc = page.get_by_role(role, name=pat)
        if loc.count() > 0 and loc.first.is_visible(timeout=t):
            loc.first.click()
            return
    loose = page.get_by_text(re.compile(r"log\s+in\s+as\s+different\s+user", re.I))
    if loose.count() > 0 and loose.first.is_visible(timeout=t):
        loose.first.click()
        return
    exact = page.get_by_text("Log in as different user", exact=True)
    if exact.count() > 0 and exact.first.is_visible(timeout=t):
        exact.first.click()


def _reveal_username_password_form(page, timeout_ms: int) -> None:
    if _try_click_visible_log_in(page, timeout_ms):
        user = _visible_username_locator(page)
        if user.count() > 0 and user.is_visible(timeout=min(3_000, timeout_ms)):
            return
    _click_log_in_as_different_user(page, timeout_ms)


def _ensure_login_form(page, timeout_ms: int) -> None:
    user = _visible_username_locator(page)
    if user.count() > 0 and user.is_visible(timeout=min(5_000, timeout_ms)):
        return
    _reveal_username_password_form(page, timeout_ms)
    user = _visible_username_locator(page)
    user.wait_for(state="visible", timeout=timeout_ms)


def _page_has_hcaptcha(page) -> bool:
    for fr in list(page.frames):
        if fr.is_detached():
            continue
        try:
            u = (fr.url or "").lower()
        except Error:
            continue
        if "hcaptcha.com" in u or "hcaptcha" in u:
            return True
    return False


def _recoverable_playwright_target_error(exc: BaseException) -> bool:
    s = str(exc).lower()
    return any(
        m in s
        for m in (
            "closed",
            "detached",
            "destroyed",
            "execution context",
            "navigation",
            "target closed",
        )
    )


def _submit_login(
    page,
    username: str,
    password: str,
    timeout_ms: int,
    *,
    headed: bool,
    humanize: bool = False,
) -> None:
    email = _visible_username_locator(page)
    _reliable_fill(email, username, timeout_ms, humanize=humanize, verify=True)
    if humanize:
        _human_pause(0.18, 0.55)
    pwd = _resolve_visible_password_locator(
        page,
        timeout_ms,
        headed=headed,
        humanize=humanize,
    )
    _reliable_fill(pwd, password, timeout_ms, humanize=humanize, verify=True)
    if humanize:
        _human_pause(0.35, 1.0)
    if _try_click_visible_verify(page, timeout_ms):
        if humanize:
            _human_pause(0.2, 0.55)
        try:
            page.wait_for_load_state(
                "domcontentloaded",
                timeout=min(15_000, timeout_ms),
            )
        except PlaywrightTimeoutError:
            pass
        return
    if _try_click_visible_next(page, timeout_ms):
        return
    submit = page.get_by_role("button", name="Log In", exact=True)
    if submit.count() == 0:
        submit = page.get_by_role("button", name=re.compile(r"^\s*log\s*in\s*$", re.I))
    if submit.count() == 0:
        submit = page.get_by_role("button", name=re.compile(r"log\s*in", re.I))
    submit.first.click()


def _select_region(root, region: str, timeout_ms: int) -> None:
    visible_selects = root.locator("select:visible")
    if visible_selects.count() > 0:
        sel = visible_selects.first
        try:
            sel.select_option(label=region, timeout=timeout_ms)
            return
        except Error:
            try:
                sel.select_option(label=region.strip(), timeout=timeout_ms)
                return
            except Error:
                pass
    comboboxes = root.get_by_role("combobox")
    if comboboxes.count() > 0:
        comboboxes.first.click(timeout=timeout_ms)
        opt = root.get_by_role("option", name=re.compile(re.escape(region), re.I))
        if opt.count() == 0:
            opt = root.get_by_role("menuitem", name=re.compile(re.escape(region), re.I))
        if opt.count() == 0:
            opt = root.get_by_text(region, exact=True)
        opt.first.click(timeout=timeout_ms)
        return
    list_triggers = root.locator('[aria-haspopup="listbox"]:visible')
    if list_triggers.count() > 0:
        list_triggers.first.click(timeout=timeout_ms)
        opt = root.get_by_role("option", name=re.compile(re.escape(region), re.I))
        if opt.count() == 0:
            opt = root.get_by_role("menuitem", name=re.compile(re.escape(region), re.I))
        if opt.count() == 0:
            opt = root.get_by_text(region, exact=True)
        opt.first.click(timeout=timeout_ms)
        return
    raise RuntimeError("Could not find a region dropdown (select or combobox).")


def _select_region_anywhere(page, region: str, timeout_ms: int) -> None:
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
        if page.is_closed():
            raise RuntimeError(
                "Browser or tab was closed before region selection finished.",
            )
        remaining_ms = int(max(500, (deadline - time.monotonic()) * 1000))
        for fr in list(page.frames):
            if fr.is_detached():
                continue
            loc = fr.locator(REGION_CONTROL_SELECTOR).first
            per = min(15_000, remaining_ms)
            try:
                loc.wait_for(state="visible", timeout=per)
            except PlaywrightTimeoutError:
                continue
            except Error as e:
                if _recoverable_playwright_target_error(e):
                    continue
                raise
            try:
                _select_region(fr, region, min(timeout_ms, remaining_ms))
                return
            except Error as e:
                if _recoverable_playwright_target_error(e):
                    return
                raise
        try:
            page.wait_for_timeout(300)
        except Error as e:
            if page.is_closed():
                raise RuntimeError(
                    "Browser or tab was closed while waiting for the region UI.",
                ) from e
            if not _recoverable_playwright_target_error(e):
                raise
    raise PlaywrightTimeoutError(
        f"Region UI not visible in any frame ({REGION_CONTROL_SELECTOR})",
    )


def _maybe_select_region(
    page,
    region: str,
    timeout_ms: int,
    *,
    require_region: bool,
) -> None:
    if require_region:
        _select_region_anywhere(page, region, timeout_ms)
        return
    try:
        _select_region_anywhere(page, region, timeout_ms)
    except PlaywrightTimeoutError:
        print(
            "emresource-scrape: region UI not found; saving screenshot of the "
            "current page (use --require-region to fail instead, or "
            "--skip-region to skip waiting).",
            file=sys.stderr,
        )


def _click_visible_next_if_any(page, timeout_ms: int) -> None:
    budget = min(8_000, max(2_000, timeout_ms // 15))
    for fr in page.frames:
        if _try_click_visible_next(fr, budget):
            try:
                page.wait_for_load_state(
                    "domcontentloaded", timeout=min(20_000, timeout_ms)
                )
            except PlaywrightTimeoutError:
                pass
            return


def _wait_for_shell_ready(page, timeout_ms: int) -> None:
    if page.is_closed():
        return
    per = min(max(12_000, timeout_ms // 3), 45_000, timeout_ms)
    if per < 5_000:
        per = min(5_000, timeout_ms)
    try:
        page.wait_for_load_state("load", timeout=per)
    except PlaywrightTimeoutError:
        pass
    except Error:
        if page.is_closed():
            return
        raise
    try:
        page.wait_for_load_state("networkidle", timeout=per)
    except PlaywrightTimeoutError:
        pass
    except Error:
        if page.is_closed():
            return
        raise
    try:
        page.evaluate(
            """() => new Promise((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            })""",
        )
    except Error:
        pass


def _screenshot_target(path: Path) -> tuple[Path, str]:
    s = path.suffix.lower()
    if s in (".jpg", ".jpeg"):
        return path, "jpeg"
    if s == ".webp":
        return path, "webp"
    if s == ".png":
        return path, "png"
    if path.suffix:
        return path.with_suffix(".png"), "png"
    return path.with_name(path.name + ".png"), "png"


def run_scrape(
    output_path: Path,
    username: str,
    password: str,
    region: str,
    headed: bool,
    timeout_ms: int,
    *,
    channel: str | None = None,
    ephemeral: bool = False,
    humanize: bool = True,
    profile_dir: Path | None = None,
    require_region: bool = False,
    rotate_user_agent: bool = True,
    save_storage_state: Path | None = None,
    skip_region: bool = False,
    slow_mo_ms: int = 50,
    stealth: bool = True,
    storage_state_path: Path | None = None,
    user_agent: str | None = None,
) -> None:
    output_path = output_path.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ua = _pick_user_agent(user_agent, rotate=rotate_user_agent)
    ctx_opts = {
        "color_scheme": "light",
        "locale": "en-US",
        "timezone_id": "America/Phoenix",
        "user_agent": ua,
        "viewport": DEFAULT_VIEWPORT,
    }
    use_persistent = not ephemeral
    profile_path = None
    if use_persistent:
        profile_path = (
            (profile_dir or default_persistent_profile_dir()).expanduser().resolve()
        )
        profile_path.mkdir(parents=True, exist_ok=True)
    state_file = (
        storage_state_path.expanduser().resolve()
        if storage_state_path is not None
        else None
    )
    save_state_file = (
        save_storage_state.expanduser().resolve()
        if save_storage_state is not None
        else None
    )
    with sync_playwright() as p:
        browser = None
        context = None
        try:
            if use_persistent:
                persist_kw = {
                    "user_data_dir": str(profile_path),
                    "args": list(CHROMIUM_LAUNCH_ARGS),
                    "headless": not headed,
                    "slow_mo": slow_mo_ms,
                    **ctx_opts,
                }
                if channel:
                    persist_kw["channel"] = channel
                context = p.chromium.launch_persistent_context(**persist_kw)
                if stealth:
                    _apply_playwright_stealth(context, ua)
                page = context.pages[0] if context.pages else context.new_page()
            else:
                launch_kw = {
                    "args": list(CHROMIUM_LAUNCH_ARGS),
                    "headless": not headed,
                    "slow_mo": slow_mo_ms,
                }
                if channel:
                    launch_kw["channel"] = channel
                browser = p.chromium.launch(**launch_kw)
                new_kw = dict(ctx_opts)
                if state_file is not None and state_file.is_file():
                    new_kw["storage_state"] = str(state_file)
                context = browser.new_context(**new_kw)
                if stealth:
                    _apply_playwright_stealth(context, ua)
                page = context.new_page()
            page.set_default_timeout(timeout_ms)
            page.goto(BASE_URL, wait_until="domcontentloaded")
            if humanize:
                _human_pause(0.35, 1.0)
            _ensure_login_form(page, timeout_ms)
            if humanize:
                _human_pause(0.2, 0.55)
            _submit_login(
                page,
                username,
                password,
                timeout_ms,
                headed=headed,
                humanize=humanize,
            )
            page.wait_for_load_state("domcontentloaded")
            try:
                page.wait_for_load_state("load", timeout=min(20_000, timeout_ms))
            except PlaywrightTimeoutError:
                pass
            if humanize:
                _human_pause(0.25, 0.65)
            if not skip_region:
                region_ms = timeout_ms if require_region else min(timeout_ms, 20_000)
                _maybe_select_region(
                    page,
                    region,
                    region_ms,
                    require_region=require_region,
                )
            if humanize:
                _human_pause(0.3, 0.75)
            _click_visible_next_if_any(page, timeout_ms)
            _wait_for_shell_ready(page, timeout_ms)
            shot_path, shot_type = _screenshot_target(output_path)
            shot_path.parent.mkdir(parents=True, exist_ok=True)
            skw = {
                "path": str(shot_path),
                "full_page": True,
                "type": shot_type,
            }
            if shot_type == "jpeg":
                skw["quality"] = 90
            page.screenshot(**skw)
            if save_state_file is not None and not use_persistent:
                save_state_file.parent.mkdir(parents=True, exist_ok=True)
                context.storage_state(path=str(save_state_file))
        finally:
            if context is not None:
                try:
                    context.close()
                except Error:
                    pass
            if browser is not None:
                try:
                    browser.close()
                except Error:
                    pass
