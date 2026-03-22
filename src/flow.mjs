import { KeyboardKey } from "@ulixee/hero-playground";

import {
  BASE_URL,
  NEXT_SELECTORS,
  PASSWORD_SELECTORS,
  REGION_CONTROL_SELECTORS,
  USERNAME_SELECTORS,
} from "./constants.mjs";

export async function scrollThenClick(hero, el) {
  const ready = await hero.waitForElement(el, {
    waitForVisible: true,
    waitForClickable: true,
    timeoutMs: 20_000,
  });
  if (!ready) {
    throw new Error("element did not become clickable");
  }
  await hero.scrollTo(ready);
  await hero.waitForMillis(200);
  await hero.click(ready);
}

async function firstVisibleMatchInFrame(hero, frame, selectors) {
  for (const sel of selectors) {
    try {
      const nl = await frame.document.querySelectorAll(sel);
      const len = await nl.length;
      for (let i = 0; i < len; i++) {
        const el = await nl[i];
        if (el && (await hero.isElementVisible(el))) return el;
      }
    } catch {}
  }
  return null;
}

export async function firstVisibleMatchAllFrames(hero, selectors) {
  let frames;
  try {
    frames = await hero.frameEnvironments;
  } catch {
    frames = [];
  }
  for (const frame of frames) {
    try {
      const el = await firstVisibleMatchInFrame(hero, frame, selectors);
      if (el) return el;
    } catch {}
  }
  return null;
}

function xpathExactButtonOrLink(label) {
  const q = label.includes("'") ? `"${label}"` : `'${label}'`;
  return (
    `//a[normalize-space(.)=${q}] | //button[normalize-space(.)=${q}] | ` +
    `//input[@type='submit' and @value=${q}] | //input[@type='button' and @value=${q}]`
  );
}

const XPATH_NEXT_CASE_INSENSITIVE =
  "//a[translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')='next'] | " +
  "//button[translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')='next'] | " +
  "//input[(@type='submit' or @type='button') and " +
  "translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')='next']";

async function firstVisibleXPathInFrames(hero, xpath) {
  const frames = await hero.frameEnvironments;
  for (const frame of frames) {
    try {
      const nodes = await frame.xpathSelectorAll(xpath);
      for (const el of nodes) {
        if (await hero.isElementVisible(el)) return el;
      }
    } catch {}
  }
  return null;
}

async function tryClickExactLabel(hero, label) {
  const el = await firstVisibleXPathInFrames(
    hero,
    xpathExactButtonOrLink(label),
  );
  if (!el) return false;
  try {
    await scrollThenClick(hero, el);
    await hero.waitForMillis(1200);
    return true;
  } catch {
    return false;
  }
}

async function findSubmitInIdentifierForm(hero) {
  const xpath =
    "//input[@name='identifier' or @autocomplete='identifier']/ancestor::form[1]" +
    "//*[self::button or self::input[@type='submit']]";
  const frames = await hero.frameEnvironments;
  let fallback = null;
  for (const frame of frames) {
    try {
      const nodes = await frame.xpathSelectorAll(xpath);
      for (const el of nodes) {
        if (!(await hero.isElementVisible(el))) continue;
        if (!fallback) fallback = el;
        try {
          if (await el.$isClickable) return el;
        } catch {
          return el;
        }
      }
    } catch {}
  }
  return fallback;
}

async function findNextButton(hero) {
  let el = await firstVisibleXPathInFrames(hero, xpathExactButtonOrLink("Next"));
  if (!el) el = await firstVisibleXPathInFrames(hero, XPATH_NEXT_CASE_INSENSITIVE);
  if (!el) el = await firstVisibleMatchAllFrames(hero, NEXT_SELECTORS);
  return el;
}

