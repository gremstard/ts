import fs from "node:fs";
import path from "node:path";
import { getContext } from "./browser.js";
import { DOWNLOADS_DIR } from "./paths.js";

export async function download(url, filename) {
  const context = await getContext(false);
  const res = await context.request.get(url);
  if (!res.ok()) {
    throw new Error(`Download failed: ${url} returned ${res.status()}`);
  }

  const dest = path.join(DOWNLOADS_DIR, filename || guessFilename(url, res));
  fs.writeFileSync(dest, await res.body());
  return dest;
}

function guessFilename(url, res) {
  const disposition = res.headers()["content-disposition"];
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  if (match) return match[1];

  const base = path.basename(new URL(url).pathname);
  return base || "download";
}
