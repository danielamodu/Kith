/**
 * Copy the built frontend (frontend/dist/public) into public/, where
 * src/server.ts serves it. Run after `npm --prefix frontend run build` —
 * see the "web:build" script in package.json, which does both in order.
 *
 * Strips Manus's dev-only debug-collector artifact, which the Vite build
 * copies verbatim from frontend/client/public/ but nothing in production
 * ever references — see docs/manus-ux-brief.md.
 */
import { readdir, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

const src = root("frontend/dist/public");
const dest = root("public");

if (!existsSync(src)) {
  console.error(
    "frontend/dist/public not found — run `npm --prefix frontend run build` first.",
  );
  process.exit(1);
}

for (const entry of await readdir(dest)) {
  if (entry === ".gitkeep") continue;
  await rm(root(`public/${entry}`), { recursive: true, force: true });
}

await cp(src, dest, { recursive: true });
await rm(root("public/__manus__"), { recursive: true, force: true });

console.log(`Copied ${src} -> ${dest}`);
