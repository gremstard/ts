import { getContext } from "./browser.js";

const OVERVIEW_SELECTOR = '[data-react-module-id="wikinlp"]';

export async function getAiOverview(query) {
  // DuckDuckGo bot-detects the headless fingerprint and serves a captcha instead
  // of the AI panel, so this needs a real (non-headless) browser — but kept
  // off-screen so no window pops up for what should be a quiet background fetch.
  const context = await getContext(true, { hidden: true });
  const page = await context.newPage();
  try {
    const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web&assist=true`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const found = await page
      .waitForSelector(`${OVERVIEW_SELECTOR} p`, { timeout: 8000 })
      .catch(() => null);
    if (!found) return null;

    const summary = await page.$eval(`${OVERVIEW_SELECTOR} p`, (p) => p.textContent.trim());
    const sources = await page.$$eval(`${OVERVIEW_SELECTOR} a`, (as) =>
      as
        .map((a) => ({ text: a.textContent.trim(), href: a.href }))
        .filter((s) => s.text && s.href)
    );

    return { summary, sources };
  } finally {
    await page.close();
  }
}
