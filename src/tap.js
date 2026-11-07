// Original implementation; design influences documented in docs/UPSTREAM-2026-11-07.md.
// Only fold Node's flat TAP success blocks. Unknown diagnostics stay visible.
export function compactTap(text) {
  if (!/^TAP version 13\r?\n/.test(text) || !/^1\.\.\d+\r?$/m.test(text) || /^\s+Bail out!|^Bail out!/m.test(text)) return text;
  const blocks = /^# Subtest: [^\r\n]*\r?\nok \d+ - [^\r\n]*\r?\n  ---\r?\n  duration_ms: [\d.]+\r?\n  type: 'test'\r?\n  \.\.\.\r?\n/gm;
  let removed = 0;
  const result = text.replace(blocks, block => {
    if (/# (?:SKIP|TODO)\b/i.test(block)) return block;
    removed++;
    return '';
  });
  return removed ? `[Omitted ${removed} passing test detail blocks; summaries and other output follow]\n${result}` : text;
}
