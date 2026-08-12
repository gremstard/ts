import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { downloadAudioToTemp } from "./video.js";

// afplay (built into macOS) plays these natively — no ffmpeg needed as long
// as yt-dlp hands us one of them.
const AFPLAY_FORMATS = new Set(["m4a", "mp3", "wav", "aiff", "aif", "caf", "aac"]);

export async function playAudio(url) {
  const filePath = await downloadAudioToTemp(url);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const workDir = path.dirname(filePath);

  if (!AFPLAY_FORMATS.has(ext)) {
    fs.rmSync(workDir, { recursive: true, force: true });
    throw new Error(
      `Got a .${ext} audio stream, which afplay can't play directly, and no m4a/mp3 stream was available for this source.`
    );
  }

  console.log(`\n♪ ${path.basename(filePath)}\n\nPlaying — press Ctrl+C to stop.\n`);

  await new Promise((resolve, reject) => {
    const proc = spawn("afplay", [filePath], { stdio: "inherit" });
    const onSigint = () => proc.kill();
    process.once("SIGINT", onSigint);

    proc.on("error", (err) => {
      process.removeListener("SIGINT", onSigint);
      reject(err);
    });
    proc.on("close", () => {
      process.removeListener("SIGINT", onSigint);
      resolve();
    });
  });

  fs.rmSync(workDir, { recursive: true, force: true });
}
