/**
 * Prepares the Obsidian plugin tree for the standalone release repo.
 *
 * Community scanners type-check source with pnpm install. `workspace:*` for
 * @mdb/core breaks outside the monorepo, so we remove that dependency and rely
 * on src/types/mdb-core.d.ts for type-checking. Release artifacts (main.js)
 * are copied from CI builds separately.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");

const targetRoot = process.argv[2]
	? path.resolve(process.argv[2])
	: pluginRoot;

const pkgPath = path.join(targetRoot, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

delete pkg.dependencies["@mdb/core"];

// Scanners may skip devDependencies; keep markdown-it types as a prod dep.
pkg.dependencies["@types/markdown-it"] = "14.1.2";
delete pkg.devDependencies?.["@types/markdown-it"];

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const vendorDir = path.join(targetRoot, "vendor");
if (fs.existsSync(vendorDir)) {
	fs.rmSync(vendorDir, { recursive: true, force: true });
}

console.log(`Prepared standalone package at ${targetRoot}`);
