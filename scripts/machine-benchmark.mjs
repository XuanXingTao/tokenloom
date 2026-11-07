import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem, platform, release } from 'node:os';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { optimize } from '../src/core.js';
import { minifyJson, encodeTable, decodeTable } from '../src/json-table.js';
import { countTokens } from '../src/tokenizer.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(process.env.TOKENLOOM_REPORT_DIR || join(root, 'reports/2026-11-01'));
mkdirSync(join(out, 'inputs'), { recursive: true });
mkdirSync(join(out, 'raw'), { recursive: true });
const testLog = join(out, 'raw/unit-tests.tap');
if (!existsSync(testLog)) {
  const tests = spawnSync(process.execPath, ['--test', '--test-reporter=tap'], { cwd: root, encoding: 'utf8', windowsHide: true });
  writeFileSync(testLog, tests.stdout || '');
  assert.equal(tests.status, 0, tests.stderr || 'Unit tests failed');
}
const policy = readFileSync(join(root, 'integrations/chatgpt/custom-instructions.zh-CN.txt'), 'utf8').trim();
const fixtures = JSON.parse(readFileSync(join(root, 'benchmarks/cases.json'), 'utf8')).map(x => ({ ...x, source: 'existing synthetic fixture' }));
const add = (id, kind, text, more = {}) => fixtures.push({ id, kind, mode: 'safe', text, source: 'generated stress fixture', ...more });
for (const [path, kind] of [['package.json', 'json'], ['node_modules/gpt-tokenizer/package.json', 'json'], ['src/core.js', 'code'], ['README.md', 'text']]) {
  add('real-' + path.replace(/\W+/g, '-'), kind, readFileSync(join(root, path), 'utf8'), { source: 'local file / actual test output', path });
}
add('real-reports-2026-11-01-raw-unit-tests-tap', 'logs', readFileSync(testLog, 'utf8').replace(/^\uFEFF/, ''), { source: 'local file / actual test output' });
for (const size of [10, 100, 1000]) {
  const rows = Array.from({ length: size }, (_, i) => ({ request_identifier: 70000 + i, execution_status: i === 7 ? 'failed' : 'ready', timeout_seconds: 30, allowed_to_delete: false }));
  add('table-en-' + size, 'table', JSON.stringify(rows));
}
add('table-zh-100', 'table', JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ 请求编号: i, 处理状态: '等待审核', 超时秒数: 30, 是否允许删除: false }))));
add('short-key-table', 'table', JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ a: i, b: 'x' }))));
add('long-value-table', 'table', JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ id: i, description: 'A detailed source passage describing the event and its surrounding circumstances. '.repeat(20) }))));
add('nested-table-fallback', 'table', JSON.stringify([{ a: { x: 1 } }, { a: { x: 2 } }], null, 2));
add('mixed-key-fallback', 'table', '[{"a":1},{"b":2}]');
add('duplicate-key-fallback', 'table', '[{"a":1,"a":2},{"a":3,"a":4}]');
add('long-identical-log', 'logs', 'INFO worker completed health check and remains ready\n'.repeat(1000) + 'ERROR request R-781 failed after 30 seconds\n');
add('timestamped-log-noop', 'logs', Array.from({ length: 200 }, (_, i) => `2026-11-01T08:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z INFO ready\n`).join(''));
add('focus-chinese', 'text', ['缓存可减少重复计算并降低读取延迟。', '不可删除历史数据，超时上限是 30 秒。', '本段讨论花园景色与天气变化。'.repeat(100)].join('\n\n'), { mode: 'focus', query: '缓存', budget: 90 });
add('focus-overbudget', 'text', '必须保留全部 120 条记录，不得删除任何记录。', { mode: 'focus', query: '记录', budget: 3, expectedUnchanged: true });

const rows = [];
for (const fixture of fixtures) {
  const options = { ...fixture, countTokens };
  const result = optimize(fixture.text, options);
  assert.ok(result.outputTokens <= result.originalTokens);
  assert.equal(result.outputTokens, countTokens(result.text));
  if (fixture.expectedUnchanged) assert.equal(result.text, fixture.text);
  for (const token of fixture.expectedIncludes || []) assert.ok(result.text.includes(token));
  let fidelity = 'no byte change';
  if (result.transforms.includes('json-table')) { assert.equal(decodeTable(result.text), minifyJson(fixture.text)); fidelity = 'lexical JSON round-trip passed'; }
  else if (result.transforms.includes('json-whitespace')) { assert.equal(result.text, minifyJson(fixture.text)); fidelity = 'JSON lexemes retained'; }
  else if (result.lossy) fidelity = 'annotated/lossy; semantic equivalence not proven';
  const times = [];
  for (let i = 0; i < 5; i++) { const start = performance.now(); optimize(fixture.text, options); times.push(performance.now() - start); }
  times.sort((a, b) => a - b);
  const id = fixture.id;
  writeFileSync(join(out, 'inputs', id + '.original.txt'), fixture.text);
  writeFileSync(join(out, 'inputs', id + '.compact.txt'), result.text);
  rows.push({ id, source: fixture.source, kind: fixture.kind, mode: fixture.mode, inputBytes: Buffer.byteLength(fixture.text), inputTokens: result.originalTokens, outputTokens: result.outputTokens, savedTokens: result.savedTokens, savedPercent: result.savedPercent, withPolicyTokens: countTokens(policy + '\n\n' + result.text), netWithPolicy: result.originalTokens - countTokens(policy + '\n\n' + result.text), medianMs: Number(times[2].toFixed(3)), minMs: Number(times[0].toFixed(3)), maxMs: Number(times[4].toFixed(3)), fidelity, lossy: result.lossy, budgetMet: result.budgetMet, transforms: result.transforms, warnings: result.warnings });
}