function xpathOptionMatchingRegion(region) {
  const needle = region.trim().toLowerCase().replace(/'/g, "");
  const q = `'${needle}'`;
  return (
    "//*[self::option or self::li[@role='option'] or @role='menuitem' or @role='option']" +
    "[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), " +
    `${q})]`
  );
}

async function trySelectNativeRegion(hero, region) {
  const r = region.trim().toLowerCase();
  const frames = await hero.frameEnvironments;
  for (const frame of frames) {
    try {
      const nl = await frame.document.querySelectorAll("select");
      const len = await nl.length;
      for (let i = 0; i < len; i++) {
        const sel = await nl[i];
        if (!(await hero.isElementVisible(sel))) continue;
        const opts = await sel.querySelectorAll("option");
        const olen = await opts.length;
        for (let j = 0; j < olen; j++) {
          const opt = await opts[j];
          const text = ((await opt.textContent) ?? "").trim().toLowerCase();
          if (text === r || text.includes(r) || r.includes(text)) {
            await scrollThenClick(hero, sel);
            await hero.waitForMillis(250);
            await hero.click(opt, { clickVerification: "none" });
            return true;
          }
        }
      }
    } catch {}
  }
  return false;
}

async function waitForRegionControl(hero, maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const el = await firstVisibleMatchAllFrames(hero, REGION_CONTROL_SELECTORS);
    if (el) return el;
    await hero.waitForMillis(350);
  }
  return null;
}

async function clickNextForRegionStep(hero) {
  const nextEl = await findNextButton(hero);
  if (!nextEl) return false;
  const ready = await hero.waitForElement(nextEl, {
    waitForVisible: true,
    waitForClickable: true,
    timeoutMs: 15_000,
  });
  if (ready) {
    try {
      await scrollThenClick(hero, ready);
      return true;
    } catch {}
  }
  try {
    await nextEl.$click("none");
    return true;
  } catch {
    try {
      await hero.scrollTo(nextEl);
      await hero.waitForMillis(150);
      await hero.click(nextEl, { clickVerification: "none" });
      return true;
    } catch {
      return false;
    }
  }
}

async function selectRegionAndClickNext(hero, region, maxWaitMs) {
  const control = await waitForRegionControl(hero, maxWaitMs);
  if (!control) {
    console.error(
      "emresource-scrape: Region control not visible (select / combobox / listbox).",
    );
    return false;
  }

  if (await trySelectNativeRegion(hero, region)) {
    await hero.waitForMillis(400);
    await hero.waitForPaintingStable();
    return clickNextForRegionStep(hero);
  }

  await scrollThenClick(hero, control);
  await hero.waitForMillis(450);

  const opt = await firstVisibleXPathInFrames(
    hero,
    xpathOptionMatchingRegion(region),
  );
  if (!opt) {
    console.error("emresource-scrape: Could not find region option:", region);
    return false;
  }
  try {
    await scrollThenClick(hero, opt);
  } catch {
    await opt.$click("none");
  }

  await hero.waitForMillis(400);
  await hero.waitForPaintingStable();
  return clickNextForRegionStep(hero);
}

async function hasPasswordField(hero) {
  return (await firstVisibleMatchAllFrames(hero, PASSWORD_SELECTORS)) != null;
}

async function submitIdentifierStep(hero, userEl) {
  await hero.waitForMillis(500);

  await hero.click(userEl, { clickVerification: "none" });
  await hero.waitForMillis(150);

  const formSubmitEl = await findSubmitInIdentifierForm(hero);
  if (formSubmitEl) {
    const ready = await hero.waitForElement(formSubmitEl, {
      waitForVisible: true,
      waitForClickable: true,
      timeoutMs: 15_000,
    });

    let usedHumanClick = false;
    if (ready) {
      try {
        await scrollThenClick(hero, ready);
        usedHumanClick = true;
      } catch {}
    }
    if (!usedHumanClick) {
      try {
        await formSubmitEl.$click("none");
      } catch {
        try {
          await hero.scrollTo(formSubmitEl);
          await hero.waitForMillis(150);
          await hero.click(formSubmitEl, { clickVerification: "none" });
        } catch {}
      }
    }
    await hero.waitForMillis(2800);
    if (await hasPasswordField(hero)) return;
  }

  await hero.interact({ keyPress: KeyboardKey.Enter });
  await hero.waitForMillis(2800);
  if (await hasPasswordField(hero)) return;

  const nextEl = await findNextButton(hero);

  if (nextEl) {
    try {
      await nextEl.$click("none");
    } catch {
      try {
        await hero.scrollTo(nextEl);
        await hero.waitForMillis(150);
        await hero.click(nextEl, { clickVerification: "none" });
      } catch {}
    }
    await hero.waitForMillis(2800);
    if (await hasPasswordField(hero)) return;
  }

  await hero.interact({ keyPress: KeyboardKey.Enter });
  await hero.waitForMillis(400);
  await hero.interact({ keyPress: KeyboardKey.Space });
  await hero.waitForMillis(2800);
  if (await hasPasswordField(hero)) return;

  const deadline = Date.now() + 18_000;
  while (Date.now() < deadline) {
    let el = await findSubmitInIdentifierForm(hero);
    if (!el) el = await findNextButton(hero);
    if (el) {
      try {
        await el.$click("none");
        await hero.waitForMillis(1500);
        if (await hasPasswordField(hero)) return;
      } catch {}
    }
    await hero.waitForMillis(450);
  }

  console.log(
    "emresource-scrape: identifier step did not reach password field; check hCaptcha or UI state",
  );
}

