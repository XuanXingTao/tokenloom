# Data handling

Local compression reads explicitly supplied files or text. It sends no telemetry and does not call a model API. Package installation uses the network. The optional command wrapper executes the program you provide; model evaluation scripts invoke a model only with explicit live evaluation enabled.

Generated excerpts can still contain secrets from their source. Compression is not redaction or prompt-injection sanitization. Review what you send. Selection and `focus` can omit facts; table mode changes shape; log aggregation is not byte-exact replay. Preserve originals. Runtime reads and command output are limited to 2 MiB. Legacy `compact` and `pack` commands read into memory without that runtime limit; use reasonably sized files.

The MCP server exposes reading, recovery, and reporting by default. Command execution requires `--allow-run` and uses the server process's permissions. A workspace path is not an operating-system sandbox. Configure host approvals for execution tools. No remote HTTP or multi-tenant service is provided.

Originals and audit events live in the workspace's `.tokenloom-store/`. Raw snapshots are hash-verified, and read paths are checked against the real workspace root. Storage is shared by users of that workspace; filesystem permissions determine access. The 64 MiB original-storage threshold is a soft limit under concurrent processes. There is no automatic expiry; deleting the store invalidates recovery IDs. Keep this directory out of version control and published archives.

The installer copies only the canonical skill and license to the selected directory and refuses existing targets. It does not modify global AGENTS.md. Plugin/skill execution is controlled by the host.

When publishing an issue, provide a minimal synthetic example, version and reproduction command. Do not attach private conversations, credentials or full proprietary logs. For sensitive reports, use the repository owner's private vulnerability reporting feature if enabled.
