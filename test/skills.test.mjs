import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { skillSlugs } from '../scripts/install-skill.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const installer = join(root, 'scripts/install-skill.mjs');
const catalog = JSON.parse(await readFile(join(root, 'skills/catalog.json'), 'utf8'));
const expectedHashes = {
  'thinkingmodels-problem-framing': 'd860bae582dd12eb5c2c836a3e726ab025a525a2daa32340e1bc915ba956b092',
  'thinkingmodels-decision-validation': '351e3ce9bb8eb5649646d08f45523f911d077d3b421449dc49756c3ad7b006a0',
  'thinkingmodels-learning-reflection': '34802ff4025434b34b6f7b5696b55b43e4571fcecb8fcec4b46daee5531944ce',
};
const expectedEntries = [
  'INSTALL.md', 'LICENSE.txt', 'SKILL.md', 'agents/openai.yaml', 'assets/icon.svg',
  'references/knowledge-access.md', 'references/worked-example.md', 'skill.json',
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return result;
}

function unzip(archive, ...args) {
  const result = run('unzip', [...args, archive]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

async function temporary(t) {
  const path = await mkdtemp(join(tmpdir(), 'thinkingmodels-skills-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function forbidNetwork(directory) {
  const guard = join(directory, 'no-network.cjs');
  await writeFile(guard, `
    globalThis.fetch = () => { throw new Error('Network forbidden in offline Skill tooling'); };
    for (const name of ['node:http', 'node:https', 'node:net']) {
      const module = require(name);
      for (const method of ['request', 'get', 'connect', 'createConnection']) {
        if (typeof module[method] === 'function') module[method] = () => { throw new Error('Network forbidden'); };
      }
    }
  `);
  return ['--require', guard];
}

async function regularFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false, entry.name);
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await regularFiles(join(directory, entry.name), path));
    else {
      assert.ok(entry.isFile(), path);
      result.push(path);
    }
  }
  return result.sort();
}

