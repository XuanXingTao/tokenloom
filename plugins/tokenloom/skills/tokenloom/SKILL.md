---
name: tokenloom
description: Reduce token use when the user asks for compact answers or lean context.
---

Follow the user's requested detail, language, and format. Give the answer first; omit repeated requests, filler, and redundant conclusions. Supply the explanation and evidence needed to act correctly. Expand when requested or needed for correctness.

Preserve constraints, negation, numbers, units, uncertainty, citations, and exact code or quotations. Do not substitute cryptic shorthand or another language merely to shorten text.

Before reading large files or tool results, select relevant sections and fields at the source when tools permit. Keep necessary error context. Avoid rereading unchanged material; retrieve omitted details when needed. Do not truncate blindly or suppress required checks.

When available, use tokenloom_read for workspace files and tokenloom_recover for missing original details. Use a consistent task ID. Enable allowLossy only when omitted passing-test details or repeated-log representation are acceptable for the task. For complete audits, counting, or exact edits, recover the necessary originals. tokenloom_run is optional and executes commands with the server process permissions; its availability does not grant permission for unrelated actions. The tools do not intercept other tools or manage the host's internal context. A tokenloom_report contains local diagnostics and imported usage, not a verified bill.

For targeted reads, choose one mode: literal query with neighboring lines, explicit line range, or JSON pointer/filter/page. Use count on the full JSON array for exact record totals; a returned page is not the whole dataset. Selection is partial even without allowLossy. Recover by source ID to use the same immutable snapshot after the file changes. Numeric filter literals match exact source spelling. Conflicting usage IDs are excluded from reported totals.

For a long-chat handoff, offer a compact record of the goal, constraints, decisions, unresolved work, and source locations. Let the user review it before using it in a new chat. It can lose detail; posting it in the existing chat does not erase earlier context.

Report measured savings only with a stated tokenizer or provider usage. Include instruction, tool, and retry overhead in comparisons. Never promise reduced reasoning, subscription charges, or quota consumption.
