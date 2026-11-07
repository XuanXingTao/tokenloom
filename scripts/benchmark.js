import { readFileSync, writeFileSync } from 'node:fs';
import { optimize } from '../src/core.js';
import { countTokens, encoding } from '../src/tokenizer.js';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const cases = JSON.parse(read('benchmarks/cases.json'));
const policy = read('integrations/chatgpt/custom-instructions.zh-CN.txt').trim();
const rows = cases.map(({ text, expectedIncludes = [], expectedUnchanged, ...options }) => {
  const result = optimize(text, { ...options, countTokens });
  const checks = expectedIncludes.every(value => result.text.includes(value)) && (!expectedUnchanged || result.text === text);
  if (!checks || result.outputTokens > result.originalTokens) throw new Error(`Fixture invariant failed: ${options.id}`);
  // Concatenation is re-counted: token counts are not generally additive.
  const withPolicyTokens = countTokens(policy + '\n\n' + result.text);
  return {
    id: options.id, kind: options.kind, mode: options.mode,
    originalTokens: result.originalTokens, compactTokens: result.outputTokens,
    savedTokens: result.savedTokens, savedPercent: result.savedPercent,
    withPolicyTokens, netSavedWithPolicy: result.originalTokens - withPolicyTokens,
    lossy: result.lossy, budgetMet: result.budgetMet, checks,
    warnings: result.warnings, output: result.text,
  };
});
const report = {
  version: '0.1.0', encoding, tokenizerPackage: 'gpt-tokenizer@4.1.0',
  scope: 'Deterministic synthetic fixtures; local visible-text counts, NOT model quality, billed usage or a Caveman performance comparison.',
  instructionTokens: {
    skillFile: countTokens(read('plugins/tokenloom/skills/tokenloom/SKILL.md')),
    customInstructionsZh: countTokens(policy),
    customInstructionsEn: countTokens(read('integrations/chatgpt/custom-instructions.en.txt').trim()),
    conciseControl: countTokens('Answer concisely.'),
  },
  rows,
};
if (process.argv.includes('--write')) writeFileSync(new URL('../benchmarks/results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
