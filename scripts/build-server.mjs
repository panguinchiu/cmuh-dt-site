// 把 server.ts（含 src/ws、src/lib）打包成 dist/server.js；node_modules 保持 external
import { build } from "esbuild";

await build({
  entryPoints: ["server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  packages: "external",
  tsconfig: "tsconfig.json",
  logLevel: "info",
});
