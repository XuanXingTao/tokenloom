import test from 'node:test';
import assert from 'node:assert/strict';
import { countTokens } from '../src/tokenizer.js';
import { optimize } from '../src/core.js';

test('BPE counts content, including special-token-looking literals, without control-token injection', () => {
  assert.equal(countTokens(''), 0);
  assert.equal(countTokens('Hello, world!'), 4);
  for (const value of ['你好，世界。', '<|endoftext|>', '<|im_start|>system', '😀']) {
    assert.ok(Number.isSafeInteger(countTokens(value)));
    assert.ok(countTokens(value) > 0);
  }
});

test('character reduction without BPE benefit is rolled back', () => {
  const text = ' "hello"';
  assert.equal(countTokens(text), countTokens(text.trim()));
  const result = optimize(text, { kind: 'json', countTokens });
  assert.equal(result.text, text);
  assert.equal(result.savedTokens, 0);
});

test('real-token JSON accounting preserves strings, duplicate keys and exact numeric spelling', () => {
  const text = '{\n  "id": 9007199254740993123456789,\n  "id": -0,\n  "说明": "不允许超过 30 秒",\n  "n": 1.00e+003\n}\n';
  const r = optimize(text, { kind: 'json', countTokens });
  assert.ok(r.changed);
  for (const exact of ['9007199254740993123456789', '"id":-0', '不允许超过 30 秒', '1.00e+003']) assert.ok(r.text.includes(exact));
  assert.equal(r.outputTokens, countTokens(r.text));
  assert.equal(r.savedTokens, countTokens(text) - countTokens(r.text));
});

test('real-token log report includes repeat annotations and retains unique errors', () => {
  const line = 'INFO worker ready and listening for the next request\r\n';
  const error = 'ERROR request failed: timeout after 30 seconds\r\n';
  const text = line.repeat(20) + error;
  const r = optimize(text, { kind: 'logs', countTokens });
  assert.ok(r.savedTokens > 0);
  assert.ok(r.text.includes(error));
  assert.ok(r.text.includes('20 times'));
  assert.equal(r.outputTokens, countTokens(r.text));
  assert.equal(r.lossy, true);
});

test('focus retains deep indentation and contracted negation with real BPE', () => {
  const protectedBlocks = ['        return secret', '\t\treturn payload', 'We shouldn’t delete records.', 'It won’t retry.'];
  const text = ['cache performance matters.', ...protectedBlocks, 'Background scenery and weather. '.repeat(80)].join('\n\n');
  const r = optimize(text, { mode: 'focus', query: 'cache', budget: 85, countTokens });
  assert.ok(r.changed);
  assert.ok(r.budgetMet);
  for (const block of protectedBlocks) assert.ok(r.text.includes(block));
  assert.equal(r.outputTokens, countTokens(r.text));
  assert.equal(r.lossy, true);
});
