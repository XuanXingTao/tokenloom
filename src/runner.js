import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {collectCodexUsage} from './codex-usage.js';
// Explicit argv execution. No shell interpolation; no assumption of sandboxing.
export function runCommand(service,argv,{task='default',allowLossy=false,timeoutMs=30000,signal,observeCodexUsage=false}={}){
 if(!Array.isArray(argv)||!argv.length||argv.some(s=>typeof s!=='string'))throw new Error('Command argv required');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw new Error('timeoutMs must be 1..300000');
 if(typeof task!=='string'||!task.trim()||task.length>128)throw new Error('Invalid task');
 return new Promise(resolveRun=>{
  const started=Date.now(),child=spawn(argv[0],argv.slice(1),{cwd:service.root,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  let out=[],err=[],size=0,limited=false,timedOut=false,cancelled=false,spawnError=null;
  const stop=()=>{if(!child.pid)return;if(process.platform==='win32'){const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}};
  const timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);
  const cancel=()=>{cancelled=true;stop();};signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const collect=target=>b=>{size+=b.length;if(size<=2*1024*1024)target.push(b);else if(!limited){limited=true;stop();}};
  child.stdout.on('data',collect(out));child.stderr.on('data',collect(err));
  child.on('error',e=>{spawnError=e.message;});
  child.on('close',(code,signalName)=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);
   try{const stdout=Buffer.concat(out).toString('utf8'),stderr=Buffer.concat(err).toString('utf8');
    if(observeCodexUsage)collectCodexUsage(service,task,randomUUID(),stdout);
    // Failed, interrupted, binary/invalid UTF-8 output is never compressed.
    const valid=Buffer.from(stdout).equals(Buffer.concat(out))&&Buffer.from(stderr).equals(Buffer.concat(err))&&!stdout.includes('\0')&&!stderr.includes('\0');
    const clean=code===0&&!limited&&!timedOut&&!cancelled&&!spawnError&&valid;
    const compacted=clean?service.compact(stdout,{task,allowLossy}):stdout;
    service.record(task,'command',{exitCode:code,signal:signalName,timedOut,cancelled,limited,spawnError,elapsedMs:Date.now()-started});
    resolveRun({stdout:valid?compacted:'[Binary or invalid UTF-8 stdout; use original command for binary output]',stderr:valid?stderr:'[Binary or invalid UTF-8 stderr]',exitCode:timedOut?124:cancelled?130:limited?125:!valid?126:code??1,timedOut,cancelled,limited,spawnError});
   }catch(e){resolveRun({stdout:Buffer.concat(out).toString('utf8'),stderr:Buffer.concat(err).toString('utf8'),exitCode:code??1,auditError:e.message,limited,timedOut,cancelled});}
  });
 });
}
