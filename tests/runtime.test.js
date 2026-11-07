import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {Service} from '../src/service.js';
import {runCommand} from '../src/runner.js';
import {route,parseCsv} from '../src/router.js';
import {collectCodexUsage} from '../src/codex-usage.js';
const cli=fileURLToPath(new URL('../src/cli.js',import.meta.url));
const temp=()=>mkdtempSync(join(tmpdir(),'tokenloom-v03-'));
const clean=p=>{assert.equal(dirname(resolve(p)),resolve(tmpdir()));rmSync(p,{recursive:true,force:true});};
const tap='TAP version 13\n'+Array.from({length:50},(_,i)=>`# Subtest: secret-answer-${i}\nok ${i+1} - secret-answer-${i}\n  ---\n  duration_ms: 10\n  type: 'test'\n  ...\n`).join('')+'1..50\n# tests 50\n# pass 50\n# fail 0\n';
test('CSV parser handles escaped quotes, embedded CRLF, empty fields and refuses malformed records',()=>{
 assert.deepEqual(parseCsv('a,b\r\n"x""y","hello\r\nworld"\r\n,z'),[['a','b'],['x"y','hello\r\nworld'],['','z']]);
 for(const s of ['a,b\n"broken,z','a,b\nx,y,z','a,b\n"x"tail,y'])assert.throws(()=>parseCsv(s));
});
test('router routes JSONL, retains numeric lexemes; malformed and code inputs unchanged',()=>{
 const s=' { "id": 9007199254740993 }\n { "id": -0 }\n';assert.equal(route(s,{name:'x.jsonl'}).text,'{"id":9007199254740993}\n{"id":-0}');
 for(const [name,text]of [['x.jsonl','{}\ninvalid'],['x.js','function a() { return 1; }'],['x.yaml','a: 1\n']])assert.equal(route(text,{name}).text,text);
 assert.equal(route(tap).text,tap);assert.ok(route(tap,{allowLossy:true}).text.length<tap.length);
});
test('service saves originals, range recovery keeps line endings, tracks full hint overhead',()=>{
 const dir=temp();try{const s=new Service(dir);writeFileSync(join(dir,'run.tap'),tap);const out=s.read('run.tap',{task:'a',allowLossy:true});assert.ok(!out.includes('secret-answer-27'));const id=out.match(/[a-f0-9]{64}/)[0];assert.equal(s.recall(id,{task:'a'}),tap);assert.ok(s.recall(id,{start:1,end:3,task:'a'}).endsWith(tap.split('\n').slice(0,3).join('\n')+'\n'));assert.throws(()=>s.read('../outside'));assert.throws(()=>s.read('.tokenloom-store/'+id+'.txt'));assert.throws(()=>s.recall(id,{start:0,task:'a'}));const r=s.report('a');assert.ok(r.fragmentSavedTokens>0);assert.ok(r.recoveryTokens>0);assert.equal(r.recoveryFailures,1);}finally{clean(dir);}
});
test('provider ledger deduplicates requests, never treats unknown usage as zero coverage',()=>{
 const dir=temp();try{const s=new Service(dir);for(let i=0;i<2;i++)s.usage('a','request-1',{input_tokens:100,output_tokens:20,reasoning_output_tokens:10});s.usage('a','request-2',null);const r=s.report('a');assert.equal(r.provider.knownTotal,120);assert.equal(r.provider.recordedRequests,2);assert.equal(r.provider.missingUsage,1);assert.equal(r.provider.complete,false);assert.throws(()=>s.usage('a','bad',{input_tokens:-1,output_tokens:0}));}finally{clean(dir);}
});
test('Codex JSONL collector counts all turns and records unknown retry usage',()=>{
 const dir=temp();try{const s=new Service(dir);const jsonl=[{type:'turn.completed',usage:{input_tokens:100,output_tokens:20}},{type:'error',message:'retry'},{type:'turn.completed',usage:{input_tokens:150,output_tokens:30}}].map(JSON.stringify).join('\n');collectCodexUsage(s,'a','run-1',jsonl);collectCodexUsage(s,'a','run-1',jsonl);const r=s.report('a');assert.equal(r.provider.knownTotal,300);assert.equal(r.provider.missingUsage,1);}finally{clean(dir);}
});
test('real process success compresses TAP; failure preserves stdout, stderr, exit code',async()=>{
 const dir=temp();try{const s=new Service(dir);writeFileSync(join(dir,'fixture.tap'),tap);const script="process.stdout.write(require('fs').readFileSync('fixture.tap'));";let r=await runCommand(s,[process.execPath,'-e',script],{allowLossy:true,task:'a'});assert.equal(r.exitCode,0);assert.ok(r.stdout.length<tap.length);r=await runCommand(s,[process.execPath,'-e',script+"process.stderr.write('ERROR unique');process.exitCode=7"],{allowLossy:true});assert.equal(r.stdout,tap);assert.equal(r.stderr,'ERROR unique');assert.equal(r.exitCode,7);}finally{clean(dir);}
});
test('argv is literal and timeout is explicit',async()=>{
 const dir=temp();try{const s=new Service(dir);const literal='hello; $(echo not-executed) & world';const r=await runCommand(s,[process.execPath,'-e','process.stdout.write(process.argv[1])',literal]);assert.equal(r.stdout,literal);const timeout=await runCommand(s,[process.execPath,'-e','setInterval(()=>{},1000)'],{timeoutMs:150});assert.equal(timeout.timedOut,true);assert.notEqual(timeout.exitCode,0);}finally{clean(dir);}
});
test('CLI run preserves executable exit code',()=>{
 const dir=temp();try{const r=spawnSync(process.execPath,[cli,'run','--root',dir,'--',process.execPath,'-e',"console.error('failed');process.exitCode=9"],{encoding:'utf8'});assert.equal(r.status,9);assert.match(r.stderr,/failed/);}finally{clean(dir);}
});
test('runner makes oversized/binary output and missing executables explicit',async()=>{
 const dir=temp();try{const s=new Service(dir);const big=await runCommand(s,[process.execPath,'-e',"process.stdout.write('x'.repeat(3*1024*1024))"]);assert.equal(big.limited,true);assert.equal(big.exitCode,125);const binary=await runCommand(s,[process.execPath,'-e','process.stdout.write(Buffer.from([255,0,254]))']);assert.equal(binary.exitCode,126);assert.match(binary.stdout,/Binary/);const absent=await runCommand(s,['tokenloom-executable-does-not-exist']);assert.ok(absent.spawnError);assert.notEqual(absent.exitCode,0);}finally{clean(dir);}
});
test('explicitly enabled MCP execution preserves failure outcome',async()=>{
 const dir=temp();const client=new Client({name:'tokenloom-run-test',version:'1.0'});try{await client.connect(new StdioClientTransport({command:process.execPath,args:[cli,'serve','--root',dir,'--allow-run'],stderr:'pipe'}));const response=await client.callTool({name:'tokenloom_run',arguments:{argv:[process.execPath,'-e',"process.stderr.write('expected failure');process.exitCode=4"],task:'execution'}});const value=JSON.parse(response.content[0].text);assert.equal(value.exitCode,4);assert.equal(value.stderr,'expected failure');}finally{await client.close();clean(dir);}
});
test('official MCP client initializes, reads, restores omitted answer; execution disabled by default',async()=>{
 const dir=temp();const client=new Client({name:'tokenloom-test',version:'1.0'});try{
 writeFileSync(join(dir,'fixture.tap'),tap);
 await client.connect(new StdioClientTransport({command:process.execPath,args:[cli,'serve','--root',dir],stderr:'pipe'}));
 const list=await client.listTools();assert.ok(list.tools.some(t=>t.name==='tokenloom_read'));assert.ok(!list.tools.some(t=>t.name==='tokenloom_run'));
 const r=await client.callTool({name:'tokenloom_read',arguments:{path:'fixture.tap',task:'protocol',allowLossy:true}});const text=r.content[0].text;assert.ok(!text.includes('secret-answer-27'));const id=text.match(/[a-f0-9]{64}/)[0];
 const recovered=await client.callTool({name:'tokenloom_recover',arguments:{id,task:'protocol'}});assert.equal(recovered.content[0].text,tap);assert.ok(recovered.content[0].text.includes('secret-answer-27'));
 const invalid=await client.callTool({name:'tokenloom_read',arguments:{path:'../outside',task:'protocol'}});assert.equal(invalid.isError,true);
 const disabled=await client.callTool({name:'tokenloom_run',arguments:{argv:['echo','no'],task:'protocol'}});assert.equal(disabled.isError,true);
 }finally{await client.close();clean(dir);}
});
