import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { installSkill } from '../scripts/install-codex.mjs';

test('installer copies canonical skill and refuses to overwrite any existing install', () => {
  const temp = mkdtempSync(join(tmpdir(), 'tokenloom-install-'));
  try {
    const target = join(temp, 'tokenloom');
    assert.equal(installSkill(target), target);
    const expected = readFileSync(new URL('../plugins/tokenloom/skills/tokenloom/SKILL.md', import.meta.url), 'utf8');
    assert.equal(readFileSync(join(target, 'SKILL.md'), 'utf8'), expected);
    assert.throws(() => installSkill(target), /exists/);
    assert.equal(readFileSync(join(target, 'SKILL.md'), 'utf8'), expected);
  } finally {
    assert.equal(dirname(resolve(temp)), resolve(tmpdir()));
    assert.ok(temp.includes('tokenloom-install-'));
    rmSync(temp, { recursive: true, force: true });
  }
});
