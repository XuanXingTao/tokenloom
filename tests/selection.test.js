import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {selectSource,indexJson,atPointer} from '../src/selection.js';
import {summarizeUsage} from '../src/ledger.js';
import {Service} from '../src/service.js';
import {countTokens} from '../src/tokenizer.js';
const id='a'.repeat(64),read=(text,opts)=>JSON.parse(selectSource(text,opts,id));
test('JSON pointers preserve big IDs, negative zero, escape spelling and own-property keys',()=>{
 const text='{"a/b":{"~key":[9007199254740993123,-0,"\\u4e2d"]},"__proto__":false}';
 assert.equal(read(text,{pointer:'/a~1b/~0key/0'}).json,'9007199254740993123');assert.equal(read(text,{pointer:'/a~1b/~0key/1'}).json,'-0');assert.equal(read(text,{pointer:'/__proto__'}).json,'false');
 assert.throws(()=>read('{"a":1,"a":2}',{pointer:'/a'}),/duplicate/);
 for(const p of ['/a~2b','/a~1b/~0key/01','/absent'])assert.throws(()=>atPointer(indexJson(text),p));
});
test('counts inspect the whole array; paging preserves original record indexes',()=>{
 const data=JSON.stringify(Array.from({length:200},(_,i)=>({id:i,status:i%2?'ok':'failed'})));
 const count=read(data,{count:true,wherePointer:'/status',equals:'"failed"'});assert.equal(count.matchedRecords,100);assert.equal(count.totalRecords,200);
 const page=read(data,{pointer:'',wherePointer:'/status',equals:'"failed"',offset:3,limit:2});assert.deepEqual(page.records.map(x=>x.index),[6,8]);assert.equal(page.matchedRecords,100);assert.equal(page.hasMore,true);
 assert.equal(read('[{"id":9007199254740993},{"id":9007199254740992}]',{count:true,wherePointer:'/id',equals:'9007199254740993'}).matchedRecords,1);
});
test('filters distinguish missing/null/types and support zero matches',()=>{
 const data='[{"v":null},{},{"v":"1"},{"v":1}]';assert.equal(read(data,{count:true,wherePointer:'/v',equals:'null'}).matchedRecords,1);assert.equal(read(data,{count:true,wherePointer:'/v',equals:'"absent"'}).matchedRecords,0);
 assert.throws(()=>read(data,{count:true,equals:'1'}),/together/);assert.throws(()=>read(data,{query:'v',count:true}),/one selection/);
});
test('literal queries return bounded neighbors, all-match counts and explicit partial coverage',()=>{
 const text=Array.from({length:300},(_,i)=>`row ${i}: ${i%10?'other text':'ERROR timeout'}\n`).join('');
 const result=selectSource(text,{query:'ERROR',budget:350},id),r=JSON.parse(result);assert.equal(r.totalMatches,30);assert.ok(r.shownMatches<30);assert.equal(r.complete,false);assert.ok(countTokens(result)<=350);assert.ok(r.ranges[0].text.includes('row 2'));
 assert.equal(read(text,{query:'absent'}).totalMatches,0);assert.throws(()=>read('x'.repeat(10000),{query:'x',budget:100}),/exceed/);
});
test('line selection preserves CRLF and fails rather than silently truncating to budget',()=>{
 assert.equal(read('a\r\nb\r\nc',{start:2,end:3}).text,'b\r\nc');assert.throws(()=>read('{}',{pointer:'',budget:1}),/budget/);
});
test('conflicting usage is excluded deterministically, with canonical object key ordering',()=>{
 const events=[{type:'provider',requestId:'a',usage:{input_tokens:100,output_tokens:20}},{type:'provider',requestId:'a',usage:{output_tokens:20,input_tokens:100}},{type:'provider',requestId:'b',usage:{input_tokens:50,output_tokens:4}},{type:'provider',requestId:'b',usage:null},{type:'provider',requestId:'c',usage:null}];
 const r=summarizeUsage(events);assert.equal(r.knownTotal,120);assert.equal(r.conflicts,1);assert.equal(r.missingUsage,1);assert.deepEqual(r.conflictRequestIds,['b']);assert.deepEqual(summarizeUsage(events.toReversed()),r);
});
test('official MCP client selects and recovers structured data from immutable snapshot',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tokenloom-select-')),client=new Client({name:'selection-test',version:'1'});
 try{writeFileSync(join(dir,'data.json'),'[{"id":1,"status":"failed"},{"id":2,"status":"ok"}]');
 await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/cli.js',import.meta.url)),'serve','--root',dir],stderr:'pipe'}));
 const first=await client.callTool({name:'tokenloom_read',arguments:{path:'data.json',task:'a',count:true}});assert.equal(first.isError,undefined);const selected=JSON.parse(first.content[0].text);assert.equal(selected.matchedRecords,2);
 writeFileSync(join(dir,'data.json'),'[]');
 const second=await client.callTool({name:'tokenloom_recover',arguments:{id:selected.source,pointer:'/0/status',task:'a'}});assert.equal(JSON.parse(second.content[0].text).json,'"failed"');
 const bad=await client.callTool({name:'tokenloom_read',arguments:{path:'data.json',task:'a',query:'id',pointer:''}});assert.equal(bad.isError,true);
 }finally{await client.close();assert.equal(dirname(resolve(dir)),resolve(tmpdir()));rmSync(dir,{recursive:true,force:true});}
});
