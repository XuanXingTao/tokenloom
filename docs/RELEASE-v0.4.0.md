# TokenLoom v0.4.0 — Less context. Precise recovery.

TokenLoom brings local context compression and targeted retrieval to Codex, with lightweight concise-answer instructions for ChatGPT.

## Highlights

- Query files by literal text, line range, or JSON Pointer.
- Filter and paginate JSON arrays; compute full-array counts locally.
- Recover exact fields from the original SHA-256-verified snapshot, even after the file changes.
- Preserve raw JSON number spellings, including values beyond JavaScript's safe integer range.
- Measure recovery separately and exclude conflicting usage records from totals.
- Use automatic format routing, the local MCP server, and an optional command wrapper.

## Published successful examples

| Example | Supplied-context reduction | Reported model input + output reduction | Answer check |
|---|---:|---:|---|
| Record lookup + count | **92.43%** | **13.16%** | Both arms correct |
| Recovered field lookup | **96.67%** | **13.77%** | Both arms correct |

Local counts use `o200k_base`. The live pilot contains four single-turn calls on synthetic data with precomputed retrieval, one run per arm. Usage totals cover reported successful turns; retry usage is not independently observable. See [methodology](BENCHMARKS.md) and [machine-readable evidence](../benchmarks/v0.4-results.json).

## Downloads

| Asset | Use it for |
|---|---|
| `tokenloom-source-v0.4.0.zip` | Full CLI, MCP server, source, tests, and benchmark scripts; install dependencies with pnpm. |
| `tokenloom-codex-skill-v0.4.0.zip` | Lightweight Codex instructions; does not include the runtime. |
| `tokenloom-chatgpt-v0.4.0.zip` | Instruction plugin for compatible clients; does not include a hosted MCP service. |
| `SHA256SUMS.txt` | Verify the downloaded ZIP files. |

Node.js 22+ is required for the runtime. Local compression does not need a model API key. Plain ChatGPT users can copy [English custom instructions](../integrations/chatgpt/custom-instructions.en.txt).

MIT licensed. Independently implemented. [Get started](../README.md).
