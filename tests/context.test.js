import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pack, recover } from '../src/context.js';
import { optimize } from '../src/core.js';
import { countTokens } from '../src/tokenizer.js';
const block = i => `# Subtest: case ${i}\nok ${i} - case ${i}\n  ---\n  duration_ms: 1.25\n  type: 'test'\n  ...\n`;
const source = Array.from({length:480},(_,i)=>i===240?'缓存期限必须为 30 秒，不得删除记录。':`Background record ${i}: a long unrelated observation about the landscape and weather.`).join('\n');
test('TAP compaction retains complete failure diagnostics and totals',()=>{
 const failure="# Subtest: fails\nnot ok 51 - fails\n  ---\n  error: expected 31 but got 30\n  stack: line 72\n  ...\n";
 const text='TAP version 13\n'+Array.from({length:50},(_,i)=>block(i+1)).join('')+failure+'1..51\n# tests 51\n# pass 50\n# fail 1\n';
 const r=optimize(text,{kind:'tap',countTokens});
 assert.ok(r.savedPercent>70);assert.ok(r.text.includes(failure));assert.ok(r.text.includes('# fail 1'));assert.equal(r.lossy,true);
});
test('TAP unknown diagnostics, nested tests, skip and incomplete input remain',()=>{
 for(const text of ['random ok 1\n', 'TAP version 13\n'+block(1), 'TAP version 13\nBail out! fatal\n1..1\n', 'TAP version 13\n'+block(1).replace("  type: 'test'","  custom: ERROR secret diagnostic")+'1..1\n','TAP version 13\n'+block(1).replace('ok 1 - case 1','ok 1 - case 1 # SKIP')+'1..1\n']) assert.equal(optimize(text,{kind:'tap',countTokens}).text,text);
});
test('query pack includes neighbors, measures hint, stores original and validates hash',()=>{
 const dir=mkdtempSync(join(tmpdir(),'tokenloom-context-'));
 try {
  const r=pack(source,{query:'缓存',budget:1800,store:dir});
  assert.equal(r.changed,true);assert.ok(r.text.includes('不得删除'));assert.ok(r.text.includes('Background record 216'));assert.ok(r.text.includes('Background record 287'));
  assert.equal(r.outputTokens,countTokens(r.text));assert.ok(r.outputTokens<=1800);assert.equal(recover(r.recoveryId,dir),source);
  assert.equal(pack(source,{query:'缓存',budget:1800,store:dir}).recoveryId,r.recoveryId);
  writeFileSync(join(dir,r.recoveryId+'.txt'),'tampered');assert.throws(()=>recover(r.recoveryId,dir),/verification/);assert.throws(()=>pack(source,{query:'缓存',budget:1800,store:dir}),/verification/);
 } finally {assert.equal(dirname(resolve(dir)),resolve(tmpdir()));rmSync(dir,{recursive:true});}
});
test('pack cannot silently claim unmet budget or unmatched queries',()=>{
 for(const query of ['缓存','unfindableterm']) { const r=pack(source,{query,budget:3,store:'unused'});assert.equal(r.text,source);assert.equal(r.budgetMet,false); }
 assert.throws(()=>recover('../secret','unused'),/Invalid/);
 assert.throws(()=>pack(source,{query:'',budget:100,store:'unused'}),/query/);
 assert.throws(()=>pack(source,{query:'cache',budget:NaN,store:'unused'}),/budget/);
});
test('CLI pack/recover round trip through stdin, existing output protected',()=>{
 const dir=mkdtempSync(join(tmpdir(),'tokenloom-context-cli-'));
 try {
  const cli=fileURLToPath(new URL('../src/cli.js',import.meta.url));
  const r=spawnSync(process.execPath,[cli,'pack','-','--query','缓存','--budget','1800','--store',dir],{input:source,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);const audit=JSON.parse(r.stderr);assert.ok(audit.recoveryId);
  const restored=spawnSync(process.execPath,[cli,'recover',audit.recoveryId,'--store',dir],{encoding:'utf8'});assert.equal(restored.status,0);assert.equal(restored.stdout,source);
 } finally {assert.equal(dirname(resolve(dir)),resolve(tmpdir()));rmSync(dir,{recursive:true});}
});
