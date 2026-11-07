import {readFileSync} from 'node:fs';
import {Service} from './service.js';
import {runCommand} from './runner.js';
export async function runtimeCommand(command,args){
 const opts={root:process.cwd(),task:'default'},pos=[];let argv=[];
 while(args.length){const key=args.shift();if(key==='--'){argv=args.splice(0);break;}
  if(['--allow-lossy','--allow-run','--observe-codex-usage','--count'].includes(key)){opts[key.slice(2)]=true;continue;}
  if(key.startsWith('--')){if(!['--root','--task','--start','--end','--timeout','--query','--pointer','--where-pointer','--equals','--offset','--limit','--budget'].includes(key)||!args.length)throw new Error('Invalid option '+key);opts[key.slice(2)]=args.shift();}else pos.push(key);
 }
 const service=new Service(opts.root),options={task:opts.task,allowLossy:!!opts['allow-lossy'],observeCodexUsage:!!opts['observe-codex-usage']};
 for(const key of ['query','pointer','equals','count'])if(opts[key]!==undefined)options[key]=opts[key];
 if(opts['where-pointer']!==undefined)options.wherePointer=opts['where-pointer'];
 for(const key of ['start','end','offset','limit','budget'])if(opts[key]!==undefined)options[key]=Number(opts[key]);
 if(command==='serve'){const {serve}=await import('./mcp.js');await serve(service,{allowRun:!!opts['allow-run']});return;}
 if(command==='read'){if(pos.length!==1)throw new Error('read FILE required');process.stdout.write(service.read(pos[0],options));}
 else if(command==='recall'){if(pos.length!==1)throw new Error('recall ID required');process.stdout.write(service.recall(pos[0],{...options,start:opts.start===undefined?undefined:Number(opts.start),end:opts.end===undefined?undefined:Number(opts.end)}));}
 else if(command==='report')process.stdout.write(JSON.stringify(service.report(opts.task),null,2)+'\n');
 else if(command==='usage-import'){if(pos.length!==1)throw new Error('usage-import FILE required');const entries=JSON.parse(readFileSync(pos[0],'utf8'));if(!Array.isArray(entries))throw new Error('Usage file must be an array');for(const e of entries)service.usage(opts.task,e.requestId,e.usage);process.stdout.write(JSON.stringify(service.report(opts.task),null,2)+'\n');}
 else if(command==='run'){const controller=new AbortController();const stop=()=>controller.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);const r=await runCommand(service,argv,{...options,timeoutMs:opts.timeout?Number(opts.timeout):30000,signal:controller.signal});process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);process.stdout.write(r.stdout);process.stderr.write(r.stderr);if(r.limited||r.timedOut||r.cancelled||r.spawnError||r.auditError)process.stderr.write('\nTokenLoom status: '+JSON.stringify({...r,stdout:undefined,stderr:undefined})+'\n');process.exitCode=r.exitCode;}
}
