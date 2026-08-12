import { chromium } from "playwright";
import { PROFILE_DIR } from "./paths.js";

let context = null;

export async function getContext(headed = false, { hidden = false } = {}) {
  if (context) return context;
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !headed,
    viewport: { width: 1280, height: 900 },
    // Real (non-headless) Chromium avoids DDG's headless-bot detection, but we
    // don't want a window flashing on screen for background fetches — push it
    // off the visible desktop instead of using headless: true.
    args: hidden ? ["--window-position=-32000,-32000"] : [],
  });
  return context;
}

export async function closeBrowser() {
  if (context) {
    await context.close();
    context = null;
  }
}
