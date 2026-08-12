import { JSDOM } from "jsdom";

const UA = "Mozilla/5.0 (compatible; ts-reader/1.0)";

// DuckDuckGo's html endpoint only paginates via a signed "Next" form (POST
// with a vqd token issued on the first page) — a plain `s` query param on a
// GET request is silently ignored and just re-serves page one. So a session
// fetches page one via GET, then walks the "Next" form's fields for every
// page after that, caching everything so callers can request any
// [start, start+count) window regardless of where DDG's page boundaries fall.
export function createSearchSession(query) {
  const pool = [];
  let next = null; // { s, vqd } for the next POST, once page one has loaded
  let started = false;
  let exhausted = false;

  async function fetchPage() {
    if (exhausted) return 0;

    let html;
    if (!started) {
      started = true;
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      html = await res.text();
    } else if (next) {
      const body = new URLSearchParams({
        q: query,
        s: next.s,
        nextParams: "",
        v: "l",
        o: "json",
        dc: String(parseInt(next.s, 10) + 1),
        api: "d.js",
        vqd: next.vqd,
        kl: "wt-wt",
      });
      const res = await fetch("https://html.duckduckgo.com/html/", {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      html = await res.text();
    } else {
      exhausted = true;
      return 0;
    }

    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const page = [];
    for (const el of doc.querySelectorAll(".result__body")) {
      const link = el.querySelector("a.result__a");
      const snippet = el.querySelector(".result__snippet");
      if (!link) continue;

      const rawHref = link.getAttribute("href") || "";
      page.push({
        title: link.textContent.trim(),
        url: resolveDdgRedirect(rawHref),
        excerpt: snippet ? snippet.textContent.trim() : "",
      });
    }

    next = findNextForm(doc);
    if (page.length === 0) {
      exhausted = true;
      return 0;
    }
    pool.push(...page);
    return page.length;
  }

  async function getWindow(start, count) {
    while (pool.length < start + count) {
      const added = await fetchPage();
      if (added === 0) break;
    }
    return pool.slice(start, start + count);
  }

  return { getWindow };
}

export async function search(query, num = 5) {
  return createSearchSession(query).getWindow(0, num);
}

function findNextForm(doc) {
  for (const form of doc.querySelectorAll('form[action="/html/"]')) {
    const submit = form.querySelector('input[type="submit"]');
    if (submit?.getAttribute("value") !== "Next") continue;

    const field = (name) => form.querySelector(`input[name="${name}"]`)?.getAttribute("value");
    const s = field("s");
    const vqd = field("vqd");
    if (s && vqd) return { s, vqd };
  }
  return null;
}

function resolveDdgRedirect(href) {
  try {
    const u = new URL(href, "https://duckduckgo.com");
    const target = u.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : href;
  } catch {
    return href;
  }
}