// Independent randomized scalar data: no semantic oracle supplied by encoder.
let seed = 0x1729;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
const values = [null, true, false, 0, -1, 1.25, '', '中文不得删除', 'x,y:z', 'line\nquote"slash\\', '🧵', '<|endoftext|>'];
for (let trial = 0; trial < 500; trial++) {
  const width = 1 + random() % 8, height = 2 + random() % 20;
  const records = Array.from({ length: height }, () => Object.fromEntries(Array.from({ length: width }, (_, c) => ['key_' + c, values[random() % values.length]])));
  const original = JSON.stringify(records);
  assert.equal(decodeTable(encodeTable(original)), original);
  const result = optimize(original, { kind: 'table', countTokens });
  assert.ok(result.outputTokens <= result.originalTokens);
}

const cli = spawnSync(process.execPath, [join(root, 'src/cli.js'), 'compact', '-', '--kind', 'table'], { encoding: 'utf8', input: fixtures.find(x => x.id === 'table-en-100').text, windowsHide: true });
assert.equal(cli.status, 0);
assert.equal(decodeTable(cli.stdout), fixtures.find(x => x.id === 'table-en-100').text);
writeFileSync(join(out, 'raw/cli-table-report.json'), cli.stderr);
const hashes = Object.fromEntries(['src/core.js', 'src/json-table.js', 'src/cli.js', 'src/tokenizer.js', 'plugins/tokenloom/skills/tokenloom/SKILL.md'].map(path => [path, createHash('sha256').update(readFileSync(join(root, path))).digest('hex')]));
const report = { measuredAt: new Date().toISOString(), platform: platform(), osRelease: release(), node: process.version, cpu: cpus()[0].model, logicalCpus: cpus().length, ramGiB: Math.round(totalmem() / 1024 ** 3), encoding: 'o200k_base', tokenizer: 'gpt-tokenizer@4.1.0', policyTokens: countTokens(policy), randomizedRoundTrips: 500, cliRoundTrip: true, sourceHashes: hashes, rows };
writeFileSync(join(out, 'machine-results.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ fixtures: rows.length, randomRoundTrips: 500, rows: rows.map(({id,inputTokens,outputTokens,savedPercent,medianMs})=>({id,inputTokens,outputTokens,savedPercent,medianMs})) }, null, 2));

// All live prompts contain synthetic data only, not user files.
const live = [
  { id: 'table-qa', kind: 'table', text: fixtures.find(x => x.id === 'table-en-100').text, question: '仅根据以下记录回答：共有多少条记录？失败记录的 request_identifier 是什么？timeout_seconds 是多少？是否允许删除？请用中文回答，不调用工具。', expected: ['100', '70007', '30', '不|false|否'] },
  { id: 'log-qa', kind: 'logs', text: 'INFO worker ready and listening for the next request\n'.repeat(120) + 'ERROR request R-781 failed after 30 seconds\n', question: '根据以下日志，ready 记录出现多少次？失败请求编号和等待秒数分别是什么？只根据材料回答，不调用工具。', expected: ['120', 'R-781', '30'] },
  { id: 'brief-explanation', useSkill: true, kind: 'text', text: '', question: '解释 HTTP 401 与 403 的区别，并分别给出一个排查方向。请用中文回答，不调用工具。', expected: ['401', '403', '认证|身份|登录|凭证', '权限|授权'] },
  { id: 'detail-request', useSkill: true, kind: 'text', text: '', question: '请向初学者详细解释缓存失效：先说明它为什么会产生旧数据，再用具体例子解释 TTL 和主动失效，最后比较两者的优缺点。请用中文完整解释，不调用工具。', expected: ['TTL|存活|过期', '主动', '旧|陈旧|不一致', '例如|比如|假设|商品|价格|用户'] },
];
writeFileSync(join(out, 'live-cases.json'), JSON.stringify(live, null, 2));
