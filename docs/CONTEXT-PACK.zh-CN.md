# TokenLoom 0.2：测试压缩与可恢复上下文

安装依赖后，在仓库根目录运行：

```sh
node src/cli.js compact tests.tap --kind tap --out brief.txt
node src/cli.js pack notes.txt --query "缓存失效" --budget 1800 --store .tokenloom-store --out context.txt
node src/cli.js recover <64位恢复ID> --store .tokenloom-store --out restored.txt
```

`pack` 仅检索显式指定的一份 UTF-8 文本，最多 2 MiB，不扫描其他文件。成功压缩后在本地保存完整原文；同内容重用同一恢复 ID。每次读取都核对 SHA-256。不要把含敏感资料的 store 提交到 GitHub；目录没有自动过期和清理策略，由用户管理。本地 POSIX mode 不代替 Windows ACL，也没有加密。

查询包是有损检索，可能切断函数、跨块关系或遗漏其他约束。左右相邻块只是缓解措施。用于找到相关材料后继续阅读，不能替代完整源码、全量计数或完整审查。预算包括恢复提示；不足时返回原文、`budgetMet: false`，调用方须检查，不会硬截断。

恢复命令需要同一台机器上仍存在的 store。给 ChatGPT 粘贴压缩包时，它不能自动访问你的磁盘：需要时由你运行 recover 再提供相关原文；恢复后的新增输入也要计入实际用量。对 Codex 同样需要显式调用这些命令。安装现有 Skill 不会自动执行 CLI。

`tap` 仅支持已识别的 Node 平坦 TAP 通过块。通过项名称/耗时会省略，失败和未知输出保留；没有识别到格式或净 token 不下降时原样输出。不替代 TAP 工具解析输入。原始日志仍应保留。

运行 `node scripts/upgrade-benchmark.mjs` 可重现本机离线测试；结果写入 reports/2026-11-07。恢复提示长度随本机目录名变化，测试执行耗时也会改变日志计数，因此数字允许小幅波动。报告见 [实测结果](UPGRADE-RESULTS.zh-CN.md)，来源见 [源码研究](UPSTREAM-2026-11-07.md)。
