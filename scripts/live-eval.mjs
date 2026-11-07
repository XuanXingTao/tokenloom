// Live Codex evaluation. Uses the user's existing Codex login and consumes usage.
// Run deliberately; never executed by npm test/check or package generation.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countTokens } from '../src/tokenizer.js';
import { optimize } from '../src/core.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const report = resolve(process.env.TOKENLOOM_REPORT_DIR || join(root, 'reports/2026-11-01'));
const work = resolve(process.env.TOKENLOOM_EVAL_CWD || join(root, '../tmp/tokenloom-eval-work'));
const model = process.env.TOKENLOOM_EVAL_MODEL || 'gpt-6-astra';
const timeoutMs = Number(process.env.TOKENLOOM_EVAL_TIMEOUT_MS || 150000);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000) throw new Error('Invalid TOKENLOOM_EVAL_TIMEOUT_MS');
for (const path of [report, join(report, 'raw'), join(report, 'inputs'), work]) mkdirSync(path, { recursive: true });
const policy = readFileSync(join(root, 'integrations/chatgpt/custom-instructions.zh-CN.txt'), 'utf8').trim();
const skill = readFileSync(join(root, 'plugins/tokenloom/skills/tokenloom/SKILL.md'), 'utf8');
const common = ['exec', '--ignore-user-config', '--json', '--ephemeral', '--skip-git-repo-check', '--color', 'never', '-C', work, '-s', 'read-only', '-m', model, '-c', 'model_reasoning_effort="low"', '-c', 'project_doc_max_bytes=0', '-c', 'web_search="disabled"', '--enable', 'skip_host_skill_discovery'];
for (const feature of ['apps', 'plugins', 'hooks', 'memories', 'multi_agent', 'browser_use', 'computer_use', 'shell_tool', 'view_image', 'unbounded_connection_retries']) common.push('--disable', feature);

function run(id, prompt, extra = []) {
  if (existsSync(join(report, id + '.json'))) throw new Error(`Evidence already exists for ${id}. Set TOKENLOOM_REPORT_DIR to a new directory instead of overwriting a measured run.`);
  writeFileSync(join(report, 'inputs', id + '.txt'), prompt);
  return new Promise((resolveRun) => {
    const started = Date.now();
    const child = spawn(process.env.TOKENLOOM_CODEX_BIN || 'codex', [...common, ...extra, '-'], { cwd: work, shell: false, windowsHide: true });
    let stdout = '', stderr = '', timedOut = false, finished = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout?.on('data', d => { stdout += d; });
    child.stderr?.on('data', d => { stderr += d; });
    child.on('error', error => { stderr += error.message; finish(null); });
    child.on('close', finish);
    child.stdin?.on('error', () => {});
    child.stdin?.end(prompt);
    function finish(code) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const sanitize = text => text.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').replace(/\bsk-[A-Za-z0-9_-]+/g, '[REDACTED]');
      writeFileSync(join(report, 'raw', id + '.jsonl'), sanitize(stdout));
      writeFileSync(join(report, 'raw', id + '.stderr.txt'), sanitize(stderr));
      const events = stdout.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
      const usage = events.filter(e => e.type === 'turn.completed').at(-1)?.usage ?? null;
      const answer = events.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message').map(e => e.item.text).join('\n');
      const itemTypes = events.filter(e => e.type === 'item.completed').map(e => e.item?.type);
      const result = { id, model, effort: 'low', code, timedOut, timeoutMs, elapsedMs: Date.now() - started, promptLocalTokens: countTokens(prompt), outputLocalTokens: countTokens(answer), usage, answer, itemTypes, errors: events.filter(e => e.type === 'error' || e.type === 'turn.failed') };
      writeFileSync(join(report, id + '.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify({ id, code, timedOut, usage, elapsedMs: result.elapsedMs, answer: answer.slice(0, 160), errors: result.errors }));
      resolveRun(result);
    }
  });
}

if (process.argv.includes('--pilot')) {
  await run('pilot', '只回答这个算式的结果，不调用工具：17 + 25 = ?');
} else if (process.argv.includes('--smoke')) {
  await run('skill-smoke', 'Use $tokenloom for this request. Read its installed SKILL.md if needed. Do not modify files. 用中文说明：缓存为什么可能返回旧数据，以及一种修复方法。', ['--disable', 'skip_host_skill_discovery', '--enable', 'shell_tool']);
} else if (process.argv.includes('--run')) {
  const fixtures = JSON.parse(readFileSync(join(report, 'live-cases.json'), 'utf8'));
  const existing = join(report, 'live-results.json');
  if (existsSync(existing) && !process.argv.includes('--resume')) throw new Error('Prior results exist. Use a new report directory, or --run --resume to schedule only never-started jobs.');
  const results = existsSync(existing) ? JSON.parse(readFileSync(existing, 'utf8')) : [];
  const jobs = [];
  for (let repeat = 0; repeat < 2; repeat++) {
    for (let i = 0; i < fixtures.length; i++) {
      const task = fixtures[i];
      const output = optimize(task.text || '', { kind: task.kind || 'text', mode: task.mode || 'safe', query: task.query || '', budget: task.budget || null, countTokens }).text;
      const prompts = {
        baseline: task.question + '\n\n' + (task.text || ''),
        concise: '请简洁回答。\n\n' + task.question + '\n\n' + (task.text || ''),
        tokenloom: (task.useSkill ? skill : policy) + '\n\n' + task.question + '\n\n' + output,
      };
      const arms = ['baseline', 'concise', 'tokenloom'];
      const rotation = (repeat + i) % arms.length;
      for (const arm of [...arms.slice(rotation), ...arms.slice(0, rotation)]) {
        jobs.push({ task, arm, repeat: repeat + 1, prompt: prompts[arm] });
      }
      if (process.exitCode) break;
    }
    if (process.exitCode) break;
  }
  // Independent fresh sessions, at most four concurrent calls. Keep all failed
  // calls in the evidence; stop scheduling later batches on missing usage.
  const pending = jobs.filter(job => !results.some(r => r.id === `${job.task.id}-${job.arm}-${job.repeat}`));
  for (let offset = 0; offset < pending.length; offset += 4) {
    const batch = await Promise.all(pending.slice(offset, offset + 4).map(async job => {
      const { task, arm, repeat, prompt } = job;
      const r = await run(`${task.id}-${arm}-${repeat}`, prompt);
      return { ...r, task: task.id, arm, repeat, qualityChecks: task.expected.every(pattern => new RegExp(pattern, 'iu').test(r.answer)) };
    }));
    results.push(...batch);
    writeFileSync(join(report, 'live-results.json'), JSON.stringify(results, null, 2));
    if (batch.some(r => !r.usage)) { console.log('Stopping: a live call did not return usage. No repeated paid retries.'); process.exitCode = 1; break; }
  }
} else console.log('Use --pilot, --smoke, or --run. These commands make live model requests using Codex login.');
