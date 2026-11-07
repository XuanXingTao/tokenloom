import { readFileSync, writeFileSync } from 'node:fs';
import { pack, recover } from './context.js';
export function contextCommand(command,args) {
  const input=args.shift(), options={};
  if(!input) throw new Error('Input file or recovery ID required');
  while(args.length) {
    const key=args.shift(),value=args.shift();
    if(!['--query','--budget','--store','--out'].includes(key)||value===undefined||value.startsWith('--')||Object.hasOwn(options,key.slice(2))) throw new Error('Invalid or duplicate context option');
    options[key.slice(2)]=value;
  }
  if(!options.store) throw new Error('--store is required');
  let output;
  if(command==='recover') output=recover(input,options.store);
  else {
    const result=pack(readFileSync(input==='-'?0:input,'utf8'),{...options,budget:Number(options.budget)});
    const {text,...audit}=result; output=text;
    process.stderr.write(JSON.stringify({encoding:'o200k_base',...audit},null,2)+'\n');
  }
  if(options.out) writeFileSync(options.out,output,{flag:'wx'}); else process.stdout.write(output);
}
