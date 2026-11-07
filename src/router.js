import { extname } from 'node:path';
import { optimize } from './core.js';
import { minifyJson } from './json-table.js';
import { countTokens } from './tokenizer.js';

export function parseCsv(text) {
  const rows=[];let row=[],field='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c==='"'&&!field&&!closed){quoted=true;continue;}
    if(c===','||c==='\n'||c==='\r'){
      row.push(field);field='';closed=false;
      if(c!==','){rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}continue;
    }
    if(closed||c==='"')throw new Error('Invalid CSV quoting');field+=c;
  }
  if(quoted)throw new Error('Unclosed CSV quote');
  if(field||closed||row.length){row.push(field);rows.push(row);}
  if(rows.length<2||rows[0].length<2||rows.some(r=>r.length!==rows[0].length))throw new Error('Not a uniform CSV table');
  return rows;
}
export function route(text,{name='',allowLossy=false}={}) {
  let candidate=text,kind='passthrough',lossy=false,reason='unknown format or no shorter representation';
  const ext=extname(name).toLowerCase();
  try {
    if(/^TAP version 13\r?\n/.test(text)&&allowLossy){kind='tap';}
    else if(['.jsonl','.ndjson'].includes(ext)){
      const lines=text.trim().split(/\r?\n/), compact=lines.map(minifyJson);
      if(compact.some(x=>x===null))throw new Error('Invalid JSON Lines');
      candidate=compact.join('\n');kind='jsonl';
    } else if(ext==='.csv') {candidate=JSON.stringify({format:'tokenloom.csv.v1',rows:parseCsv(text)});kind='csv';}
    else if(ext==='.json'||/^[\s]*[\[{]/.test(text)){kind='table';}
    else if(ext==='.log'&&allowLossy){kind='logs';}
    if(['tap','table','logs'].includes(kind)){
      const r=optimize(text,{kind,countTokens});candidate=r.text;lossy=r.lossy;reason=r.warnings.join(' ');
    }
    if(countTokens(candidate)>=countTokens(text)){candidate=text;lossy=false;}
  } catch { candidate=text;lossy=false;reason='parse failed; original retained'; }
  return {text:candidate,kind,lossy,reason};
}
