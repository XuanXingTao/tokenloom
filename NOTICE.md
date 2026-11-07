# Attribution and provenance

TokenLoom's implementation and instruction files are original and licensed under MIT. It is not affiliated with OpenAI, Microsoft, Caveman, RTK or TOON.

Research inspiration:

- Caveman, researched at commit `9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4`: https://github.com/JuliusBrussee/caveman. The source archive was downloaded separately, not bundled or executed. Archive SHA-256: `e6fd107a4be45554fb0d5902c419b7c935d4ae7fb4a84344d99ee87f4f90b2cb`.
- RTK: https://github.com/rtk-ai/rtk — command-output reduction ideas. No source copied or linked into this program.
- TOON: https://github.com/toon-format/toon — shared field-header idea. TokenLoom's JSON table envelope is an independent format, not a TOON encoder or decoder.
- LLMLingua: https://github.com/microsoft/LLMLingua — budget-aware selection research. No model weights or neural compressor are bundled.

Runtime dependency: `gpt-tokenizer@4.1.0`, MIT, https://github.com/niieani/gpt-tokenizer. Installation downloads this package, including its own license and tokenizer data notices. Source ZIPs do not redistribute node_modules. Do not remove dependency licenses if distributing a future bundled executable.

Research links and interpretation are maintained in `docs/RESEARCH.zh-CN.md` and `docs/RELATED-WORK.zh-CN.md`; third-party benchmark claims are not TokenLoom results.
# 2026-11-07 update

Downshift and RTK Apache-2.0 implementations were studied for format-aware output filtering and recoverable context. No upstream source was copied or translated in v0.2. The ICM-linked snapshot did not contain its advertised engine source. Pinned commits and reviewed files: docs/UPSTREAM-2026-11-07.md.

Version 0.3 adds runtime dependencies @modelcontextprotocol/sdk 1.32.2 and zod 4.6.7 (MIT). They are installed by the lockfile, not vendored in the source archive. Transitive package licenses remain with the installed packages. Runtime code in src/ is independently implemented.

