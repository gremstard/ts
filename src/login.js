import readline from "node:readline/promises";
import { getContext, closeBrowser } from "./browser.js";

export async function login(url) {
  const context = await getContext(true); // headed window
  const page = await context.newPage();
  await page.goto(url);

  console.log("A browser window is open. Log in / solve whatever's needed by hand.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Press Enter here once you're done... ");
  rl.close();

  await closeBrowser(); // flushes the session to ~/.ts/profile
  console.log("Session saved. Future `ts` reads of this site will reuse it.");
}
