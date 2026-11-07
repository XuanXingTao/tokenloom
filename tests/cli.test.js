import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encodeTable } from '../src/json-table.js';

const cli = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)), ...args], { encoding: 'utf8', input: '{\n  "limit": 30\n}' });
test('CLI emits compact text separately from its token report', () => {
  const result = cli('compact', '-', '--kind', 'json');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{"limit":30}');
  assert.ok(JSON.parse(result.stderr).savedTokens > 0);
});
test('CLI rejects unknown options and invalid budgets', () => {
  assert.equal(cli('compact', '-', '--budget', '-3').status, 1);
  assert.equal(cli('compact', '-', '--unknown', 'x').status, 1);
});
test('CLI expands supported table payloads', () => {
  const source = '[{"name":"甲","value":1},{"name":"乙","value":2}]';
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)), 'expand-table', '-'], { encoding: 'utf8', input: encodeTable(source) });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, source);
});
