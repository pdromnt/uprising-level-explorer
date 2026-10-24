// Asset-free acceptance check of the actual portable EXE / mounted DMG app.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const executablePath = process.env.UPRISING_TEST_EXE;
assert.ok(executablePath, "Set UPRISING_TEST_EXE to the portable EXE or mounted app executable.");
const expectedArch = process.platform === "win32" ? "x64" : process.platform === "darwin" ? "arm64" : null;
assert.equal(process.arch, expectedArch, "Run on the supported native architecture.");
const artifacts = path.join(root, "artifacts");
await fs.mkdir(artifacts, { recursive: true });
const profile = await fs.mkdtemp(path.join(artifacts, "package-smoke-"));
const server = net.createServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
let child, browser, closed = false, log = "";
async function closeWithin(action) {
  let timer;
  try {
    await Promise.race([action().catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, 3000); })]);
  } finally { clearTimeout(timer); }
}
try {
  child = spawn(executablePath, [
    `--user-data=${profile}`, `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: process.env });
  child.on("error", error => { log += error.message; closed = true; });
  child.on("exit", () => { closed = true; });
  child.stdout.on("data", data => { log = (log + data).slice(-8000); });
  child.stderr.on("data", data => { log = (log + data).slice(-8000); });
  const deadline = Date.now() + 90_000;
  let endpoint;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { endpoint = (await response.json()).webSocketDebuggerUrl; break; }
    } catch {}
    if (closed) throw new Error(`Packaged launcher exited before creating a window.\n${log}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(endpoint, `Packaged app did not expose its test debugger in time.\n${log}`);
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().startsWith("atlas://"));
  if (!page) page = await context.waitForEvent("page", { timeout: 15000 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.waitForLoadState("domcontentloaded");
  await page.locator("#loading").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#welcome").isVisible(), true);
  assert.equal(await page.locator(".welcome-card h1").innerText(), "Explore the Worlds");
  await page.waitForFunction(() => Array.from(document.fonts).filter(f => f.status === "loaded").length === 3);
  assert.deepEqual(await page.evaluate(() => ({ node: typeof window.require, process: typeof window.process })), { node: "undefined", process: "undefined" });
  assert.deepEqual(await page.evaluate(() => window.viewer.bootstrap()), { ok: true, data: null });
  const invalid = await page.evaluate(() => window.viewer.loadLevel("../outside.lfl"));
  assert.equal(invalid.ok, false);
  assert.equal(await page.locator("#fog").isChecked(), false);
  await page.evaluate(() => { localStorage.setItem("fog-enabled", "true"); localStorage.setItem("game-fonts", "false"); });
  await page.reload();
  await page.locator("#loading").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#fog").isChecked(), true);
  assert.equal(await page.locator("#game-fonts").isChecked(), false);
  const probe = await build({ entryPoints: [path.join(root, "tests/terrain-gpu.ts")], bundle: true, write: false, format: "iife", platform: "browser" });
  await page.evaluate(probe.outputFiles[0].text);
  const result = await page.evaluate(() => window.probeTerrainSeams());
  assert.equal(result.contaminated, 0);
  assert.deepEqual(result.shaderErrors, []);
  await page.screenshot({ path: path.join(artifacts, `package-smoke-${process.platform}-${process.arch}.png`) });
  assert.deepEqual(errors, []);
  console.log(`PASS: actual packaged ${process.platform}/${process.arch} launch, fonts, isolated IPC, persisted controls and WebGL terrain (${result.samples} pixels).`);
} finally {
  if (browser) {
    try { const cdp = await browser.newBrowserCDPSession(); await closeWithin(() => cdp.send("Browser.close")); } catch {}
    await closeWithin(() => browser.close());
  }
  if (child && !closed) {
    // Let the portable wrapper finish and remove its extracted application.
    for (let i = 0; i < 100 && !closed; i++) await new Promise(resolve => setTimeout(resolve, 100));
    if (!closed) child.kill();
  }
  const relative = path.relative(artifacts, path.resolve(profile));
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && path.basename(profile).startsWith("package-smoke-"));
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}
