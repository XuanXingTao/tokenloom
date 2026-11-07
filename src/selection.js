import {countTokens} from './tokenizer.js';

// Offset-based JSON index: values are returned from original source slices,
// never serialized through JS numbers. Duplicate object keys are rejected.
export function indexJson(text) {
  JSON.parse(text);
  let pos=0;
  const ws=()=>{while(/\s/.test(text[pos]??'')&&pos<text.length)pos++;};
  const string=()=>{const start=pos++;while(pos<text.length){if(text[pos++]==='"')break;if(text[pos-1]==='\\')pos++;}return text.slice(start,pos);};
  function node(depth=0){
    if(depth>128)throw new Error('JSON nesting exceeds 128');
    ws();const start=pos,c=text[pos];let children;
    if(c==='{'||c==='['){
      children=c==='{'?new Map():[];pos++;ws();
      while(text[pos]!== (c==='{'?'}':']')){
        if(c==='{'){ws();const key=JSON.parse(string());ws();pos++;if(children.has(key))throw new Error('Ambiguous duplicate JSON key');children.set(key,node(depth+1));}
        else children.push(node(depth+1));
        ws();if(text[pos]!==',')break;pos++;
      }pos++;
    }else if(c==='"')string();else{while(pos<text.length&&!/[\s,\]}]/.test(text[pos]))pos++;}
    return {start,end:pos,children,type:c==='{'?'object':c==='['?'array':'scalar'};
  }
  return node();
}
function pointerParts(pointer){
  if(typeof pointer!=='string'||(pointer!==''&&!pointer.startsWith('/')))throw new Error('Expected an RFC 6901 JSON pointer');
  return (pointer===''?[]:pointer.slice(1).split('/')).map(part=>{if(/~(?:[^01]|$)/.test(part))throw new Error('Invalid JSON pointer escape');return part.replace(/~1/g,'/').replace(/~0/g,'~');});
}
export function atPointer(root,pointer){
  let n=root;
  for(const key of pointerParts(pointer)){
    if(n?.type==='array'){if(!/^(0|[1-9]\d*)$/.test(key))throw new Error('Invalid array index');n=n.children[Number(key)];}
    else n=n?.children instanceof Map?n.children.get(key):undefined;
    if(!n)throw new Error('JSON pointer not found');
  }return n;
}
export function selectSource(text,opts,id){
  const budget=opts.budget??2000;
  if(!Number.isSafeInteger(budget)||budget<64||budget>32000)throw new Error('Selection budget must be 64..32000');
  const queryMode=opts.query!==undefined,lineMode=opts.start!==undefined||opts.end!==undefined,jsonMode=opts.pointer!==undefined||opts.count!==undefined||opts.wherePointer!==undefined||opts.equals!==undefined||opts.offset!==undefined||opts.limit!==undefined;
  if(Number(queryMode)+Number(lineMode)+Number(jsonMode)!==1)throw new Error('Choose exactly one selection mode: query, lines, or JSON');
  const base={source:id,scope:'selected view of saved original; recover by ID for omitted details'};
  const emit=value=>{const result=JSON.stringify({...base,...value});if(countTokens(result)>budget)throw new Error('Selection exceeds budget; narrow the pointer/range or reduce limit');return result;};
  if(jsonMode){
    const root=indexJson(text),target=atPointer(root,opts.pointer??'');
    if(opts.count!==undefined&&typeof opts.count!=='boolean')throw new Error('count must be boolean');
    if((opts.wherePointer===undefined)!==(opts.equals===undefined))throw new Error('wherePointer and equals must be provided together');
    const filtered=opts.wherePointer!==undefined;
    if(filtered||opts.count||opts.offset!==undefined||opts.limit!==undefined){
      if(target.type!=='array')throw new Error('Count/filter/page requires a JSON array');
      let records=target.children.map((n,index)=>({n,index}));
      if(filtered){
        pointerParts(opts.wherePointer);
        const expected=JSON.parse(opts.equals);if(expected!==null&&typeof expected==='object')throw new Error('equals requires a JSON scalar');
        // Match strings/bools/null by value; numbers by exact JSON spelling.
        records=records.filter(({n})=>{let v;try{v=atPointer(n,opts.wherePointer);}catch(e){if(['JSON pointer not found','Invalid array index'].includes(e.message))return false;throw e;}const raw=text.slice(v.start,v.end);if(v.type!=='scalar')return false;return typeof expected==='number'?raw===opts.equals.trim():JSON.parse(raw)===expected;});
      }
      if(opts.count)return emit({mode:'json-count',pointer:opts.pointer??'',totalRecords:target.children.length,matchedRecords:records.length,completeForCount:true});
      const offset=opts.offset??0,limit=opts.limit??10;
      if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>1000)throw new Error('offset >= 0; limit 1..1000 required');
      const page=records.slice(offset,offset+limit);
      return emit({mode:'json-records',pointer:opts.pointer??'',totalRecords:target.children.length,matchedRecords:records.length,offset,returned:page.length,hasMore:offset+page.length<records.length,records:page.map(({n,index})=>({index,json:text.slice(n.start,n.end)}))});
    }
    return emit({mode:'json-pointer',pointer:opts.pointer??'',json:text.slice(target.start,target.end)});
  }
  const lines=text.match(/[^\n]*\n|[^\n]+$/g)||[];
  if(lineMode){const start=opts.start??1,end=opts.end??lines.length;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<1||end<start||end>lines.length)throw new Error('Invalid line range');return emit({mode:'lines',start,end,totalLines:lines.length,text:lines.slice(start-1,end).join('')});}
  if(typeof opts.query!=='string'||!opts.query.trim())throw new Error('Nonempty literal query required');
  const matches=[];for(let i=0;i<lines.length;i++)if(lines[i].toLowerCase().includes(opts.query.toLowerCase()))matches.push(i);
  const included=new Set();let result=emit({mode:'query',query:opts.query,totalMatches:matches.length,shownMatches:0,complete:matches.length===0,ranges:[]});
  let shown=0;
  const ranges=set=>{const indexes=[...set].sort((a,b)=>a-b),r=[];for(const i of indexes){if(r.length&&r.at(-1).end===i)r.at(-1).end=i+1;else r.push({start:i+1,end:i+1});}return r.map(x=>({...x,text:lines.slice(x.start-1,x.end).join('')}));};
  for(const i of matches){const next=new Set(included);for(let j=Math.max(0,i-2);j<=Math.min(lines.length-1,i+2);j++)next.add(j);try{const candidate=emit({mode:'query',query:opts.query,totalMatches:matches.length,shownMatches:shown+1,complete:shown+1===matches.length,ranges:ranges(next)});result=candidate;for(const j of next)included.add(j);shown++;}catch(e){if(!e.message.startsWith('Selection exceeds'))throw e;break;}}
  if(matches.length&&!shown)throw new Error('Match and neighbor context exceed budget');return result;
}
