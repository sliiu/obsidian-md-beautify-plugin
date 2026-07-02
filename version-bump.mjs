import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// 直接从 package.json 读取最新版本号，确保可靠性
const pkgPath = 'package.json';
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const targetVersion = pkg.version;

console.log(`Reading target version ${targetVersion} from package.json`);

// 更新 manifest.json（根目录为 Obsidian 标准位置，同步到 src/assets 供构建使用）
const manifestPaths = ['manifest.json', 'src/assets/manifest.json'];
const manifest = JSON.parse(readFileSync(manifestPaths[0], 'utf8'));
manifest.version = targetVersion;
const manifestContents = JSON.stringify(manifest, null, '\t') + '\n';
for (const manifestPath of manifestPaths) {
	writeFileSync(manifestPath, manifestContents);
}

// 更新 versions.json (Obsidian 用于版本追踪)
const versionsPath = 'versions.json';
let versions = {};
try {
    versions = JSON.parse(readFileSync(versionsPath, 'utf8'));
} catch (e) {}
versions[targetVersion] = manifest.minAppVersion;
writeFileSync(versionsPath, JSON.stringify(versions, null, '\t') + '\n');

console.log(`Version bumped to ${targetVersion} in manifest.json and versions.json`);
