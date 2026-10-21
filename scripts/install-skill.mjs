#!/usr/bin/env node
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const skillSlugs = Object.freeze([
  'thinkingmodels-problem-framing',
  'thinkingmodels-decision-validation',
  'thinkingmodels-learning-reflection',
]);

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const usage = `Install one local ThinkingModels Skill without overwriting existing files.

Usage:
  node scripts/install-skill.mjs --skill <slug> --host codex|claude --scope project --project <absolute-path>
  node scripts/install-skill.mjs --skill <slug> --host codex|claude --scope user

Skills:
  ${skillSlugs.join('\n  ')}

Project targets: .agents/skills (Codex), .claude/skills (Claude Code).
User targets: $CODEX_HOME/skills (default ~/.codex/skills), ~/.claude/skills.
No network requests or MCP configuration changes are made.
`;

export function parseArguments(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return null;
  const values = {};
  const allowed = new Set(['--skill', '--host', '--scope', '--project']);
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(option)) throw new Error(`Unknown argument: ${option}`);
    if (Object.hasOwn(values, option)) throw new Error(`Duplicate argument: ${option}`);
    if (typeof value !== 'string' || !value || value.startsWith('--')) throw new Error(`Missing value for ${option}`);
    values[option] = value;
  }
  const options = { skill: values['--skill'], host: values['--host'], scope: values['--scope'], project: values['--project'] };
  if (!skillSlugs.includes(options.skill)) throw new Error('Select a supported --skill slug.');
  if (!['codex', 'claude'].includes(options.host)) throw new Error('--host must be codex or claude.');
  if (!['project', 'user'].includes(options.scope)) throw new Error('--scope must be project or user.');
  if (options.scope === 'project' && (!options.project || !isAbsolute(options.project))) throw new Error('--project must be an absolute path for project scope.');
  if (options.scope === 'user' && options.project) throw new Error('--project is only valid with project scope.');
  return options;
}

function isWithin(root, candidate) {
  const path = relative(root, candidate);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

async function inspectDirectory(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${path}`);
  if (!info.isDirectory()) throw new Error(`Not a directory: ${path}`);
}

async function ensureChildDirectory(root, path) {
  if (!isWithin(root, path)) throw new Error('Installation path escapes its selected root.');
  try {
    await mkdir(path);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await inspectDirectory(path);
  if (!isWithin(root, await realpath(path))) throw new Error('Installation path escapes its selected root.');
}

async function collectSource(path, prefix = '') {
  await inspectDirectory(path);
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const source = join(path, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Refusing source symbolic link: ${source}`);
    if (entry.isDirectory()) files.push(...await collectSource(source, name));
    else if (entry.isFile()) files.push([name, await readFile(source)]);
    else throw new Error(`Unsupported source file: ${source}`);
  }
  return files;
}

export async function installSkill(options, environment = process.env) {
  // Reuse CLI validation for callers of this exported function too.
  parseArguments(['--skill', options.skill, '--host', options.host, '--scope', options.scope, ...(options.project ? ['--project', options.project] : [])]);
  const files = await collectSource(join(repository, 'skills', options.skill));
  if (!files.some(([name]) => name === 'SKILL.md')) throw new Error('Source package has no SKILL.md.');
  const home = homedir();
  let selectedRoot;
  let components;
  if (options.scope === 'project') {
    selectedRoot = options.project;
    components = [options.host === 'codex' ? '.agents' : '.claude', 'skills'];
  } else if (options.host === 'codex' && environment.CODEX_HOME) {
    if (!isAbsolute(environment.CODEX_HOME)) throw new Error('CODEX_HOME must be an absolute path.');
    // The selected home may be new; its existing parent is the trusted root.
    selectedRoot = dirname(resolve(environment.CODEX_HOME));
    components = [relative(selectedRoot, resolve(environment.CODEX_HOME)), 'skills'];
  } else {
    selectedRoot = home;
    components = [options.host === 'codex' ? '.codex' : '.claude', 'skills'];
  }
  await inspectDirectory(selectedRoot);
  const root = await realpath(selectedRoot);
  let parent = root;
  for (const component of components) {
    const child = join(parent, component);
    await ensureChildDirectory(root, child);
    parent = child;
  }
  const destination = join(parent, options.skill);
  if (!isWithin(root, destination)) throw new Error('Installation path escapes its selected root.');
  try {
    // Exclusive creation also rejects a pre-existing directory or dangling link.
    await mkdir(destination, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Destination already exists; nothing overwritten: ${destination}`);
    throw error;
  }
  try {
    await inspectDirectory(destination);
    if (!isWithin(root, await realpath(destination))) throw new Error('Installation path escapes its selected root.');
    for (const [name, content] of files) {
      const target = join(destination, name);
      if (!isWithin(destination, target)) throw new Error('Source path escapes the Skill directory.');
      let parentDirectory = destination;
      for (const component of relative(destination, dirname(target)).split(sep).filter(Boolean)) {
        parentDirectory = join(parentDirectory, component);
        await ensureChildDirectory(destination, parentDirectory);
      }
      await writeFile(target, content, { flag: 'wx', mode: 0o644 });
    }
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
  return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options === null) process.stdout.write(usage);
    else process.stdout.write(`Installed ${options.skill} at ${await installSkill(options)}\nRefresh Skill discovery in your host before use.\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage}`);
    process.exitCode = 1;
  }
}
