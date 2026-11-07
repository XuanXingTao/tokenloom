# Using TokenLoom 0.4

Install Node.js 22+ and pnpm 11.25.0, then run `pnpm install --frozen-lockfile` in the source directory. Replace paths and filenames in these examples with your own.

## Read, select, and recover

```sh
node src/cli.js read records.json --root /absolute/workspace --task lookup
node src/cli.js read records.json --root /absolute/workspace --count
node src/cli.js read records.json --root /absolute/workspace --pointer /73/allowed_to_delete
node src/cli.js read records.json --root /absolute/workspace --offset 20 --limit 5 --budget 1200
node src/cli.js read app.log --root /absolute/workspace --query timeout --budget 600
node src/cli.js read app.log --root /absolute/workspace --start 20 --end 40
node src/cli.js recall SOURCE_ID --root /absolute/workspace --pointer /73/allowed_to_delete
node src/cli.js report --root /absolute/workspace --task lookup
```

`SOURCE_ID` comes from the returned result. Recovery uses the saved snapshot, even if the source file later changes. JSON Pointer follows RFC 6901: `/` inside a key becomes `~1`, and `~` becomes `~0`.

The `json` field is a string containing the selected value's original JSON spelling. This preserves large integers, negative zero, and escape sequences. JSON selection rejects duplicate keys to avoid ambiguous pointers.

Select one mode per request: literal query, line range, or structured JSON selection. Query matching is case-insensitive and literal, with two neighboring lines on either side. A query result's `complete` refers to matches, not the whole file. Pagination exposes `hasMore`. Explicit selection is partial context; inspect its metadata before making claims about omitted content.

JSON arrays support `wherePointer` plus `equals`, as well as `offset`, `limit`, and `count`. For example, these MCP arguments count all matching records:

```json
{"path":"records.json","wherePointer":"/allowed_to_delete","equals":"false","count":true}
```

`equals` is a JSON scalar literal encoded as a string. For a string comparison, include the JSON quotes inside that string. Number filters compare original spellings, so `1` and `1.0` are distinct. Missing fields do not equal `null`. Counts scan the full local array, even when a page would show only a few rows.

Selection budgets include the JSON envelope and source ID. Default: 2,000 tokens; supported range: 64–32,000. Oversized indivisible values are rejected instead of returning malformed JSON.

## Codex MCP setup

Add a server entry to your Codex configuration, replacing both paths:

```toml
[mcp_servers.tokenloom]
command = "node"
args = ["/absolute/tokenloom/src/cli.js", "serve", "--root", "/absolute/workspace"]
```

On Windows, paths such as `E:/tokenloom/src/cli.js` work. If Node is not on the host's PATH, use its absolute executable path. Restart the host as needed after configuration.

The default tools are `tokenloom_read`, `tokenloom_recover`, and `tokenloom_report`. Use the read tool for context, recover specific missing details, and use local counts for full-array totals. The skill can be installed separately with `node scripts/install-codex.mjs`; it does not modify global MCP configuration.

To expose `tokenloom_run`, explicitly add `--allow-run` to the server arguments. Commands run with the server process's permissions; the workspace setting is not an operating-system sandbox. Configure your host's execution approvals appropriately.

## Command output and format routing

```sh
node src/cli.js run --root /absolute/workspace --task tests --allow-lossy -- node --test --test-reporter=tap
```

The wrapper passes an argument array without a shell. Pipes and shell redirection are not interpreted. Non-interactive UTF-8 text output is supported, up to 2 MiB; the default timeout is 30 seconds. Ordinary failed-command output is preserved. Explicit time/output limits stop the command and return a status.

Automatic routing supports JSON/object arrays, explicit JSONL/NDJSON files, and CSV. Passing Node TAP output and consecutive duplicate log lines can be reduced with `--allow-lossy`. Unknown formats, YAML, HTML, and Git diffs are preserved. CSV may use a smaller JSON matrix representation; table compression can change JSON shape and is intended for model reading.

## Storage and accounting

Originals and audit events are stored in the workspace's `.tokenloom-store/`. Read paths are checked against the real workspace path. Files are read into memory; the read limit is 2 MiB. Original storage has a soft 64 MiB threshold, not an atomic concurrent quota. There is no automatic expiration. Removing the store invalidates recovery IDs. Do not commit it.

`report` separates fragment savings, recovery text, and observed provider tokens. Identical duplicate usage records count once; conflicting records are excluded and reported. Coverage stays unverified because the tool cannot observe every model request. Do not add local recovery-token diagnostics to provider totals again.

For an authenticated Codex CLI, `run --observe-codex-usage -- codex exec --json ...` can observe completed-turn usage. This invokes the model and consumes usage. Retry costs not returned by the host remain unknown.

## ChatGPT

Use [English custom instructions](../integrations/chatgpt/custom-instructions.en.txt) for concise responses, or paste locally compacted content into a chat. The instruction archives are for compatible skill/plugin clients. A plain ChatGPT webpage does not read a local Codex MCP configuration. This release provides no remote HTTP endpoint or hosted authentication service.
