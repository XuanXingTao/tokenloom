import test from 'node:test';
import assert from 'node:assert/strict';
import { optimize } from '../src/core.js';

// Character counts test transform invariants, not claimed model-token savings.
const countTokens = text => [...text].length;
const run = (text, options = {}) => optimize(text, { countTokens, ...options });

test('plain text is unchanged in safe mode, including CRLF and whitespace', () => {
  const text = '  请保留原文。\r\n\r\n重复\r\n重复\r\n';
  const report = run(text);
  assert.equal(report.text, text);
  assert.equal(report.changed, false);
  assert.equal(report.savedTokens, 0);
  assert.equal(report.lossy, false);
});

test('JSON minifies lexically without changing numbers, duplicate keys, escapes or strings', () => {
  const text = ' {\r\n "big": 9007199254740993123456789, "x": -0, "x": 1.00e+003, "inf": 1e999, "s": " x \\" y \\\\ \\n \\u4e2d "\r\n } ';
  const report = run(text, { kind: 'json' });
  assert.equal(report.text, '{"big":9007199254740993123456789,"x":-0,"x":1.00e+003,"inf":1e999,"s":" x \\" y \\\\ \\n \\u4e2d "}');
  assert.equal(report.lossy, false);
  assert.deepEqual(report.transforms, ['json-whitespace']);
  assert.ok(report.savedTokens > 0);
});

test('JSON invalid input remains unchanged', () => {
  for (const text of ['{ "a": 1, }', '{"a": 01}', '```json\n{"a":1}\n```', '{"a": NaN}', '{"a": "oops}']) {
    const report = run(text, { kind: 'json' });
    assert.equal(report.text, text);
    assert.match(report.warnings.join(' '), /Invalid JSON/);
  }
});

test('code is preserved even when focus and impossible budget are requested', () => {
  const text = 'def check():\r\n    return " do not alter 100 "\r\n';
  const report = run(text, { kind: 'code', mode: 'focus', query: 'check', budget: 2 });
  assert.equal(report.text, text);
  assert.equal(report.budgetMet, false);
  assert.equal(report.lossy, false);
});

test('log run compression only groups consecutive exactly matching physical lines', () => {
  const line = 'INFO worker ready and listening for the next request\r\n';
  const different = 'INFO worker waiting for the next request\r\n';
  const text = line.repeat(20) + different + line;
  const report = run(text, { kind: 'logs' });
  assert.equal(report.text, '[Exact line repeated 20 times]\r\n' + line + different + line);
  assert.equal(report.lossy, true);
  assert.ok(report.savedTokens > 0);
  assert.equal(report.outputTokens, countTokens(report.text));
});

test('log compression does not erase different timestamps, blank lines, or change EOL semantics', () => {
  for (const text of [
    '10:00 ready\n10:01 ready\n10:02 ready\n',
    '\n'.repeat(100),
    'long message for a sufficiently detailed event\r\nlong message for a sufficiently detailed event\n',
  ]) assert.equal(run(text, { kind: 'logs' }).text, text);
});

test('repeated text stays unchanged unless explicitly marked as logs', () => {
  const text = 'An important repeated sentence.\n'.repeat(20);
  assert.equal(run(text).text, text);
});

test('no-net-saving guard accounts for candidate content with the actual supplied counter', () => {
  const text = '{ "a": 1 }';
  const report = optimize(text, { kind: 'json', countTokens: value => value === text ? 5 : 12 });
  assert.equal(report.text, text);
  assert.equal(report.changed, false);
  assert.equal(report.lossy, false);
  assert.equal(report.outputTokens, 5);
  assert.deepEqual(report.transforms, []);
  assert.match(report.warnings.join(' '), /no net token saving/);
});

test('focus preserves protected paragraphs verbatim and retains their source order', () => {
  const noise = ('Background prose about the weather and ordinary scenery. '.repeat(12)).trim();
  const blocks = [
    noise,
    '性能优化方案：缓存命中可以减少重复计算。',
    '必须保留接口。不要删除缓存。超时不得超过 30 秒。',
    noise,
    'Documentation: https://example.com/api and cacheKey are authoritative.',
    '```js\nconst limit = 42;\n\nrun(limit);\n```',
    '    def keep():\n        return "exact"',
    '- Keep the existing ordering.\n- Keep each bullet together.',
    noise,
  ];
  const text = blocks.join('\n\n');
  const report = run(text, { mode: 'focus', query: '性能优化', budget: 500 });
  assert.equal(report.changed, true);
  assert.equal(report.lossy, true);
  assert.equal(report.budgetMet, true);
  assert.ok(report.outputTokens <= 500);
  let lastIndex = -1;
  for (const index of [1, 2, 4, 5, 6, 7]) {
    const found = report.text.indexOf(blocks[index]);
    assert.ok(found > lastIndex, `block ${index} must be intact and ordered`);
    lastIndex = found;
  }
  assert.match(report.text, /\[Omitted \d+ source paragraphs?\]/);
  assert.match(report.warnings.join(' '), /heuristics/);
});

