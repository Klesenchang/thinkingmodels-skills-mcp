import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(root, 'catalog.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const fixedDate = new Date('2026-01-01T00:00:00Z');
const required = ['SKILL.md', 'agents/openai.yaml', 'assets/icon.svg', 'LICENSE', 'references/knowledge-access.md', 'references/worked-example.md'];

async function sourceFiles(dir, prefix = '') {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Symlink forbidden: ${entry.name}`);
    const relative = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await sourceFiles(join(dir, entry.name), relative + '/'));
    else if (entry.isFile() && relative === 'assets/icon.png') continue;
    else if (entry.isFile() && /^(SKILL\.md|LICENSE|agents\/openai\.yaml|assets\/icon\.(?:svg|png)|references\/[a-z-]+\.md)$/.test(relative)) result.push(relative);
    else throw new Error(`Unexpected package source: ${relative}`);
  }
  return result.sort();
}

await mkdir(join(root, 'dist'), { recursive: true });
for (const pkg of catalog.packages) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pkg.slug) || !/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Invalid slug/version');
  if (pkg.zip !== `dist/${pkg.slug}-${pkg.version}.zip` || pkg.icon !== `${pkg.slug}/assets/icon.svg`) throw new Error('Invalid artifact path');
  const source = join(root, pkg.slug);
  const files = await sourceFiles(source);
  for (const file of required) if (!files.includes(file)) throw new Error(`Missing ${pkg.slug}/${file}`);
  const skill = await readFile(join(source, 'SKILL.md'), 'utf8');
  if (!skill.startsWith(`---\nname: ${pkg.slug}\n`) || !skill.includes('\nlicense: CC0-1.0\n---')) throw new Error('Skill metadata mismatch');
  const staging = await mkdtemp(join(tmpdir(), 'thinkingmodels-skill-'));
  const output = join(root, pkg.zip);
  try {
    for (const file of files) {
      const target = join(staging, file === 'LICENSE' ? 'LICENSE.txt' : file);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(source, file), target);
    }
    await writeFile(join(staging, 'skill.json'), JSON.stringify({
      schemaVersion: 1, slug: pkg.slug, name: pkg.name, description: pkg.description,
      version: pkg.version, icon: 'assets/icon.svg', tags: pkg.tags,
      publisher: catalog.publisher, homepage: catalog.homepage, license: pkg.license,
      compatibleHosts: catalog.hosts, skillhubId: pkg.skillhub.id,
    }, null, 2) + '\n');
    await writeFile(join(staging, 'INSTALL.md'), `# ${pkg.name.zh} / ${pkg.name.en}\n\nVersion: ${pkg.version} · Slug: \`${pkg.slug}\` · License: ${pkg.license}\n\n## Manual installation / 手动安装\n\nThis ZIP contains SKILL.md at its root. Extract its contents into ONE of the following new directories, matching your current host. / ZIP 根目录即 SKILL.md，将内容解压至当前宿主下的一个新目录：\n\n- Codex personal: \`$CODEX_HOME/skills/${pkg.slug}/\` (default \`~/.codex/skills/${pkg.slug}/\`)\n- Codex project: \`<project>/.agents/skills/${pkg.slug}/\`\n- Claude Code personal: \`~/.claude/skills/${pkg.slug}/\`\n- Claude Code project: \`<project>/.claude/skills/${pkg.slug}/\`\n\nInspect SKILL.md first. Do not overwrite an existing directory; ask the user to choose a backup or another scope. Check the final directory contains SKILL.md, agents/, assets/, references/, and LICENSE.txt. Reload skill discovery as required by your host. / 先检查内容；已有同名目录时停止覆盖并询问处理方式；检查安装结构，按宿主要求刷新技能发现。\n\nInvoke by naming \`${pkg.slug}\` or describing the matching task. Try the example in references/worked-example.md. / 用技能名称或对应任务触发，并用示例核对。\n\n## SkillHub installation / 市场安装\n\nRegistry ID: \`${pkg.skillhub.id}\`. Availability depends on SkillHub review; this ID alone does not prove publication. Use https://skillhub.cn/install/skillhub.md only after the listing is available. Always select the skills directory for your current host. / 上架后才可从市场安装，ID 本身不代表已通过审核；安装目录须匹配当前宿主。\n\nThese are instruction packages, not executable installers. No account, network, or MCP is required. Optional public knowledge access is described separately in references/knowledge-access.md. / 本包为指令文件，无自动安装脚本；无需账号、网络或 MCP。\n`);
    const entries = [...files.map(file => file === 'LICENSE' ? 'LICENSE.txt' : file), 'INSTALL.md', 'skill.json'].sort();
    for (const file of entries) {
      await chmod(join(staging, file), 0o644);
      await utimes(join(staging, file), fixedDate, fixedDate);
    }
    // Explicit allowlist and argv keep unrelated repository files out of uploads.
    await rm(output, { force: true });
    execFileSync('zip', ['-X', '-q', output, ...entries], { cwd: staging, env: { ...process.env, TZ: 'UTC' } });
    const archived = execFileSync('unzip', ['-Z1', output], { encoding: 'utf8' }).trim().split('\n');
    if (JSON.stringify(archived) !== JSON.stringify(entries)) throw new Error('Archive file list mismatch');
    execFileSync('unzip', ['-tq', output]);
    if (execFileSync('unzip', ['-p', output, 'SKILL.md'], { encoding: 'utf8' }) !== skill) throw new Error('Archive content mismatch');
    pkg.sha256 = createHash('sha256').update(await readFile(output)).digest('hex');
    pkg.bytes = (await stat(output)).size;
    console.log(`${pkg.slug}@${pkg.version}: ${entries.length} files, ${pkg.bytes} bytes, sha256 ${pkg.sha256}`);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
