import { build } from "esbuild";

build({
  entryPoints: ["src/content.ts"],
  bundle: true,
  outfile: "dist/content.js",
  format: "iife",
  target: ["chrome120", "edge120"],
  sourcemap: true,
  minify: false,
}).catch(() => process.exit(1));
