import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {optimize} from '../src/core.js';
import {countTokens} from '../src/tokenizer.js';
import {pack,recover} from '../src/context.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=join(root,'reports/2026-11-07');mkdirSync(out,{recursive:true});
const tests=spawnSync(process.execPath,['--test','--test-reporter=tap'],{cwd:root,encoding:'utf8'});
writeFileSync(join(out,'tests.tap'),tests.stdout);assert.equal(tests.status,0,tests.stderr);
const rows=[];
const tap=tests.stdout;
const before=optimize(tap,{kind:'logs',countTokens}),after=optimize(tap,{kind:'tap',countTokens});
rows.push({case:'actual Node test output (35 passing tests)',input:before.originalTokens,v01:before.outputTokens,v02:after.outputTokens,saving:after.savedPercent,lossy:after.lossy});
writeFileSync(join(out,'tests.compact.txt'),after.text);
const store=mkdtempSync(join(tmpdir(),'tokenloom-upgrade-'));
try {
 for(const [name,query,budget] of [['query with match','缓存',1800],['query without match','missingkeyword',1800],['insufficient budget','缓存',3]]) {
  const text=Array.from({length:480},(_,i)=>i===240?'缓存期限必须为 30 秒，不得删除记录。':`Background record ${i}: a long unrelated observation about the landscape and weather.`).join('\n');
  const original=optimize(text,{mode:'focus',query,budget,countTokens});
  const r=pack(text,{query,budget,store});
  if(r.changed){assert.equal(recover(r.recoveryId,store),text);assert.ok(r.text.includes('不得删除'));}
  rows.push({case:name,input:r.inputTokens,v01:original.outputTokens,v02:r.outputTokens,saving:Number((r.savedTokens/r.inputTokens*100).toFixed(2)),lossy:r.lossy,budgetMet:r.budgetMet,roundTrip:r.changed?'passed':'no transform'});
  writeFileSync(join(out,name.replaceAll(' ','-')+'.txt'),r.text);
 }
}finally{assert.equal(dirname(resolve(store)),resolve(tmpdir()));rmSync(store,{recursive:true});}
writeFileSync(join(out,'upgrade-results.json'),JSON.stringify({version:'0.2.0',encoding:'o200k_base',tests:35,scope:'local text counts only; retrieval is lossy and includes full recovery hint; no provider-usage claim',rows},null,2));
const md='# TokenLoom 0.2 本机改进测试（2026-11-07）\n\n35 项测试通过。旧版列使用原有 logs / focus 策略，新版列使用 tap / pack；检索更短依赖显式有损选择，不能理解为同等信息下无损胜出。恢复提示已计入。\n\n|案例|原文|旧策略输出|新策略输出|相对原文减少|\n|---|---:|---:|---:|---:|\n'+rows.map(r=>`|${r.case}|${r.input}|${r.v01}|${r.v02}|${r.saving}%|`).join('\n')+'\n\nTAP 为本机真实测试输出；检索数据为合成样例。日志保留失败、汇总及未知诊断，省略通过项名称和耗时。查询包按词匹配选择相邻块，会遗漏其他段落，不能用于全量统计或当作完整源码。未命中、预算不足原样返回并标明预算是否满足。没有重新运行付费模型 A/B，也没有证明超过任何上游项目。\n';
writeFileSync(join(root,'docs/UPGRADE-RESULTS.zh-CN.md'),md);console.log(JSON.stringify(rows,null,2));
