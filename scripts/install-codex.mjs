#!/usr/bin/env node
import { mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export function installSkill(destination = join(homedir(), '.agents', 'skills', 'tokenloom')) {
  const target = resolve(destination);
  if (existsSync(target)) throw new Error(`Destination exists; inspect or back it up before updating: ${target}`);
  // Read package files before creating anything. No network, hooks or global config edits.
  const source = join(root, 'plugins', 'tokenloom', 'skills', 'tokenloom', 'SKILL.md');
  readFileSync(source);
  readFileSync(join(root, 'LICENSE'));
  mkdirSync(dirname(target), { recursive: true });
  mkdirSync(target);
  copyFileSync(source, join(target, 'SKILL.md'));
  copyFileSync(join(root, 'LICENSE'), join(target, 'LICENSE'));
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args[0] === '--help') {
    console.log('node scripts/install-codex.mjs [--dest FINAL_SKILL_DIRECTORY]\nDefault: ~/.agents/skills/tokenloom. Existing destinations are never overwritten.');
  } else {
    try {
      if (args.length && (args.length !== 2 || args[0] !== '--dest' || !args[1])) throw new Error('Use --help for syntax.');
      console.log(`Installed: ${installSkill(args[1])}\nStart a new Codex chat and invoke $tokenloom.`);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
