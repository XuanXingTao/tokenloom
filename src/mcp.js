import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {runCommand} from './runner.js';
const string={type:'string'},integer={type:'integer',minimum:1};
const selection={query:{type:'string',description:'Literal case-insensitive line search with two adjacent lines. Not semantic search.'},pointer:{type:'string',description:'RFC 6901 JSON pointer; empty string selects root.'},wherePointer:string,equals:{type:'string',description:'JSON scalar literal to match within each array record; number spelling must match exactly.'},count:{type:'boolean',description:'Count every matching array record locally, without truncating the source.'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:1000},budget:{type:'integer',minimum:64,maximum:32000},start:integer,end:integer};
export async function serve(service,{allowRun=false}={}){
 const server=new Server({name:'tokenloom',version:'0.4.0'},{capabilities:{tools:{}},instructions:'Read workspace files with tokenloom_read. A recovery ID refers to the original in this workspace. Recover omitted details before relying on partial output. No token savings are guaranteed. Commands are available only when the operator explicitly enables execution.'});
 const spec=(name,description,properties,required)=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}});
 const tools=[spec('tokenloom_read','Read or select from a workspace UTF-8 file. Select ONE mode: literal query, line range, or JSON pointer/filter/count. Selection is a partial view with recovery ID, not complete context.',{path:string,task:string,allowLossy:{type:'boolean'},...selection},['path','task']),spec('tokenloom_recover','Recover saved original by ID, or select lines / JSON pointer / filtered records / query from that immutable snapshot.',{id:string,task:string,...selection},['id','task']),spec('tokenloom_report','Report local fragment/recovery counts and imported provider usage; not a bill.',{task:string},['task'])];
 if(allowRun)tools.push(spec('tokenloom_run','Execute an explicit argv array with workspace cwd. Can modify files or access network; NOT sandboxed by TokenLoom. Preserve exit code and stderr.',{argv:{type:'array',items:string,minItems:1},task:string,allowLossy:{type:'boolean'},timeoutMs:{type:'integer',minimum:1,maximum:300000}},['argv','task']));
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools}));
 server.setRequestHandler(CallToolRequestSchema,async(req,extra)=>{
  try{
   const a=req.params.arguments??{},name=req.params.name,specification=tools.find(t=>t.name===name);
   if(!specification)throw new Error('Unknown or disabled tool');
   for(const k of specification.inputSchema.required)if(a[k]===undefined)throw new Error('Missing '+k);
   for(const [k,v]of Object.entries(a)){const s=specification.inputSchema.properties[k];if(!s)throw new Error('Unknown argument '+k);if(s.type==='string'&&typeof v!=='string'||s.type==='boolean'&&typeof v!=='boolean'||s.type==='integer'&&(!Number.isSafeInteger(v)||v<s.minimum||v>(s.maximum??Infinity))||s.type==='array'&&(!Array.isArray(v)||!v.length||v.some(x=>typeof x!=='string')))throw new Error('Invalid '+k);}
   if(typeof a.task!=='string'||!a.task.trim()||a.task.length>128)throw new Error('Invalid task');
   let text;
   if(name==='tokenloom_read')text=service.read(a.path,a);
   else if(name==='tokenloom_recover')text=service.recall(a.id,a);
   else if(name==='tokenloom_report')text=JSON.stringify(service.report(a.task));
   else {const r=await runCommand(service,a.argv,{...a,signal:extra.signal});text=JSON.stringify(r);}
   return {content:[{type:'text',text}]};
  }catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
 });
 await server.connect(new StdioServerTransport());return server;
}
