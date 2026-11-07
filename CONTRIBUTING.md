# Contributing

Use Node 22+ and the pinned pnpm version from package.json. Run `pnpm install --frozen-lockfile` and `pnpm check`. Python 3.10+ runs `python scripts/package.py` using the standard library.

Change the canonical skill in `plugins/tokenloom/skills/tokenloom/SKILL.md`, not its installed copies. Keep instructions short. Preserve explicit user detail requests and language.

Every new transform needs cases where it saves tokens, where it does not, and where its input is malformed or contains critical values. Format changes require round-trip tests. Count final markers and metadata. Keep original files intact. Treat heuristic protection as heuristic, never semantic proof.

Fixtures must be synthetic or redistributable. Commit them and regenerate `benchmarks/results.json` with `node scripts/benchmark.js --write`. Preserve no-op and negative-net results. The current fixtures measure text accounting and invariants, not model response quality.

The v0.4 live pilot and its measurement scope are documented in `docs/BENCHMARKS.md`. Claims about broader model quality, total usage or bills require additional task-level experiments. Do not publish a universal percentage from selected examples. Keep exact measurements distinct from estimates and local text counts distinct from provider usage.
