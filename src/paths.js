import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export const TS_HOME = path.join(os.homedir(), ".ts");
export const PROFILE_DIR = path.join(TS_HOME, "profile");
export const DOWNLOADS_DIR = path.join(os.homedir(), "ts", "downloads");

for (const dir of [TS_HOME, PROFILE_DIR, DOWNLOADS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
