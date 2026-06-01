// Assembles the static web game into ./www, the directory Capacitor bundles
// into the Android app. The game has no build step, so this just copies the
// runtime files (and nothing else — no node_modules, tests, or tooling).
import { cp, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "www");

// Files/dirs that make up the playable game at runtime.
const include = ["index.html", "style.css", "src", "assets"];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of include) {
  const from = join(root, entry);
  if (!existsSync(from)) {
    console.error(`✗ missing required entry: ${entry}`);
    process.exit(1);
  }
  await cp(from, join(out, entry), { recursive: true });
  console.log(`✓ copied ${entry}`);
}

console.log(`\nWeb assets assembled into ${out}`);
