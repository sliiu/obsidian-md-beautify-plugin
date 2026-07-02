/**
 * Prepares the Obsidian plugin tree for the standalone release repo.
 * Vendors @mdb/core (workspace:* does not work outside the monorepo) and
 * rewrites package.json so community scanners can install deps and type-check.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");
const monorepoRoot = path.resolve(pluginRoot, "../..");
const coreDist = path.join(monorepoRoot, "packages/core/dist");
const corePkgPath = path.join(monorepoRoot, "packages/core/package.json");

const targetRoot = process.argv[2]
	? path.resolve(process.argv[2])
	: pluginRoot;

if (!fs.existsSync(coreDist)) {
	console.error(
		`Missing @mdb/core build output at ${coreDist}. Run: pnpm --filter @mdb/core run build`,
	);
	process.exit(1);
}

const corePkg = JSON.parse(fs.readFileSync(corePkgPath, "utf8"));
const vendorDir = path.join(targetRoot, "vendor/mdb-core");

fs.rmSync(vendorDir, { recursive: true, force: true });
fs.mkdirSync(vendorDir, { recursive: true });

for (const entry of fs.readdirSync(coreDist)) {
	const src = path.join(coreDist, entry);
	const dest = path.join(vendorDir, entry);
	fs.cpSync(src, dest, { recursive: true });
}

fs.writeFileSync(
	path.join(vendorDir, "package.json"),
	JSON.stringify(
		{
			name: "@mdb/core",
			version: corePkg.version,
			main: "index.js",
			types: "index.d.ts",
		},
		null,
		2,
	) + "\n",
);

const pkgPath = path.join(targetRoot, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.dependencies["@mdb/core"] = "file:./vendor/mdb-core";

if (!pkg.devDependencies["@types/markdown-it"]) {
	pkg.devDependencies["@types/markdown-it"] = "^14.1.2";
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`Prepared standalone package at ${targetRoot}`);
