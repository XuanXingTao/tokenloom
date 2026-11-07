import {mkdirSync,writeFileSync,readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {Service} from '../src/service.js';
import {countTokens} from '../src/tokenizer.js';
const root=fileURLToPath(new URL('../',import.meta.url)),out=join(root,'reports/v0.3');mkdirSync(out,{recursive:true});
const run=spawnSync(process.execPath,['--test','--test-reporter=tap'],{cwd:root,encoding:'utf8'});writeFileSync(join(out,'tests.tap'),run.stdout);assert.equal(run.status,0,run.stderr);
const work=mkdtempSync(join(tmpdir(),'tokenloom-v03-eval-'));
try{
 const service=new Service(work);writeFileSync(join(work,'tests.tap'),run.stdout);
 const compressed=service.read('tests.tap',{task:'recovery-demo',allowLossy:true});const id=compressed.match(/[a-f0-9]{64}/)?.[0];assert.ok(id);
 const partial=service.recall(id,{task:'recovery-demo',start:1,end:8});const full=service.recall(id,{task:'recovery-demo'});assert.equal(full,run.stdout);
 const result={scope:'offline text and real process/protocol tests; NOT model usage',originalTokens:countTokens(full),compressedWithHintTokens:countTokens(compressed),partialRecoveryTokens:countTokens(partial),fullRecoveryTokens:countTokens(full),withPartialRecovery:countTokens(compressed)+countTokens(partial),withFullRecovery:countTokens(compressed)+countTokens(full),allTestsPassed:true,report:service.report('recovery-demo')};
 // Actual historical provider records remain distinguishable from this offline evaluation.
 const historyPath=join(root,'reports/2026-11-01/live-results.json');
 const historical=existsSync(historyPath)?JSON.parse(readFileSync(historyPath,'utf8')):[];
 for(const r of historical)service.usage('historical-v01',r.id,r.usage);
 result.historicalProviderImport=service.report('historical-v01');
 writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2));
 writeFileSync(join(out,'compressed.txt'),compressed);writeFileSync(join(out,'partial.txt'),partial);
 const md=`# TokenLoom 0.3 验证\n\n全量自动测试通过，包含真实子进程退出码/超时与官方 MCP 客户端初始化、调用、恢复。\n\n|口径|tokens|\n|---|---:|\n|原始测试输出|${result.originalTokens}|\n|压缩输出，含恢复提示|${result.compressedWithHintTokens}|\n|部分恢复附加文本|${result.partialRecoveryTokens}|\n|压缩+部分恢复|${result.withPartialRecovery}|\n|压缩+全量恢复|${result.withFullRecovery}|\n\n全量恢复后可比原文更贵，不能只展示压缩阶段节省。以上为本地 o200k_base 文本之和，不含模型额外轮次和宿主包装。\n\n历史 0.1 的 24 次真实调用已测试导入：${result.historicalProviderImport.provider.missingUsage} 次缺失 usage；账本保持 incomplete，不将缺失当作零。历史数据不作为 0.3 效果证据。0.3 尚未进行完整真实模型对照，未宣称端到端节省率。\n`;
 writeFileSync(join(root,'docs/V03-RESULTS.zh-CN.md'),md);console.log(JSON.stringify(result,null,2));
}finally{assert.equal(dirname(resolve(work)),resolve(tmpdir()));rmSync(work,{recursive:true});}
