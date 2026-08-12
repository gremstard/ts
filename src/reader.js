import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { getContext } from "./browser.js";

const turndown = new TurndownService({ headingStyle: "atx" });

const BLOCK_MARKERS = [
  /verify you are human/i,
  /checking your browser/i,
  /captcha/i,
  /enable javascript and cookies/i,
  /access denied/i,
];

export async function readerFetch(url) {
  const context = await getContext(false);
  const page = await context.newPage();
  let html;
  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    html = await page.content();

    const status = response?.status() ?? 200;
    const bodyText = await page.innerText("body").catch(() => "");
    const looksBlocked =
      status === 403 ||
      status === 429 ||
      BLOCK_MARKERS.some((re) => re.test(bodyText.slice(0, 2000)));

    if (looksBlocked) {
      throw new BlockedError(url);
    }
  } finally {
    await page.close();
  }

  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || article.textContent.trim().length < 100) {
    throw new BlockedError(url);
  }

  return {
    title: article.title,
    byline: article.byline,
    text: turndown.turndown(article.content),
  };
}

export class BlockedError extends Error {
  constructor(url) {
    super(
      `Couldn't read ${url} — it looks gated behind a login or captcha.\n` +
        `Run: ts login ${url}\n` +
        `Solve it by hand in the window that opens, then press Enter in the terminal.`
    );
    this.name = "BlockedError";
  }
}
