import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { downloadVideoToTemp, resolveStreamUrl } from "./video.js";

// impv (https://github.com/gremstard/impv) renders video as colored terminal
// blocks with synced audio via ffmpeg + afplay. `ts` just hands it a file or
// URL — no reason to maintain a second frame-rendering pipeline in JS
// alongside impv's Python one. Prefer a proper `brew install`-ed impv on
// PATH; fall back to the local dev checkout for anyone working on both
// projects side by side without having installed impv system-wide yet.
function resolveImpvPath() {
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["impv"]);
  if (which.status === 0) return "impv";
  const devPath = path.join(os.homedir(), "impv", "impv");
  return fs.existsSync(devPath) ? devPath : null;
}

export async function previewVideo(url) {
  const impvPath = resolveImpvPath();
  if (!impvPath) {
    throw new Error(
      "impv not found — it's the terminal video renderer this depends on. Install with: brew install gremstard/tap/impv"
    );
  }

  // Streaming means impv starts rendering as soon as the first bit of video
  // arrives instead of waiting for a full download — but it only works when
  // yt-dlp resolves a single pre-muxed stream URL. Some sources need
  // separate video/audio streams merged, which has no single URL to stream
  // from, so those fall back to the old download-then-play flow.
  const stream = await resolveStreamUrl(url).catch(() => null);
  if (stream) {
    await runImpv(impvPath, stream.url, stream.headers);
    return;
  }

  const videoPath = await downloadVideoToTemp(url);
  const workDir = path.dirname(videoPath);
  try {
    await runImpv(impvPath, videoPath, {});
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function runImpv(impvPath, target, headers) {
  return new Promise((resolve, reject) => {
    const headerArgs = Object.entries(headers).flatMap(([k, v]) => ["-H", `${k}: ${v}`]);
    const proc = spawn(impvPath, [target, ...headerArgs], { stdio: "inherit" });
    const onSigint = () => proc.kill("SIGINT");
    process.once("SIGINT", onSigint);

    proc.on("error", (err) => {
      process.removeListener("SIGINT", onSigint);
      reject(err);
    });
    proc.on("close", (code) => {
      process.removeListener("SIGINT", onSigint);
      if (code !== 0 && code !== null) {
        reject(new Error(`impv exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}
