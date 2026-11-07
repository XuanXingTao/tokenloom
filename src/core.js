/**
 * Deterministic local transforms. No network access, model calls, or hidden summary.
 * countTokens measures the complete returned text, including every marker.
 */

import { minifyJson as lexicalJson, encodeTable, decodeTable } from './json-table.js';
import { compactTap } from './tap.js';

const KINDS = new Set(['text', 'json', 'table', 'logs', 'code', 'tap']);
const MODES = new Set(['safe', 'focus']);
const CONSTRAINT = /\b(?:must|shall|never|\w+n['’]t|do\s+not|cannot|not|no|only|except|unless|required?|requirements?|constraints?|preserve|exact|at\s+least|at\s+most|minimum|maximum)\b|不|未|无|没有|并非|禁止|必须|务必|只能|至少|至多|否则|除非|前提|要求|约束|限制|注意|保留|原样|精确|勿|仅/iu;
const IDENTIFIER = /[a-z][A-Z]|\b\w+_\w+\b|(?:https?:\/\/|www\.)|[\w.+-]+@[\w.-]+|(?:\b|[./\\])[\w-]+(?:[./\\][\w-]+)+|`/u;

function logRuns(text, count) {
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
  if (lines.at(-1) === '') lines.pop();
  let result = '';
  let runs = 0;
  for (let i = 0; i < lines.length;) {
    let end = i + 1;
    while (end < lines.length && lines[end] === lines[i]) end++;
    const original = lines.slice(i, end).join('');
    const body = lines[i].replace(/(?:\r\n|\r|\n)$/, '');
    const eol = lines[i].slice(body.length);
    const replacement = `[Exact line repeated ${end - i} times]${eol || '\n'}${lines[i]}`;
    // Blank line runs and short runs usually cost more after annotation.
    if (end - i > 1 && body.length > 0 && count(replacement) < count(original)) {
      result += replacement;
      runs++;
    } else result += original;
    i = end;
  }
  return { text: result, runs };
}

function paragraphs(text) {
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
  if (lines.at(-1) === '') lines.pop();
  const blocks = [];
  let current = '';
  let fence = null;
  let protectedCode = false;
  let hasBody = false;
  let afterBlank = false;
  const push = () => {
    if (current) blocks.push({ text: current, protectedCode });
    current = '';
    protectedCode = false;
    hasBody = false;
    afterBlank = false;
  };
  for (const line of lines) {
    const body = line.replace(/(?:\r\n|\r|\n)$/, '');
    const blank = /^[ \t]*$/.test(body);
    if (afterBlank && !blank && !fence) push();
    current += line;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(body);
    if (fence) {
      protectedCode = true;
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && /^[ \t]*$/.test(marker[2])) fence = null;
    } else if (marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      protectedCode = true;
    }
    if (/^(?: {4,}| *\t)[ \t]*\S/.test(body)) protectedCode = true;
    if (!blank) hasBody = true;
    afterBlank = blank && hasBody && !fence;
  }
  push();
  return blocks;
}

function isProtected(block) {
  return block.protectedCode ||
    /\p{N}|[零〇一二三四五六七八九十百千万亿两]/u.test(block.text) || CONSTRAINT.test(block.text) || IDENTIFIER.test(block.text) ||
    /^\s*(?:[-*+]\s|>\s?|\|)/m.test(block.text);
}

function queryTerms(query) {
  const terms = new Set();
  const chunks = query.toLowerCase().match(/[\p{Script=Han}]+|[\p{L}\p{N}_-]+/gu) ?? [];
  for (const chunk of chunks) {
    if (/\p{Script=Han}/u.test(chunk)) {
      const chars = [...chunk];
      if (chars.length === 1) terms.add(chunk);
      else for (let i = 0; i < chars.length - 1; i++) terms.add(chars.slice(i, i + 2).join(''));
    } else terms.add(chunk);
  }
  return [...terms];
}

function renderSelection(blocks, selected) {
  let result = '';
  for (let i = 0; i < blocks.length;) {
    if (selected.has(i)) {
      result += blocks[i++].text;
      continue;
    }
    let end = i + 1;
    while (end < blocks.length && !selected.has(end)) end++;
    result += `\n[Omitted ${end - i} source paragraph${end - i === 1 ? '' : 's'}]\n\n`;
    i = end;
  }
  return result;
}

function focusText(text, query, budget, count) {
  if (budget === null) return { text, warning: 'Focus mode needs an explicit token budget; original text preserved.' };
  const blocks = paragraphs(text);
  if (blocks.length > 1000) return { text, warning: 'Focus mode supports at most 1,000 paragraphs; split the document. Original text preserved.' };
  const terms = queryTerms(query);
  const ranked = blocks.map((block, index) => ({
    index,
    score: terms.reduce((score, term) => score + Number(block.text.toLowerCase().includes(term)), 0),
    protected: isProtected(block),
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  const relevant = ranked.find(block => block.score > 0);
  if (!relevant) return { text, warning: 'No query-relevant paragraph was identified; original text preserved.' };
  const selected = new Set(ranked.filter(block => block.protected).map(block => block.index));
  if (count(renderSelection(blocks, selected)) > budget) {
    return { text, warning: 'Protected content and omission markers exceed the budget; original text preserved.' };
  }
  selected.add(relevant.index);
  if (count(renderSelection(blocks, selected)) > budget) {
    return { text, warning: 'The most relevant paragraph and protected content exceed the budget; original text preserved.' };
  }
  // Greedy, deterministic selection. Higher query overlap wins; ties preserve
  // source order. Every accepted candidate is measured with all markers.
  for (const block of ranked) {
    if (selected.has(block.index)) continue;
    selected.add(block.index);
    if (count(renderSelection(blocks, selected)) > budget) selected.delete(block.index);
  }
  return { text: renderSelection(blocks, selected), omitted: blocks.length - selected.size };
}

/**
 * @param {string} text
 * @param {{kind?: 'text'|'json'|'table'|'logs'|'code'|'tap', mode?: 'safe'|'focus', budget?: number|null, query?: string, countTokens: (text:string)=>number}} options
 * @returns {{text:string,originalTokens:number,outputTokens:number,savedTokens:number,savedPercent:number,changed:boolean,transforms:string[],warnings:string[],budgetMet:boolean,lossy:boolean}}
 */
export function optimize(text, { kind = 'text', mode = 'safe', budget = null, query = '', countTokens } = {}) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (typeof countTokens !== 'function') throw new TypeError('countTokens must be a function');
  if (!KINDS.has(kind)) throw new RangeError(`Unsupported kind: ${kind}`);
  if (!MODES.has(mode)) throw new RangeError(`Unsupported mode: ${mode}`);
  if (budget !== null && (!Number.isSafeInteger(budget) || budget <= 0)) throw new RangeError('budget must be a positive safe integer or null');
  if (mode === 'focus' && (typeof query !== 'string' || !query.trim())) throw new TypeError('focus mode requires a nonempty query');
  const count = value => {
    const n = countTokens(value);
    if (!Number.isSafeInteger(n) || n < 0) throw new TypeError('countTokens must return a nonnegative safe integer');
    return n;
  };
  const originalTokens = count(text);
  const warnings = [];
  const candidateWarnings = [];
  const transforms = [];
  let candidate = text;
  let lossy = false;
  if (kind === 'json' || kind === 'table') {
    const compact = lexicalJson(text);
    if (compact === null) warnings.push('Invalid JSON; original text preserved.');
    else if (compact !== text) {
      candidate = compact;
      transforms.push('json-whitespace');
    }
    if (kind === 'table' && compact !== null) {
      const table = encodeTable(text);
      // Round-trip verifies every key, value, scalar spelling and row order.
      if (table && decodeTable(table) === compact && count(table) < Math.min(count(candidate), originalTokens)) {
        candidate = table;
        transforms.splice(0, transforms.length, 'json-table');
        candidateWarnings.push('Table representation changes the JSON shape for model reading. Use expand-table to recover compact JSON; original formatting is not retained.');
      }
    }
  } else if (kind === 'tap') {
    candidate = compactTap(text);
    if (candidate !== text) {
      transforms.push('tap-success-details'); lossy = true;
      candidateWarnings.push('Passing test detail blocks omitted. Keep the original to inspect names and timings; not a TAP replay format.');
    }
  } else if (kind === 'logs') {
    const compressed = logRuns(text, count);
    if (compressed.runs) {
      candidate = compressed.text;
      transforms.push('exact-log-runs');
      candidateWarnings.push('Log runs use an annotated representation. Keep the original for byte-exact replay or machine parsing.');
      lossy = true;
    }
  } else if (kind === 'code') {
    warnings.push('Code is preserved verbatim.');
  } else if (mode === 'focus' && (budget === null || originalTokens > budget)) {
    const focused = focusText(text, query, budget, count);
    candidate = focused.text;
    if (focused.warning) warnings.push(focused.warning);
    if (focused.omitted > 0) {
      transforms.push('query-focus');
      candidateWarnings.push(`Lossy extraction: ${focused.omitted} source paragraphs omitted. Protection rules are heuristics; review against the original before sending.`);
      lossy = true;
    }
  }
  if (mode === 'focus' && kind !== 'text') warnings.push('Focus extraction applies only to plain text; this kind uses its conservative transform.');
  let outputTokens = count(candidate);
  if (candidate !== text && outputTokens >= originalTokens) {
    candidate = text;
    outputTokens = originalTokens;
    transforms.length = 0;
    lossy = false;
    warnings.push('Candidate had no net token saving after markers; original text preserved.');
  } else warnings.push(...candidateWarnings);
  const savedTokens = originalTokens - outputTokens;
  return {
    text: candidate,
    originalTokens,
    outputTokens,
    savedTokens,
    savedPercent: originalTokens ? Math.round(savedTokens / originalTokens * 10000) / 100 : 0,
    changed: candidate !== text,
    transforms,
    warnings,
    budgetMet: budget === null || outputTokens <= budget,
    lossy,
  };
}
