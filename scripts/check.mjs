import { readdir, readFile, lstat, access } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const required = ['README.md', 'LICENSE', 'package.json', 'package-lock.json', '.env.example', '.github/workflows/ci.yml', 'skills/catalog.json', 'mcp/src/cli.mjs', 'Dockerfile', 'compose.yaml', 'docs/mcp.md', 'docs/deployment.md'];
for (const file of required) await access(join(root, file));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
assert.equal(pkg.license, 'CC0-1.0');
assert.equal(pkg.version, lock.version);
assert.equal(pkg.dependencies['@modelcontextprotocol/sdk'], lock.packages['node_modules/@modelcontextprotocol/sdk'].version);
assert.match(await readFile(join(root, 'LICENSE'), 'utf8'), /CC0 1\.0 Universal/);
const forbidden = [
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{32,}/,
  new RegExp('/' + 'Users' + '/'),
];
let count = 0;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(entry.name)) continue;
    const file = join(directory, entry.name);
    const rel = relative(root, file).replaceAll('\\', '/');
    assert(!entry.isSymbolicLink(), `Symlink in release tree: ${rel}`);
    assert(!['.env', '.DS_Store'].includes(entry.name), `Unwanted local file: ${rel}`);
    if (entry.isDirectory()) { await walk(file); continue; }
    assert(entry.isFile(), `Unexpected filesystem entry: ${rel}`);
    if (/\.(zip|png)$/.test(rel)) continue;
    const source = await readFile(file, 'utf8');
    for (const pattern of forbidden) assert(!pattern.test(source), `Possible private material in ${rel}`);
    if (rel.endsWith('.mjs')) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    if (rel.endsWith('.json')) JSON.parse(source);
    if (rel.endsWith('.md')) {
      for (const match of source.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
        if (/^(?:https?:|mailto:|#)/.test(match[1])) continue;
        const local = match[1].split('#', 1)[0];
        await access(join(dirname(file), decodeURIComponent(local)));
      }
    }
    count++;
  }
}
await walk(root);
const catalog = JSON.parse(await readFile(join(root, 'skills/catalog.json'), 'utf8'));
for (const file of ['claude-desktop.local.json', 'claude-desktop.npx.json']) {
  const config = JSON.parse(await readFile(join(root, 'examples', file), 'utf8')).mcpServers.thinkingmodels;
  assert(config.command && Array.isArray(config.args));
}
for (const file of ['codex.local.toml', 'codex.npx.toml', 'codex.remote.toml']) assert.match(await readFile(join(root, 'examples', file), 'utf8'), /\[mcp_servers\.thinkingmodels\]/);
assert.deepEqual(catalog.packages.map(pkg => pkg.slug), [
  'thinkingmodels-problem-framing', 'thinkingmodels-decision-validation',
  'thinkingmodels-learning-reflection', 'thinkingmodels-rule-governance',
]);
const cli = await lstat(join(root, pkg.bin['thinkingmodels-mcp']));
assert(cli.isFile());
console.log(`Release check passed: ${count} text files, ${catalog.packages.length} Skills, pinned SDK, local links and config examples.`);