async function tryClickLogIn(hero) {
  if (await tryClickExactLabel(hero, "Log In")) return true;
  const hints = [
    'input[type="submit"][value="Log In"]',
    'input[type="button"][value="Log In"]',
    "a.button-primary",
    ".button-primary",
  ];
  const el = await firstVisibleMatchAllFrames(hero, hints);
  if (!el) return false;
  try {
    await scrollThenClick(hero, el);
    await hero.waitForMillis(1200);
    return true;
  } catch {
    return false;
  }
}

async function waitForUsernameField(hero, maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const el = await firstVisibleMatchAllFrames(hero, USERNAME_SELECTORS);
    if (el) return el;
    await hero.waitForMillis(400);
  }
  return null;
}

export async function clickVisibleNextIfAny(hero, timeoutMs) {
  const budget = Math.min(8000, Math.max(2000, Math.floor(timeoutMs / 15)));
  const deadline = Date.now() + budget;
  while (Date.now() < deadline) {
    if (await tryClickExactLabel(hero, "Next")) {
      await hero.waitForMillis(400);
      return;
    }
    await hero.waitForMillis(350);
  }
}

export async function runLoginFlow(hero, options) {
  const {
    username,
    password,
    region,
    skipRegion,
    requireRegion,
    timeoutMs,
    baseUrl = BASE_URL,
  } = options;

  await hero.goto(baseUrl, { timeoutMs: Math.max(timeoutMs, 120_000) });
  await hero.waitForPaintingStable();
  await hero.waitForMillis(800);

  let userEl = await waitForUsernameField(hero, 20_000);
  if (!userEl) {
    console.log("emresource-scrape: trying Log In to reveal form…");
    await tryClickLogIn(hero);
    userEl = await waitForUsernameField(hero, 25_000);
  }
  if (!userEl) {
    throw new Error(
      "No username/email field found (checked all frames). Current URL: " +
        (await hero.url),
    );
  }

  await scrollThenClick(hero, userEl);
  await hero.type(username);

  await submitIdentifierStep(hero, userEl);
  await hero.waitForMillis(2500);
  await hero.waitForPaintingStable();

  let passEl = await firstVisibleMatchAllFrames(hero, PASSWORD_SELECTORS);
  if (!passEl) {
    await hero.waitForMillis(2000);
    passEl = await firstVisibleMatchAllFrames(hero, PASSWORD_SELECTORS);
  }
  if (passEl) {
    await scrollThenClick(hero, passEl);
    await hero.type(password);
  }

  if (await tryClickExactLabel(hero, "Verify")) {
    await hero.waitForMillis(800);
  } else {
    const submit = await firstVisibleMatchAllFrames(hero, [
      'input[type="submit"][value="Log In"]',
      'input[type="submit"][value="Verify"]',
    ]);
    if (submit) await scrollThenClick(hero, submit);
  }

  if (!skipRegion) {
    const regionMs = requireRegion ? timeoutMs : Math.min(timeoutMs, 20_000);
    const regionOk = await selectRegionAndClickNext(hero, region, regionMs);
    if (!regionOk) {
      if (requireRegion) {
        throw new Error(
          "Region UI not found or region selection did not complete in time.",
        );
      }
      console.error(
        "emresource-scrape: region UI not found or selection incomplete; continuing " +
          "(use --require-region to fail, --skip-region to skip waiting).",
      );
    }
  }

  await clickVisibleNextIfAny(hero, timeoutMs);
}
