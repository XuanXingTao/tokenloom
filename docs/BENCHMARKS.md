# TokenLoom 0.4 benchmark methodology

The homepage presents two successful synthetic examples. The dataset, selection rules, and live questions are defined in `scripts/v04-evaluation.mjs`; the published measurements are in `benchmarks/v0.4-results.json`.

## Fixture and local measurements

The fixture contains 120 compact JSON records. Every record has an identifier, status, timeout, and boolean permission. One record is the query target. This is deliberately a narrow retrieval workload.

| Task | Full-file tokens | Selected context tokens | Reduction |
|---|---:|---:|---:|
| Record lookup + full-array count | 2,522 | 191 | 92.43% |
| Recovered permission field | 2,522 | 84 | 96.67% |

`gpt-tokenizer@4.1.0` with `o200k_base` counts the complete supplied data text. The first selected payload includes the full-array count response plus the filtered record response. The second includes a JSON Pointer recovery response plus the identifier-to-index mapping. Envelopes and source IDs are counted. The shared question and host system context are excluded from this local table.

Reduction = `(baseline - selected) / baseline * 100`. JSON selection drops unrelated context by design. Exact original values are checked locally, including the recovered boolean and the full count. This does not establish semantic equivalence for arbitrary questions.

## Live model pilot

Four Codex CLI calls were run: two tasks, baseline and selected arm, one run each. Model: `gpt-6-astra`; reasoning effort: low. The full JSON is supplied to the baseline. The corresponding precomputed payload is supplied to the selected arm. Both arms receive the same question within each pair. The original questions were Chinese; the publication language does not change the measured prompts.

| Task / arm | Reported input | Reported output | Total | Exact answer |
|---|---:|---:|---:|---|
| Record / baseline | 17,689 | 26 | 17,715 | Pass |
| Record / selected | 15,358 | 26 | 15,384 | Pass |
| Recovery / baseline | 17,699 | 11 | 17,710 | Pass |
| Recovery / selected | 15,261 | 11 | 15,272 | Pass |

The reductions are 13.16% and 13.77% respectively. All four answers match the expected JSON fields and values. Cached-input and reasoning-output counters were zero in the returned successful-turn records.

The harness uses ephemeral sessions, read-only mode, ignored user configuration, disabled project documentation, and disabled optional tools/features. Host/system overhead remains present and is reflected in reported input usage. The exact CLI arguments are in the script.

These totals describe `turn.completed` usage observations. Each run also produced an event without usable token counters, so the ledger marks coverage incomplete. The successful-turn totals do not prove complete network-attempt consumption or billing. No cost, subscription-quota, or internal-reasoning savings are inferred.

Retrieval and recovery are prepared locally before model invocation. This pilot does not include a model deciding which tool to call, multiple recovery rounds, or whole-session agent behavior. One repetition per arm cannot establish a robust general performance estimate. No cross-project superiority is claimed: Caveman's session benchmarks use different models, fixtures, and measurements.

## Reproduction

```sh
pnpm install --frozen-lockfile
pnpm check
node scripts/v04-evaluation.mjs
```

This creates local evidence under `reports/v0.4/` without invoking a model. The fixture and source hash are reproducible.

The optional live pilot requires an authenticated Codex CLI with the flags used in the script:

```sh
node scripts/v04-evaluation.mjs --live
```

This consumes model usage. Set `TOKENLOOM_CODEX_BIN` if the executable is not on PATH and `TOKENLOOM_EVAL_MODEL` to test a different supported model. Different models, hosts, or versions produce different results. The script refuses to overwrite existing live evidence; move the report directory intentionally before a fresh experiment.

Raw local logs and prompts stay under the ignored `reports/` directory. The public evidence retains measurements, model settings, exact answers, and coverage indicators without local machine paths or authentication data. Historical benchmarks remain under `benchmarks/` and historical reports under `docs/` for provenance; they are separate from this pilot.