test('three Skills retain their published metadata, references, archive entries and SHA-256', async () => {
  assert.deepEqual(catalog.packages.map(pkg => pkg.slug), skillSlugs);
  assert.deepEqual(catalog.hosts, ['Codex', 'Claude Code']);
  for (const pkg of catalog.packages) {
    assert.equal(pkg.version, '1.0.1');
    assert.equal(pkg.license, 'CC0-1.0');
    assert.ok(pkg.name.zh && pkg.name.en && pkg.description.zh && pkg.description.en);
    assert.ok(pkg.tags.zh.length && pkg.tags.en.length);
    const directory = join(root, 'skills', pkg.slug);
    const skill = await readFile(join(directory, 'SKILL.md'), 'utf8');
    assert.ok(skill.startsWith(`---\nname: ${pkg.slug}\n`));
    assert.match(skill, /\nlicense: CC0-1\.0\n---/);
    assert.match(skill, /离线|无需联网/);
    const files = await regularFiles(directory);
    for (const name of files.filter(name => name.endsWith('.md'))) {
      const content = await readFile(join(directory, name), 'utf8');
      for (const [, link] of content.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
        if (/^(?:https?:|mailto:|#)/i.test(link)) continue;
        assert.ok(!isAbsolute(link) && !link.startsWith('..'), link);
        const target = join(directory, dirname(name), link.split('#')[0]);
        assert.ok((await lstat(target)).isFile(), `${name}: ${link}`);
      }
    }
    const hostConfig = await readFile(join(directory, 'agents/openai.yaml'), 'utf8');
    assert.ok(hostConfig.includes(`$${pkg.slug}`));
    assert.match(hostConfig, /allow_implicit_invocation: true/);
    for (const [, icon] of hostConfig.matchAll(/icon_(?:small|large): "\.\/([^"]+)"/g)) {
      assert.ok((await lstat(join(directory, icon))).isFile());
    }
    const archive = join(root, 'skills', pkg.zip);
    const bytes = await readFile(archive);
    assert.equal(sha256(bytes), expectedHashes[pkg.slug]);
    assert.equal(pkg.sha256, expectedHashes[pkg.slug]);
    assert.equal(bytes.length, pkg.bytes);
    assert.deepEqual(unzip(archive, '-Z1').trim().split('\n'), expectedEntries);
    unzip(archive, '-tq');
    const archived = run('unzip', ['-p', archive, 'SKILL.md']);
    assert.equal(archived.status, 0, archived.stderr);
    assert.equal(archived.stdout, skill);
    const metadata = run('unzip', ['-p', archive, 'skill.json']);
    assert.equal(metadata.status, 0, metadata.stderr);
    const manifest = JSON.parse(metadata.stdout);
    assert.equal(manifest.slug, pkg.slug);
    assert.equal(manifest.version, pkg.version);
    assert.deepEqual(manifest.name, pkg.name);
    assert.deepEqual(manifest.tags, pkg.tags);
    assert.deepEqual(manifest.compatibleHosts, catalog.hosts);
  }
});

test('consecutive builds use only local sources and preserve published ZIP bytes', async t => {
  const directory = await temporary(t);
  const skills = join(directory, 'skills');
  await cp(join(root, 'skills'), skills, { recursive: true });
  const guard = await forbidNetwork(directory);
  for (let pass = 0; pass < 2; pass += 1) {
    const result = run(process.execPath, [...guard, join(skills, 'build.mjs')]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const built = JSON.parse(await readFile(join(skills, 'catalog.json'), 'utf8'));
    assert.deepEqual(built, catalog);
    for (const pkg of catalog.packages) {
      assert.equal(sha256(await readFile(join(skills, pkg.zip))), expectedHashes[pkg.slug]);
    }
  }
});

test('project installer copies each Skill to the correct host without network or MCP edits', async t => {
  const directory = await temporary(t);
  const guard = await forbidNetwork(directory);
  for (const host of ['codex', 'claude']) {
    for (const skill of skillSlugs) {
      const project = join(directory, host, skill);
      await mkdir(project, { recursive: true });
      const result = run(process.execPath, [...guard, installer, '--skill', skill, '--host', host, '--scope', 'project', '--project', project]);
      assert.equal(result.status, 0, result.stderr);
      const target = join(project, host === 'codex' ? '.agents' : '.claude', 'skills', skill);
      const source = join(root, 'skills', skill);
      const files = await regularFiles(source);
      assert.deepEqual(await regularFiles(target), files);
      for (const name of files) assert.deepEqual(await readFile(join(target, name)), await readFile(join(source, name)));
      assert.deepEqual(await readdir(project), [host === 'codex' ? '.agents' : '.claude']);
    }
  }
});

test('installer requires explicit valid options and refuses overwrite or target symlinks', async t => {
  const directory = await temporary(t);
  const project = join(directory, 'project');
  await mkdir(project);
  const base = ['--skill', skillSlugs[0], '--host', 'codex', '--scope', 'project', '--project', project];
  assert.equal(run(process.execPath, [installer, '--help']).status, 0);
  for (const args of [[], ['--skill', '../../escape'], [...base, '--unknown', 'value'], [...base, '--host', 'claude'], [...base.slice(0, -1), 'relative']]) {
    assert.notEqual(run(process.execPath, [installer, ...args]).status, 0);
  }
  assert.deepEqual(await readdir(project), []);
  const installed = run(process.execPath, [installer, ...base]);
  assert.equal(installed.status, 0, installed.stderr);
  const target = join(project, '.agents', 'skills', skillSlugs[0]);
  const before = await readFile(join(target, 'SKILL.md'));
  const repeat = run(process.execPath, [installer, ...base]);
  assert.notEqual(repeat.status, 0);
  assert.match(repeat.stderr, /already exists/);
  assert.deepEqual(await readFile(join(target, 'SKILL.md')), before);
  const outside = join(directory, 'outside');
  await mkdir(outside);
  const linkedProject = join(directory, 'linked-project');
  await mkdir(linkedProject);
  await symlink(outside, join(linkedProject, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
  const linked = run(process.execPath, [installer, ...base.slice(0, -1), linkedProject]);
  assert.notEqual(linked.status, 0);
  assert.match(linked.stderr, /symbolic link/i);
  assert.deepEqual(await readdir(outside), []);
  const directProject = join(directory, 'direct-project');
  await mkdir(join(directProject, '.agents', 'skills'), { recursive: true });
  await symlink(outside, join(directProject, '.agents', 'skills', skillSlugs[0]), process.platform === 'win32' ? 'junction' : 'dir');
  const direct = run(process.execPath, [installer, ...base.slice(0, -1), directProject]);
  assert.notEqual(direct.status, 0);
  assert.deepEqual(await readdir(outside), []);
});

test('user Codex scope honors an isolated CODEX_HOME and rejects a relative or linked home', async t => {
  const directory = await temporary(t);
  const codexHome = join(directory, 'codex-home');
  const args = [installer, '--skill', skillSlugs[1], '--host', 'codex', '--scope', 'user'];
  const result = run(process.execPath, args, { env: { ...process.env, CODEX_HOME: codexHome } });
  assert.equal(result.status, 0, result.stderr);
  assert.ok((await lstat(join(codexHome, 'skills', skillSlugs[1], 'SKILL.md'))).isFile());
  const invalid = run(process.execPath, args, { env: { ...process.env, CODEX_HOME: 'relative-home' } });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /absolute path/);
  const outside = join(directory, 'outside');
  await mkdir(outside);
  const link = join(directory, 'linked-home');
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  const linked = run(process.execPath, args, { env: { ...process.env, CODEX_HOME: link } });
  assert.notEqual(linked.status, 0);
  assert.match(linked.stderr, /symbolic link/i);
  assert.deepEqual(await readdir(outside), []);
});
