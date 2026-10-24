import { build as bundle } from "esbuild";
import { build as renderer } from "vite";

await bundle({
  entryPoints: ["src/main/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile: "electron/main.js",
  external: ["electron"],
  sourcemap: true,
});
await bundle({
  entryPoints: ["src/main/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  outfile: "electron/preload.cjs",
  external: ["electron"],
  sourcemap: true,
});
await renderer();
