function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';}
export function summarizeUsage(events){
 const groups=new Map();for(const e of events.filter(x=>x.type==='provider')){if(!groups.has(e.requestId))groups.set(e.requestId,new Map());groups.get(e.requestId).set(canonical(e.usage),e.usage);}
 let missing=0,input=0,output=0;const conflictRequestIds=[];
 for(const [id,values]of groups){if(values.size>1){conflictRequestIds.push(id);continue;}const usage=[...values.values()][0];if(usage===null){missing++;continue;}input+=usage.input_tokens;output+=usage.output_tokens;}
 return {recordedRequests:groups.size,missingUsage:missing,conflicts:conflictRequestIds.length,conflictRequestIds:conflictRequestIds.sort(),inputTokens:input,outputTokens:output,knownTotal:input+output,complete:false};
}
