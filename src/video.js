import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getContext, closeBrowser } from "./browser.js";
import { TS_HOME, DOWNLOADS_DIR } from "./paths.js";

const COOKIES_FILE = path.join(TS_HOME, "cookies.txt");

export async function downloadVideo(url) {
  const outputTemplate = path.join(DOWNLOADS_DIR, "%(title)s.%(ext)s");
  return runYtDlp(url, outputTemplate, { forwardOutput: true });
}

// Downloads to a throwaway temp dir instead of ~/ts/downloads — used by
// preview mode, which just needs a local file to feed to impv. Capped at
// 480p since terminal block art can't show any more detail than that anyway.
export async function downloadVideoToTemp(url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-preview-"));
  return runYtDlp(url, path.join(dir, "video.%(ext)s"), {
    forwardOutput: false,
    formatArgs: ["-f", "best[height<=480]/best"],
  });
}

// Audio-only, preferring m4a — afplay (macOS's built-in player) can play
// that natively, so audio playback needs no ffmpeg at all.
export async function downloadAudioToTemp(url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-audio-"));
  return runYtDlp(url, path.join(dir, "audio.%(ext)s"), {
    forwardOutput: false,
    formatArgs: ["-f", "bestaudio[ext=m4a]/bestaudio"],
  });
}

// Resolves the direct CDN URL for a video without downloading anything, so
// impv can stream frames straight off the network instead of waiting for a
// full local download first. Only works when yt-dlp picks a single
// pre-muxed stream (has both video+audio) — if the best match under our
// height cap needs separate video/audio streams merged (`requested_formats`),
// there's no single URL to stream from, so the caller should fall back to
// downloadVideoToTemp instead.
export async function resolveStreamUrl(url) {
  await exportCookies();
  await closeBrowser();

  return new Promise((resolve, reject) => {
    const args = ["--cookies", COOKIES_FILE, "-f", "best[height<=480]/best", "-j", url];
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });

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
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}: ${err.trim()}`));
        return;
      }
      const info = JSON.parse(out);
      if (info.requested_formats?.length > 1 || !info.url) {
        resolve(null);
        return;
      }
      resolve({ url: info.url, headers: info.http_headers || {} });
    });
  });
}

async function runYtDlp(url, outputTemplate, { forwardOutput, formatArgs = [] }) {
  await exportCookies();
  await closeBrowser();

  return new Promise((resolve, reject) => {
    const args = [
      "--cookies",
      COOKIES_FILE,
      ...formatArgs,
      "-o",
      outputTemplate,
      "--print",
      "after_move:filepath",
      url,
    ];
    const proc = spawn("yt-dlp", args, {
      stdio: ["ignore", "pipe", forwardOutput ? "inherit" : "ignore"],
    });

    let out = "";
    proc.stdout.on("data", (chunk) => {
      out += chunk.toString();
      if (forwardOutput) process.stdout.write(chunk);
    });

    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(new Error("yt-dlp isn't installed. Install it with: brew install yt-dlp"));
      } else {
        reject(err);
      }
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}`));
        return;
      }
      const lastLine = out.trim().split("\n").filter(Boolean).pop();
      resolve(lastLine);
    });
  });
}

// yt-dlp's --cookies-from-browser can't decrypt Playwright's bundled Chromium
// cookie store on macOS (no matching Keychain entry), so hand it a plain
// Netscape cookie file exported straight from the Playwright context instead.
async function exportCookies() {
  const context = await getContext(false);
  const cookies = await context.cookies();

  const lines = [
    "# Netscape HTTP Cookie File",
    ...cookies.map((c) =>
      [
        c.domain,
        c.domain.startsWith(".") ? "TRUE" : "FALSE",
        c.path,
        c.secure ? "TRUE" : "FALSE",
        Math.round(c.expires > 0 ? c.expires : 0),
        c.name,
        c.value,
      ].join("\t")
    ),
  ];

  fs.writeFileSync(COOKIES_FILE, lines.join("\n") + "\n");
}
