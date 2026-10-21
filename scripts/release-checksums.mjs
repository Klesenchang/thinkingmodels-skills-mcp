import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const skills = join(dirname(dirname(fileURLToPath(import.meta.url))), 'skills');
const catalog = JSON.parse(await readFile(join(skills, 'catalog.json'), 'utf8'));
const checksums = [];
for (const entry of catalog.packages) {
  assert.match(entry.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.match(entry.version, /^\d+\.\d+\.\d+$/);
  assert.equal(entry.zip, `dist/${entry.slug}-${entry.version}.zip`);
  const bytes = await readFile(join(skills, entry.zip));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256, entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  checksums.push(`${sha256}  ${entry.slug}-${entry.version}.zip`);
}
const output = join(skills, 'dist/SHA256SUMS');
await writeFile(output, checksums.join('\n') + '\n');
console.log('Wrote skills/dist/SHA256SUMS for three verified Skill ZIPs.');
