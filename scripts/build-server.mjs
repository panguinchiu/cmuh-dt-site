// 把 server.ts（含 src/ws、src/lib）與 seed 打包到 dist/；node_modules 保持 external
import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  packages: "external",
  tsconfig: "tsconfig.json",
  logLevel: "info",
};

await build({ ...common, entryPoints: ["server.ts"], outfile: "dist/server.js" });
// 正式環境（已 prune devDependencies、沒有 tsx）用：node dist/seed.js
await build({ ...common, entryPoints: ["prisma/seed.ts"], outfile: "dist/seed.js" });
