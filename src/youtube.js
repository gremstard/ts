import { spawn } from "node:child_process";

const BATCH_SIZE = 10;

export function isYoutubeUrl(input) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(input);
}

export function isYoutubeVideoId(input) {
  return /^[\w-]{11}$/.test(input);
}

// A bare 11-char ID or a youtube.com/youtu.be URL can be played directly,
// skipping search entirely.
export function resolveDirectYoutubeUrl(input) {
  if (isYoutubeUrl(input)) return input;
  if (isYoutubeVideoId(input)) return `https://www.youtube.com/watch?v=${input}`;
  return null;
}

// yt-dlp's ytsearch has no offset/pagination syntax — asking for a bigger N
// re-runs the search and returns the top N again, so paging forward means
// asking for a larger N and taking the new tail past what we've already seen.
export function createYoutubeSession(query) {
  const pool = [];
  let exhausted = false;

  async function fetchMore(target) {
    if (exhausted) return 0;
    const items = await ytSearch(query, target);
    if (items.length <= pool.length) {
      exhausted = true;
      return 0;
    }
    const added = items.slice(pool.length);
    pool.push(...added);
    return added.length;
  }

  async function getWindow(start, count) {
    while (pool.length < start + count) {
      const target = Math.max(start + count, pool.length + BATCH_SIZE);
      const added = await fetchMore(target);
      if (added === 0) break;
    }
    return pool.slice(start, start + count);
  }

  return { getWindow };
}

function ytSearch(query, n) {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", [
      `ytsearch${n}:${query}`,
      "--flat-playlist",
      "--dump-json",
      "--no-warnings",
    ]);

    let out = "";
    let err = "";
    proc.stdout.on("data", (chunk) => (out += chunk));
    proc.stderr.on("data", (chunk) => (err += chunk));

    proc.on("error", (e) => {
      if (e.code === "ENOENT") {
        reject(new Error("yt-dlp isn't installed. Install it with: brew install yt-dlp"));
      } else {
        reject(e);
      }
    });

    proc.on("close", (code) => {
      if (code !== 0 && !out.trim()) {
        reject(new Error(`YouTube search failed: ${err.trim() || `yt-dlp exited with code ${code}`}`));
        return;
      }
      const items = out
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const v = JSON.parse(line);
          return {
            title: v.title,
            id: v.id,
            url: v.webpage_url || `https://www.youtube.com/watch?v=${v.id}`,
            channel: v.channel || v.uploader || "",
            description: v.description || "",
          };
        });
      resolve(items);
    });
  });
}
