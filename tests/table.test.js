import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeTable, decodeTable, minifyJson } from '../src/json-table.js';
import { optimize } from '../src/core.js';
import { countTokens } from '../src/tokenizer.js';

test('table preserves lexemes, types, order, Unicode, escapes, and special property names', () => {
  const row = '{ "__proto__": "},{:\\n\\\"", "big": 9007199254740993123456789, "z": -0, "e": 1.00e+003, "nil": null, "flag": false, "中文": "不得删除" }';
  const original = '[\n' + row + ',\n' + row + '\n]';
  const encoded = encodeTable(original);
  assert.ok(encoded);
  assert.equal(decodeTable(encoded), minifyJson(original));
});

test('table rejects nested, heterogeneous, empty and duplicate-key inputs', () => {
  for (const text of ['[]', '[{}]', '[{},{}]', '[1,2]', '[{"a":1},{"b":2}]', '[{"a":[]},{"a":[]}]', '[{"a":1,"a":2},{"a":1,"a":2}]', '[{"a":1,"\\u0061":2},{"a":1,"\\u0061":2}]']) {
    assert.equal(encodeTable(text), null, text);
  }
});

test('table decoder rejects truncation, ambiguous keys and bad row widths', () => {
  for (const text of ['{"format":"other","columns":["a"],"rows":[[1]]}', '{"format":"tokenloom.table.v1","columns":["a"],"rows":[[1,2]]}', '{"format":"tokenloom.table.v1","columns":["a","a"],"rows":[[1,2]]}', '{"format":"tokenloom.table.v1","columns":["a"],"rows":[[{}]]}', '{}', '{']) {
    assert.throws(() => decodeTable(text));
  }
});

test('table selection beats compact JSON only when header-inclusive BPE count is lower', () => {
  const data = Array.from({ length: 30 }, (_, i) => ({ request_identifier: i, execution_status: 'ready', permitted_retries: 3 }));
  const original = JSON.stringify(data);
  const result = optimize(original, { kind: 'table', countTokens });
  assert.deepEqual(result.transforms, ['json-table']);
  assert.ok(result.savedTokens > 0);
  assert.equal(result.lossy, false);
  assert.equal(decodeTable(result.text), original);
  assert.equal(result.outputTokens, countTokens(result.text));
  const tiny = '[{"a":1},{"a":2}]';
  assert.equal(optimize(tiny, { kind: 'table', countTokens }).text, tiny);
});

test('table round-trips generated scalar records across shapes', () => {
  const values = [null, true, false, 0, -7, 2.5, '', 'x,y:z', '含中文和 emoji 🧵', 'line\nquote"slash\\'];
  for (let columns = 1; columns < 9; columns++) {
    const rows = Array.from({ length: 12 }, (_, row) => Object.fromEntries(Array.from({ length: columns }, (_, col) => ['field_' + col, values[(row + col) % values.length]])));
    const original = JSON.stringify(rows);
    assert.equal(decodeTable(encodeTable(original)), original);
  }
});
