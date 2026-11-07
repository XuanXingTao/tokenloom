// Explicit opt-in importer for `codex exec --json` stdout. Each completed turn
// is an aggregate observation, not an individual provider HTTP request.
export function collectCodexUsage(service,task,runId,jsonl){
 let turns=0,unknown=0;
 for(const line of jsonl.split(/\r?\n/)){
  let e;try{e=JSON.parse(line);}catch{continue;}
  if(e.type==='turn.completed'){service.usage(task,`${runId}:turn:${++turns}`,e.usage??null);}
  if(e.type==='turn.failed'||e.type==='error'){service.record(task,'usage-gap',{runId,reason:e.type});unknown++;}
 }
 if(!turns||unknown)service.usage(task,`${runId}:unobserved`,null);
 return {turns,unknown};
}
