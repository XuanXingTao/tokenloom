import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { countTokens } from './tokenizer.js';
const hash = text => createHash('sha256').update(text).digest('hex');
function terms(text) {
  const words = text.toLowerCase().match(/[\p{Script=Han}]+|[\p{L}\p{N}_]+/gu) || [];
  return [...new Set(words.flatMap(w => /\p{Script=Han}/u.test(w) && w.length > 1 ? [...w].slice(1).map((_,i)=>w.slice(i,i+2)) : [w]))];
}
export function recover(id, store) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid recovery ID');
  const text = readFileSync(join(resolve(store), id + '.txt'), 'utf8');
  if (hash(text) !== id) throw new Error('Recovery content failed SHA-256 verification');
  return text;
}
// Explicit, lossy local retrieval. Neighbor blocks retain nearby context; this
// is not a code dependency graph and does not claim semantic completeness.
export function pack(text, {query, budget, store}) {
  if (typeof query !== 'string' || !terms(query).length) throw new Error('A searchable query is required');
  if (!Number.isSafeInteger(budget) || budget < 1) throw new Error('A positive integer budget is required');
  if (!store) throw new Error('An explicit recovery store is required');
  if (Buffer.byteLength(text) > 2*1024*1024) throw new Error('Context pack limit is 2 MiB; split the input');
  const inputTokens = countTokens(text);
  const fallback = reason => ({text, inputTokens, outputTokens:inputTokens, savedTokens:0, changed:false, lossy:false, budgetMet:inputTokens<=budget, reason});
  if (inputTokens <= budget) return fallback('already within budget');
  const lines = text.split('\n');
  const blocks = [];
  for (let i=0;i<lines.length;i+=24) blocks.push({start:i+1,end:Math.min(i+24,lines.length),text:lines.slice(i,i+24).join('\n')});
  const queryTerms=terms(query), sets=blocks.map(b=>new Set(terms(b.text)));
  const weights=queryTerms.map(t=>Math.log(1+blocks.length/(1+sets.filter(s=>s.has(t)).length)));
  const ranked=blocks.map((b,i)=>({i,score:queryTerms.reduce((n,t,j)=>n+(sets[i].has(t)?weights[j]:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.i-b.i);
  if (!ranked.length) return fallback('no lexical match');
  const id=hash(text);
  const render = selected => `[Partial source; omitted blocks exist. Recover full text: tokenloom recover ${id} --store ${JSON.stringify(resolve(store))}]\n` + [...selected].sort((a,b)=>a-b).map(i=>`[Lines ${blocks[i].start}-${blocks[i].end}]\n${blocks[i].text}`).join('\n');
  const selected=new Set();
  for (const {i} of ranked) {
    const group=[i-1,i,i+1].filter(j=>j>=0&&j<blocks.length);
    const candidate=new Set([...selected,...group]);
    if (countTokens(render(candidate))<=budget) for(const j of group) selected.add(j);
  }
  if (!selected.size) return fallback('match and neighbor context exceed budget');
  const output=render(selected), outputTokens=countTokens(output);
  if (outputTokens>=inputTokens) return fallback('no net saving including recovery hint');
  mkdirSync(resolve(store),{recursive:true});
  try { writeFileSync(join(resolve(store),id+'.txt'),text,{flag:'wx',mode:0o600}); }
  catch(error) { if(error.code!=='EEXIST') throw error; if(recover(id,store)!==text) throw new Error('Recovery store mismatch'); }
  return {text:output,inputTokens,outputTokens,savedTokens:inputTokens-outputTokens,changed:true,lossy:true,budgetMet:true,recoveryId:id,selectedBlocks:selected.size,totalBlocks:blocks.length,reason:'query matches with adjacent blocks; review before sending'};
}
