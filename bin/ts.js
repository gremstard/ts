#!/usr/bin/env node
import * as readline from "node:readline/promises";
import { Command } from "commander";
import { readerFetch } from "../src/reader.js";
import { createSearchSession } from "../src/search.js";
import { download } from "../src/download.js";
import { downloadVideo } from "../src/video.js";
import { closeBrowser } from "../src/browser.js";
import { login } from "../src/login.js";
import { getAiOverview } from "../src/ai.js";
import { previewVideo } from "../src/preview.js";
import { playAudio } from "../src/audio.js";
import { createYoutubeSession, resolveDirectYoutubeUrl, getVideoInfo } from "../src/youtube.js";
import { startSpinner } from "../src/spinner.js";

const program = new Command();

program
  .command("login <url>")
  .description("open a visible browser window to log in / solve a captcha by hand; session is saved for future reads")
  .action(async (url) => {
    try {
      await login(url);
    } finally {
      await closeBrowser();
    }
  });

const FIELD_ALIASES = {
  title: "title",
  desc: "description",
  description: "description",
  channel: "channel",
  id: "id",
};

program
  .command("yt <query-or-url-or-id> [field]")
  .description(
    "search YouTube and preview picks inline, or play a URL/video ID directly — all in the terminal. " +
      "With a direct URL/ID, pass a field (title, desc, channel, id) to print it in full instead of playing"
  )
  .option("-n, --num <count>", "number of results per page", "5")
  .option("-m, --audio", "play audio only — no ffmpeg, no video rendering, just sound")
  .action(async (input, field, opts) => {
    try {
      const play = opts.audio ? playAudio : previewVideo;

      const direct = resolveDirectYoutubeUrl(input);
      if (direct) {
        if (field) {
          const key = FIELD_ALIASES[field.toLowerCase()];
          if (!key) {
            throw new Error(`Unknown field "${field}" — expected one of: title, desc, channel, id`);
          }
          const info = await getVideoInfo(direct);
          console.log(info[key] ?? "");
          return;
        }
        await play(direct);
        return;
      }

      if (field) {
        throw new Error("A field lookup (title/desc/channel/id) needs a direct video URL or ID, not a search query.");
      }

      const session = createYoutubeSession(input);
      await pagedPicker({
        pageSize: parseInt(opts.num, 10),
        getWindow: session.getWindow,
        noResultsMessage: "No videos found.",
        renderItem: (v, i) => {
          const desc = v.description
            ? v.description.length > 200
              ? `${v.description.slice(0, 200)}...`
              : v.description
            : "(no description)";
          return `${i + 1}. ${v.title}\n   ID: ${v.id}  ·  Channel: ${v.channel || "unknown"}\n   ${desc}`;
        },
        onSelect: async (v) => {
          await play(v.url);
        },
      });
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
    } finally {
      await closeBrowser();
    }
  });

program.name("ts").description("Terminal reader mode — text search and clean page reading from the CLI");

// isDefault lets `ts <query-or-url>` work without typing "search", while still
// keeping this command's options (-n, -a, ...) scoped to it instead of
// leaking into sibling commands like `yt` — commander merges same-named
// options declared directly on the root program with a subcommand's own,
// which silently drops values passed to the subcommand.
program
  .command("search <query-or-url>", { isDefault: true })
  .description("search the web (or read a URL) from the CLI")
  .option("-d, --download <dest>", "download the URL as a file instead of reading it")
  .option("-v, --video", "treat the URL as a video and download it with yt-dlp")
  .option("-p, --preview", "treat the URL as a video and preview it inline in the terminal")
  .option("-m, --audio", "treat the URL as a video and play its audio only — no ffmpeg needed")
  .option("-n, --num <count>", "number of search results to show per page", "5")
  .option("-a, --ai", "also fetch an AI overview of the search query")
  .action(async (input, opts) => {
    try {
      const isUrl = /^https?:\/\//i.test(input);

      if (opts.audio) {
        await playAudio(input);
        return;
      }

      if (opts.preview) {
        await previewVideo(input);
        return;
      }

      if (opts.video) {
        const path = await downloadVideo(input);
        console.log(`Saved video: ${path}`);
        return;
      }

      if (opts.download) {
        const path = await download(input, opts.download);
        console.log(`Saved: ${path}`);
        return;
      }

      if (isUrl) {
        const article = await readerFetch(input);
        printArticle(article);
      } else {
        const session = createSearchSession(input);
        let aiShown = false;

        await pagedPicker({
          pageSize: parseInt(opts.num, 10),
          getWindow: session.getWindow,
          noResultsMessage: "No results.",
          renderItem: (r, i) => `${i + 1}. === ${r.title} ===\n${r.url}\n\n${r.excerpt}`,
          afterFirstPage: opts.ai
            ? async () => {
                if (aiShown) return;
                aiShown = true;
                const stopSpinner = startSpinner("Fetching AI overview...");
                const overview = await getAiOverview(input).catch(() => null);
                stopSpinner();
                printAiOverview(overview);
              }
            : undefined,
          onSelect: async (r) => {
            const article = await readerFetch(r.url);
            printArticle(article);
          },
        });
      }
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
    } finally {
      await closeBrowser();
    }
  });

// Shared by both `ts <query>` and `ts yt <query>`: fetches and shows a page
// of results, then lets the user open one (1-N), page to less relevant
// results (9) or back to more relevant ones (8), or quit (0). Falls back to
// just printing page one when stdin isn't a TTY (piped/scripted usage).
async function pagedPicker({
  pageSize,
  getWindow,
  renderItem,
  onSelect,
  noResultsMessage = "No results.",
  afterFirstPage,
}) {
  const interactive = process.stdin.isTTY;
  const rl = interactive
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;
  let start = 0;

  try {
    while (true) {
      const window = await getWindow(start, pageSize);

      if (window.length === 0) {
        if (start === 0) {
          console.log(noResultsMessage);
          break;
        }
        console.log("No more results.");
        start = Math.max(0, start - pageSize);
        continue;
      }

      console.log("");
      window.forEach((item, i) => console.log(renderItem(item, start + i)));

      if (start === 0 && afterFirstPage) await afterFirstPage();
      if (!interactive) break;

      const hint = [
        `1-${window.length} to open`,
        start > 0 ? "8 = more relevant" : null,
        "9 = less relevant",
        "0 to quit",
      ]
        .filter(Boolean)
        .join("  ·  ");
      const answer = (await rl.question(`\n${hint}\n> `)).trim();

      if (!answer || answer === "0") break;

      if (answer === "9") {
        start += pageSize;
        continue;
      }
      if (answer === "8") {
        if (start === 0) {
          console.log("Already showing the most relevant results.");
        } else {
          start = Math.max(0, start - pageSize);
        }
        continue;
      }

      const idx = parseInt(answer, 10);
      if (!Number.isInteger(idx) || idx < 1 || idx > window.length) {
        console.log("Not a valid choice.");
        continue;
      }

      try {
        await onSelect(window[idx - 1]);
      } catch (err) {
        console.error(err.message);
      }
    }
  } finally {
    rl?.close();
  }
}

function printAiOverview(overview) {
  if (!overview) {
    console.log("\n(no AI overview available for this query)");
    return;
  }
  console.log(`\n--- AI Overview ---\n\n${overview.summary}`);
  if (overview.sources.length) {
    console.log(`\nSources: ${overview.sources.map((s) => s.text).join(", ")}`);
  }
}

function printArticle(article) {
  console.log(`\n# ${article.title}\n`);
  if (article.byline) console.log(`${article.byline}\n`);
  console.log(article.text);
}

program.parseAsync(process.argv);
