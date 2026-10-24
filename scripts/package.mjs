import { build, Platform, Arch } from "electron-builder";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
process.chdir(root);
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const expected = process.platform === "win32" ? "x64" : process.platform === "darwin" ? "arm64" : null;
if (!expected || process.arch !== expected) throw new Error("Package on Windows x64 or macOS ARM64 only.");
let sourceCommit = null;
try { sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
const requested = process.env.PACKAGE_VERSION?.trim();
let version = pkg.version;
if (requested) {
  const match = /^v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(?:\.(0|[1-9]\d*))?(-[0-9A-Za-z.-]+)?$/.exec(requested);
  if (!match) throw new Error("Release version must be vMAJOR.MINOR[.PATCH][-prerelease].");
  version = `${match[1]}.${match[2] ?? "0"}${match[3] ?? ""}`;
} else if (process.env.CI && sourceCommit) {
  version = `${pkg.version}-dev.g${sourceCommit.slice(0, 12)}`;
}
const windows = process.platform === "win32";
const outputs = await build({
  targets: windows ? Platform.WINDOWS.createTarget("portable", Arch.x64) : Platform.MAC.createTarget("dmg", Arch.arm64),
  config: { extends: "./electron-builder.config.cjs", extraMetadata: { version }, publish: null },
  publish: "never",
});
const extension = windows ? ".exe" : ".dmg";
const files = outputs.filter(file => file.endsWith(extension));
if (files.length !== 1) throw new Error(`Expected one ${extension} distributable, got ${files.length}.`);
for (const file of files) {
  const hash = createHash("sha256").update(await fs.readFile(file)).digest("hex");
  await fs.writeFile(`${file}.sha256`, `${hash}  ${path.basename(file)}\n`);
}
console.log(`Packaged ${windows ? "Windows x64 portable EXE" : "macOS ARM64 DMG"}: ${path.basename(files[0])}`);
if (sourceCommit) console.log(`Source commit: ${sourceCommit}`);
