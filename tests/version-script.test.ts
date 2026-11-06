import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixtures: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'xinwei-version-test-'));
  fixtures.push(root);
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'src-tauri'));
  copyFileSync(new URL('../scripts/version.mjs', import.meta.url), join(root, 'scripts/version.mjs'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'xinwei-desktop', version: '1.2.3' }));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ version: '1.2.3', packages: { '': { version: '1.2.3' }, dependency: { version: '9.9.9' } } }));
  writeFileSync(join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ version: '1.2.3' }));
  writeFileSync(join(root, 'src-tauri/Cargo.toml'), '[package]\nname = "xinwei-desktop"\nversion = "1.2.3"\n\n[dependencies]\nother = "9.9.9"\n');
  writeFileSync(join(root, 'src-tauri/Cargo.lock'), '[[package]]\nname = "other"\nversion = "9.9.9"\n\n[[package]]\nname = "xinwei-desktop"\nversion = "1.2.3"\n');
  const run = (mode: string) => execFileSync(process.execPath, [join(root, 'scripts/version.mjs'), mode], { encoding: 'utf8', stdio: 'pipe' });
  return { root, run };
}
afterEach(() => { for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('交付版本同步', () => {
  for (const endings of ['crlf', 'mixed']) it(`Windows ${endings} 换行可校验和递增，不丢失锁文件内容`, () => {
    const { root, run } = fixture();
    for (const name of ['Cargo.toml', 'Cargo.lock']) {
      const file=join(root,'src-tauri',name);
      const original=readFileSync(file,'utf8');
      writeFileSync(file,endings==='crlf'?original.replaceAll('\n','\r\n'):original.replace(/\n/g,(_,offset)=>offset%2?'\r\n':'\n'));
    }
    const lock=join(root,'src-tauri/Cargo.lock');
    const before=readFileSync(lock,'utf8');
    expect(run('check')).toContain('1.2.3');
    expect(run('patch')).toContain('1.2.4');
    expect(run('check')).toContain('1.2.4');
    expect(readFileSync(lock,'utf8')).toBe(before.replace('version = "1.2.3"','version = "1.2.4"'));
    writeFileSync(lock,before);
    expect(()=>run('check')).toThrow();
  });
  it('patch/minor/major递增并通过跨文件校验，不改第三方依赖版本', () => {
    const { root, run } = fixture();
    expect(run('check')).toContain('1.2.3');
    for (const [mode, version] of [['patch', '1.2.4'], ['minor', '1.3.0'], ['major', '2.0.0']]) {
      expect(run(mode!)).toContain(version);
      expect(run('check')).toContain(version);
      expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version).toBe(version);
      expect(JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages.dependency.version).toBe('9.9.9');
      expect(readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8')).toContain('other = "9.9.9"');
    }
  });
  it('版本不一致或参数错误时拒绝操作，并保留原文件', () => {
    const { root, run } = fixture();
    const before = readFileSync(join(root, 'package.json'), 'utf8');
    expect(() => run('invalid')).toThrow();
    writeFileSync(join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ version: '1.2.2' }));
    expect(() => run('check')).toThrow();
    expect(() => run('patch')).toThrow();
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(before);
  });
});
