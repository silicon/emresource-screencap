export const BASE_URL = "https://emresource.juvare.com";

export const DEFAULT_VIEWPORT = {
  width: 1920,
  height: 1200,
  deviceScaleFactor: 1,
};

export const USERNAME_SELECTORS = [
  'input[name="identifier"]',
  'input[autocomplete="identifier"]',
  "#input27",
  'input[type="email"]',
  'input[name="email"]',
  "#email",
  'input[name="loginName"]',
  "#username",
];

export const NEXT_SELECTORS = [
  '[data-se="next"]',
  'button[data-se="submit"]',
  "#idp-discovery-submit",
  "#okta-signin-submit",
  'input[type="submit"][value="Next"]',
  'input[type="button"][value="Next"]',
];

export const PASSWORD_SELECTORS = [
  'input[name="credentials.passcode"]',
  'input[type="password"]',
  'input[name="password"]',
  'input[name="passwd"]',
  'input[autocomplete="current-password"]',
  "#okta-signin-password",
  "#password",
  '[data-se="password-input"]',
];

export const REGION_CONTROL_SELECTORS = [
  "select",
  '[role="combobox"]',
  '[aria-haspopup="listbox"]',
];