test('focus refuses an impossible budget instead of truncating protected data', () => {
  const text = 'The cache must retain 9007199254740993123456789 as an exact identifier.\n\n' + 'Some optional background. '.repeat(20);
  const report = run(text, { mode: 'focus', query: 'cache', budget: 20 });
  assert.equal(report.text, text);
  assert.equal(report.budgetMet, false);
  assert.equal(report.lossy, false);
  assert.match(report.warnings.join(' '), /Protected content/);
});

test('Chinese negation and spelled-out quantities remain protected', () => {
  const constraints = ['服务尚未启用。', '这里没有缓存。', '期限为三十天。'];
  const text = ['cache matters.', ...constraints, 'Optional context. '.repeat(20)].join('\n\n');
  const report = run(text, { mode: 'focus', query: 'cache', budget: 120 });
  assert.equal(report.changed, true);
  for (const constraint of constraints) assert.ok(report.text.includes(constraint));
});

test('focus does not destroy unmatched or longer fenced code and CRLF', () => {
  for (const fence of ['```js\r\nkeep();\r\n\r\n', '````js\r\n```\r\n\r\nkeep();\r\n````']) {
    const text = 'cache topic\r\n\r\n' + fence + '\r\n\r\n' + 'Optional context. '.repeat(20);
    const report = run(text, { mode: 'focus', query: 'cache', budget: 30 });
    assert.equal(report.text, text);
    assert.equal(report.budgetMet, false);
  }
});

test('focus leaves in-budget, missing-budget, and irrelevant-query input unchanged', () => {
  const text = 'A concise passage about caching.';
  assert.equal(run(text, { mode: 'focus', query: 'cache', budget: 100 }).text, text);
  assert.equal(run(text, { mode: 'focus', query: 'cache' }).text, text);
  const report = run(text, { mode: 'focus', query: 'zebra', budget: 10 });
  assert.equal(report.text, text);
  assert.match(report.warnings.join(' '), /No query-relevant/);
});

test('focus counts omission markers in budget and never returns a negative saving', () => {
  const text = 'cache\n\n' + 'ordinary background '.repeat(15);
  const impossible = run(text, { mode: 'focus', query: 'cache', budget: 6 });
  assert.equal(impossible.text, text);
  assert.equal(impossible.budgetMet, false);
  const report = run(text, { mode: 'focus', query: 'cache', budget: 50 });
  assert.equal(report.outputTokens, countTokens(report.text));
  assert.ok(report.outputTokens <= 50);
  assert.ok(report.savedTokens >= 0);
});

test('all report arithmetic includes output markers and handles empty input', () => {
  const empty = run('');
  assert.equal(empty.savedPercent, 0);
  assert.equal(empty.outputTokens, 0);
  assert.equal(empty.budgetMet, true);
  const report = run(' { "a": [ 1, 2, 3 ] } ', { kind: 'json' });
  assert.equal(report.originalTokens - report.outputTokens, report.savedTokens);
  assert.equal(report.savedPercent, Math.round(report.savedTokens / report.originalTokens * 10000) / 100);
});

test('invalid options and counters fail loudly', () => {
  assert.throws(() => optimize('x'), /countTokens/);
  assert.throws(() => run(null), /string/);
  assert.throws(() => run('x', { kind: 'html' }), /Unsupported kind/);
  assert.throws(() => run('x', { mode: 'magic' }), /Unsupported mode/);
  for (const budget of [0, -1, 1.5, Infinity, NaN, '10']) assert.throws(() => run('x', { budget }), /budget/);
  assert.throws(() => run('x', { mode: 'focus' }), /query/);
  for (const result of [-1, 0.5, NaN, Infinity, '3']) assert.throws(() => optimize('x', { countTokens: () => result }), /nonnegative safe integer/);
});
