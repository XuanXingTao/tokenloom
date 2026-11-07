import {mkdirSync,readFileSync,writeFileSync,readdirSync,statSync,realpathSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {route} from './router.js';
import {recover} from './context.js';
import {countTokens} from './tokenizer.js';
import {selectSource} from './selection.js';
import {summarizeUsage} from './ledger.js';
const selecting=opts=>['query','pointer','count','wherePointer','equals','offset','limit','start','end','budget'].some(k=>opts[k]!==undefined);
export const MAX_INPUT=2*1024*1024;
export class Service {
 constructor(root){this.root=realpathSync(root);this.store=join(this.root,'.tokenloom-store');this.events=join(this.store,'events');}
 path(file){const p=realpathSync(resolve(this.root,file)),r=relative(this.root,p);if(r==='..'||r.startsWith('..\\')||r.startsWith('../')||isAbsolute(r)||p===this.store||p.startsWith(this.store+'/')||p.startsWith(this.store+'\\'))throw new Error('Path outside allowed source workspace');return p;}
 init(){mkdirSync(this.store,{recursive:true});if(realpathSync(this.store)!==resolve(this.store))throw new Error('Store symlink not permitted');mkdirSync(this.events,{recursive:true});if(realpathSync(this.events)!==resolve(this.events))throw new Error('Event directory symlink not permitted');}
 record(task,type,data){if(typeof task!=='string'||!task.trim()||task.length>128)throw new Error('task must contain 1..128 characters');this.init();const event={id:randomUUID(),at:new Date().toISOString(),task,type,...data};writeFileSync(join(this.events,event.id+'.json'),JSON.stringify(event),{flag:'wx',mode:0o600});return event;}
 save(text){this.init();const bytes=readdirSync(this.store).filter(n=>/^[a-f0-9]{64}\.txt$/.test(n)).reduce((n,f)=>n+statSync(join(this.store,f)).size,0);const id=createHash('sha256').update(text).digest('hex');try{if(recover(id,this.store)===text)return id;}catch(e){if(e.code!=='ENOENT')throw e;}if(bytes+Buffer.byteLength(text)>64*1024*1024)throw new Error('Recovery store quota 64 MiB reached');writeFileSync(join(this.store,id+'.txt'),text,{flag:'wx',mode:0o600});return id;}
 compact(text,{name='',allowLossy=false,task='default'}={}){
  const original=countTokens(text);let r=route(text,{name,allowLossy}),id=null;
  if(r.text!==text){
   try{id=this.save(text);const hint=`\n[Original: tokenloom recall ${id}; use the same workspace. Partial recovery supports start/end lines.]`;
    if(countTokens(r.text+hint)<original)r.text+=hint;else{r.text=text;r.lossy=false;id=null;}
   }catch(e){r={text,kind:r.kind,lossy:false,reason:'Storage unavailable; original retained: '+e.message};id=null;}
  }
  this.record(task,'fragment',{route:r.kind,lossy:r.lossy,inputTokens:original,outputTokens:countTokens(r.text),recoveryId:id,reason:r.reason});
  return r.text;
 }
 read(file,opts={}){const p=this.path(file);if(statSync(p).size>MAX_INPUT)throw new Error('Read limit 2 MiB; request a smaller source file');const b=readFileSync(p);const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b);if(selecting(opts)){const id=this.save(text);const output=selectSource(text,opts,id);this.record(opts.task??'default','fragment',{route:'selection',lossy:true,inputTokens:countTokens(text),outputTokens:countTokens(output),recoveryId:id});return output;}return this.compact(text,{...opts,name:p});}
 recall(id,opts={}){const {start,end,task='default'}=opts;
  try{this.init();if(!/^[a-f0-9]{64}$/.test(id))throw new Error('Invalid recovery ID');const p=join(this.store,id+'.txt');if(realpathSync(p)!==p)throw new Error('Recovery symlink not permitted');if(statSync(p).size>MAX_INPUT)throw new Error('Stored source exceeds recovery size limit');const text=recover(id,this.store);let output=text;
   if(['pointer','query','count','wherePointer','equals','offset','limit','budget'].some(k=>opts[k]!==undefined))output=selectSource(text,opts,id);
   else if(start!==undefined||end!==undefined){const lines=text.match(/[^\n]*\n|[^\n]+$/g)||[];const a=start??1,b=end??lines.length;if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<1||b<a||b>lines.length)throw new Error('Invalid line range');output=`[Source ${id}; lines ${a}-${b} of ${lines.length}]\n`+lines.slice(a-1,b).join('');}
   if(Buffer.byteLength(output)>MAX_INPUT)throw new Error('Recovery exceeds 2 MiB; request a line range');
   this.record(task,'recovery',{recoveryId:id,start,end,outputTokens:countTokens(output),status:'ok'});return output;
  }catch(e){this.record(task,'recovery',{recoveryId:id,status:'error',error:e.message});throw e;}
 }
 usage(task,requestId,usage){if(typeof requestId!=='string'||!requestId)throw new Error('requestId required');if(usage!==null){for(const k of ['input_tokens','output_tokens'])if(!Number.isSafeInteger(usage[k])||usage[k]<0)throw new Error('Invalid usage');}return this.record(task,'provider',{requestId,usage});}
 report(task){this.init();const events=readdirSync(this.events).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync(join(this.events,f),'utf8'))).filter(e=>e.task===task);return {task,eventCount:events.length,fragmentSavedTokens:events.filter(e=>e.type==='fragment').reduce((n,e)=>n+e.inputTokens-e.outputTokens,0),recoveryTokens:events.filter(e=>e.type==='recovery').reduce((n,e)=>n+(e.outputTokens||0),0),recoveryFailures:events.filter(e=>e.type==='recovery'&&e.status==='error').length,provider:summarizeUsage(events),note:'Conflicting request IDs are excluded from totals. Coverage remains unverified. Tool/recovery tokens are diagnostics, not extra provider charges.'};}
}
