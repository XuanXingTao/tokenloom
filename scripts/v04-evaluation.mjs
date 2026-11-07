import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Service} from '../src/service.js';
import {runCommand} from '../src/runner.js';
import {countTokens} from '../src/tokenizer.js';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),out=join(root,'reports/v0.4'),work=join(out,'work');mkdirSync(work,{recursive:true});
const service=new Service(work);
const records=JSON.stringify(Array.from({length:120},(_,i)=>({request_identifier:70000+i,status:i===73?'failed':'ok',timeout_seconds:30,allowed_to_delete:false})));
writeFileSync(join(work,'records.json'),records);
const filtered=service.read('records.json',{task:'offline',wherePointer:'/status',equals:'"failed"',limit:5});
const source=JSON.parse(filtered).source;
const restored=service.recall(source,{task:'offline',pointer:'/73/allowed_to_delete'});assert.equal(JSON.parse(restored).json,'false');
const count=service.read('records.json',{task:'offline',count:true});assert.equal(JSON.parse(count).matchedRecords,120);
const cases=[{id:'record-qa',question:'仅根据资料返回 JSON，字段为 count, failed_id, timeout_seconds, allowed_to_delete。不要调用工具。',baseline:records,selected:count+'\n'+filtered,expected:{count:120,failed_id:70073,timeout_seconds:30,allowed_to_delete:false}},
{id:'recovery-qa',question:'仅根据资料返回 JSON，字段为 allowed_to_delete，值为布尔值。问题：编号 70073 的请求是否允许删除？不要调用工具。',baseline:records,selected:'编号 70073 对应原始数组索引 73。\n'+restored,expected:{allowed_to_delete:false}}];
const local={scope:'offline o200k_base text; JSON full scan count and preselected recovery, not autonomous model workflow',rows:cases.map(c=>({id:c.id,originalTokens:countTokens(c.baseline),selectedTokens:countTokens(c.selected)})),recoveryRoundTripPassed:true};writeFileSync(join(out,'offline.json'),JSON.stringify(local,null,2));
if(!process.argv.includes('--live')){
 const tests=spawnSync(process.execPath,['--test','--test-reporter=tap'],{cwd:root,encoding:'utf8'});writeFileSync(join(out,'tests.tap'),tests.stdout);assert.equal(tests.status,0,tests.stderr);console.log(JSON.stringify(local,null,2));
}else{
 // Four bounded live requests using existing CLI login. Explicit opt-in only.
 const resultPath=join(out,'live.json');if(existsSync(resultPath))throw new Error('Live evidence exists; move report directory intentionally before another run');
 const model=process.env.TOKENLOOM_EVAL_MODEL||'gpt-6-astra';
 const flags=['exec','--ignore-user-config','--json','--ephemeral','--skip-git-repo-check','-C',work,'-s','read-only','-m',model,'-c','model_reasoning_effort="low"','-c','project_doc_max_bytes=0','--enable','skip_host_skill_discovery'];
 for(const f of ['apps','plugins','hooks','memories','multi_agent','browser_use','computer_use','shell_tool','view_image','unbounded_connection_retries'])flags.push('--disable',f);
 const jobs=cases.flatMap(c=>['baseline','selected'].map(arm=>({c,arm})));
 const results=await Promise.all(jobs.map(async({c,arm})=>{
  const task=c.id+'-'+arm,prompt=c.question+'\n\n'+c[arm];writeFileSync(join(out,task+'.prompt.txt'),prompt);
  const run=await runCommand(service,[process.env.TOKENLOOM_CODEX_BIN||'codex',...flags,prompt],{task,timeoutMs:240000,observeCodexUsage:true});
  const sanitize=s=>s.replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/\bsk-[\w-]+/g,'[REDACTED]');
  writeFileSync(join(out,task+'.jsonl'),sanitize(run.stdout));writeFileSync(join(out,task+'.stderr.txt'),sanitize(run.stderr));
  const events=run.stdout.split(/\r?\n/).flatMap(s=>{try{return[JSON.parse(s)];}catch{return[];}});
  const answer=events.filter(e=>e.type==='item.completed'&&e.item?.type==='agent_message').map(e=>e.item.text).join('\n');
  let parsed;try{parsed=JSON.parse(answer.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{}
  const passed=parsed!==undefined&&JSON.stringify(Object.keys(parsed).sort())===JSON.stringify(Object.keys(c.expected).sort())&&Object.entries(c.expected).every(([k,v])=>parsed[k]===v);
  const r={task,arm,model,effort:'low',exitCode:run.exitCode,timedOut:run.timedOut,answer,exactAnswerPassed:passed,usage:events.filter(e=>e.type==='turn.completed').map(e=>e.usage),ledger:service.report(task)};
  writeFileSync(join(out,task+'.result.json'),JSON.stringify(r,null,2));console.log(JSON.stringify({task,passed,usage:r.usage,timedOut:r.timedOut}));return r;
 }));writeFileSync(resultPath,JSON.stringify({scope:'4 single-turn synthetic QA calls; selection and recovery precomputed; not autonomous MCP recovery or whole-task benchmark',results},null,2));
}
