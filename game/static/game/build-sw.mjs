import { build } from "esbuild";

const now = new Date();
const safeTs = now.toISOString().replace(/[-:TZ]/g, "").slice(0, 14);

await build({
  entryPoints: ["game/static/game/sw-src.js"],
  outfile:      "game/static/game/sw.js",
  minify:       true,
  define:       { "__TS__": `"${safeTs}"` },
  target:       "es2020",
});
console.log(`✅  Service Worker built with CACHE_NAME=reversi-web-v${safeTs}`);
