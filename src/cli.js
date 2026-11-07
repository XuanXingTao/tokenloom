#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { optimize } from './core.js';
import { countTokens, encoding } from './tokenizer.js';
import { decodeTable } from './json-table.js';
import { contextCommand } from './context-cli.js';

const help = `TokenLoom 0.4 — local input compactor (Node 22+)\n\nUsage:\n  node src/cli.js count FILE\n  node src/cli.js compact FILE --kind json|table|logs|text|code|tap [--mode safe|focus]\n      [--query TEXT] [--budget N] [--out FILE] [--report FILE]\n  node src/cli.js expand-table FILE [--out FILE]\n  node src/cli.js pack FILE --query TEXT --budget N --store DIR [--out FILE]\n  node src/cli.js recover ID --store DIR [--out FILE]\n  node src/cli.js read FILE [--root DIR] [--task ID] [--allow-lossy]\n  node src/cli.js run [--root DIR] [--task ID] [--timeout MS] [--observe-codex-usage] [--allow-lossy] -- PROGRAM ARGS...\n  node src/cli.js recall ID [--root DIR] [--task ID] [--start N --end N]\n  node src/cli.js serve [--root DIR] [--allow-run]\n  node src/cli.js report [--root DIR] [--task ID]\n  node src/cli.js usage-import FILE [--root DIR] [--task ID]\n  read/recall selection: --query TEXT | --start N --end N | --pointer /path | --count\n      [--where-pointer /field --equals JSON] [--offset N --limit N] [--budget N]\n  node src/cli.js policy\n\nUse - for stdin. Default kind=text, mode=safe. Focus is lossy and requires\na query and budget. Table mode can change JSON shape; use for model reading,\nnot as a replacement payload to an existing JSON API. Counts use o200k_base;\nthey are NOT ChatGPT billing. Output text goes to stdout (or --out), the audit\nreport to stderr (or --report). Existing files are not overwritten.\n`;

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (['read','run','recall','serve','report','usage-import'].includes(command)) { const {runtimeCommand}=await import('./runtime-cli.js');await runtimeCommand(command,args);return; }
  if (command === 'pack' || command === 'recover') { contextCommand(command,args); return; }
  if (!command || command === '--help') { process.stdout.write(help); return; }
  if (command === 'policy') {
    process.stdout.write(readFileSync(new URL('../integrations/chatgpt/custom-instructions.en.txt', import.meta.url), 'utf8'));
    return;
  }
  if (!['count', 'compact', 'expand-table'].includes(command)) throw new Error(`Unknown command: ${command}`);
  const file = args.shift();
  if (!file || (file.startsWith('--'))) throw new Error('Input file or - is required.');
  const opts = {};
  const names = new Set(['--kind', '--mode', '--query', '--budget', '--out', '--report']);
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (!names.has(flag) || value === undefined || value.startsWith('--')) throw new Error(`Invalid option: ${flag}`);
    opts[flag.slice(2)] = value;
  }
  if (opts.budget !== undefined && (!/^\d+$/.test(opts.budget) || Number(opts.budget) < 1)) throw new Error('Budget must be a positive integer.');
  if (opts.mode === 'focus' && (!opts.query?.trim() || !opts.budget)) throw new Error('Focus requires --query and --budget.');
  const text = readFileSync(file === '-' ? 0 : file, 'utf8');
  if (command === 'expand-table') {
    const decoded = decodeTable(text);
    if (opts.out) writeFileSync(opts.out, decoded, { flag: 'wx' });
    else process.stdout.write(decoded);
    return;
  }
  if (command === 'count') {
    process.stdout.write(JSON.stringify({ encoding, tokens: countTokens(text), scope: 'supplied text only; excludes chat framing and internal context' }, null, 2) + '\n');
    return;
  }
  const result = optimize(text, { ...opts, budget: opts.budget ? Number(opts.budget) : null, countTokens });
  const { text: output, ...audit } = result;
  const report = JSON.stringify({ encoding, scope: 'local text tokens, not billed usage', ...audit }, null, 2) + '\n';
  if (opts.out) writeFileSync(opts.out, output, { flag: 'wx' });
  else process.stdout.write(output);
  if (opts.report) writeFileSync(opts.report, report, { flag: 'wx' });
  else process.stderr.write(report);
}

try { await main(); } catch (error) { process.stderr.write(`TokenLoom: ${error.message}\n`); process.exitCode = 1; }
