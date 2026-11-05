import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const originals = new Map(['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'].map(path => [path, read(path)]));
const pkg = JSON.parse(originals.get('package.json'));
const npmLock = JSON.parse(originals.get('package-lock.json'));
const tauri = JSON.parse(originals.get('src-tauri/tauri.conf.json'));
const cargoPattern = /(^\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m;
const lockPattern = /(^\[\[package\]\]\nname = "xinwei-desktop"\nversion = ")([^"]+)(")/m;
const cargoVersion = originals.get('src-tauri/Cargo.toml').match(cargoPattern)?.[2];
const lockVersion = originals.get('src-tauri/Cargo.lock').match(lockPattern)?.[2];
const versions = [pkg.version, npmLock.version, npmLock.packages[''].version, tauri.version, cargoVersion, lockVersion];
if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || versions.some(version => version !== pkg.version)) {
  throw Error(`应用版本不一致，请先核对 package / Tauri / Cargo：${versions.join(', ')}`);
}
const mode = process.argv[2];
if (mode === 'check') {
  console.log(`Version check passed: ${pkg.version}`);
} else if (['patch', 'minor', 'major'].includes(mode)) {
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  const next = mode === 'major' ? `${major + 1}.0.0`
    : mode === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
  pkg.version = npmLock.version = npmLock.packages[''].version = tauri.version = next;
  const updated = new Map([
    ['package.json', JSON.stringify(pkg, null, 2) + '\n'],
    ['package-lock.json', JSON.stringify(npmLock, null, 2) + '\n'],
    ['src-tauri/tauri.conf.json', JSON.stringify(tauri, null, 2) + '\n'],
    ['src-tauri/Cargo.toml', originals.get('src-tauri/Cargo.toml').replace(cargoPattern, (_, before, version, after) => before + next + after)],
    ['src-tauri/Cargo.lock', originals.get('src-tauri/Cargo.lock').replace(lockPattern, (_, before, version, after) => before + next + after)],
  ]);
  for (const [path, contents] of updated) writeFileSync(new URL(path, root), contents);
  console.log(`Version bumped: ${versions[0]} -> ${next}. 未创建提交或标签。`);
} else {
  throw Error('用法：npm run version:check 或 npm run version:bump -- patch|minor|major');
}
