# TokenLoom 0.4：查询读取、结构化恢复与冲突隔离

## 已实现

- MCP 的 tokenloom_read / tokenloom_recover 接通相同选择参数，不再需要手动先运行 pack。
- 字面查询：大小写不敏感，返回命中行和左右各两行、总命中数、已展示命中数与覆盖状态。不是语义搜索，不能从 complete=true 推断整个文件已返回；它只表示所有匹配都已展示。
- JSON Pointer：遵循 RFC 6901 的 `/` 路径和 `~0` / `~1` 转义，定位嵌套对象、数组、字段。
- JSON 数组筛选、分页、全量计数：在本地遍历完整目标数组，再返回结果。分页保留原数组 index、总数和 hasMore。
- 恢复使用相同的不可变原文快照，即使原文件已改变也不混用新旧版本。
- 重复 usage 按规范化内容去重；字段顺序不构成冲突。相同 ID 的不同用量全部隔离，不纳入总量，并输出 conflictRequestIds。结果与读取顺序无关。

## MCP 示例参数

工具均需 task；read 还需 path，recover 还需 id。一次选择一个模式。

```json
{"path":"records.json","task":"task-a","pointer":"","wherePointer":"/status","equals":"\"failed\"","limit":5,"budget":1200}
```

```json
{"path":"records.json","task":"task-a","count":true}
```

```json
{"id":"替换为返回的64位source","task":"task-a","pointer":"/73/allowed_to_delete","budget":300}
```

```json
{"path":"build.log","task":"task-a","query":"ERROR","budget":1200}
```

计数可与 wherePointer/equals 同用，返回完整目标数组数量和匹配数量。equals 是 JSON 标量的字符串表示：字符串需要 JSON 引号，true/false/null 不需要。数值按原始 JSON 拼写匹配，`1`、`1.0` 与 `1e0` 不视为相同，避免浮点精度损失。字段返回的 json 字符串保存原始数值/转义拼写。重复键视为歧义，拒绝选择。

## CLI

```sh
node src/cli.js read records.json --root /absolute/workspace --task task-a --count
node src/cli.js read build.log --root /absolute/workspace --task task-a --query ERROR --budget 1200
node src/cli.js read notes.txt --root /absolute/workspace --task task-a --start 10 --end 30
node src/cli.js recall RECOVERY_ID --root /absolute/workspace --task task-a --pointer /73/allowed_to_delete
```

CLI 同样支持 `--where-pointer`、`--equals`、`--offset`、`--limit`。JSON 标量的命令行转义依赖 shell；MCP 参数可直接用上述 JSON，避免手工引号转义。

## 预算与保真边界

选择参数本身就是请求局部资料，不再额外要求 allowLossy；未选择任何参数时继续使用 0.3 自动路由。不能同时选择 query、行范围和 JSON 模式。

默认预算 2,000 tokens，可设 64–32,000；恢复 ID、元数据、行号与内容均计入。结构化选择超过预算会报错，请缩小范围/页大小，不会截断 JSON 或悄悄丢字段。查询可按完整相邻行组返回部分匹配，但明确标注不完整；连一个匹配组都放不下时报错。没有匹配与预算不足是不同结果。

本地仍读取/解析完整的最大 2 MiB 文件，再选择要送给模型的内容；没有声称实现磁盘流式扫描、代码 AST 或依赖图。UTF-8 BOM 保留在原文快照；含 BOM 的 JSON 选择当前会按 JSON 解析失败处理。

模型可能漏用工具或错误解读局部数据，特别是跨段条件。精确代码修改、全量审计不能把检索片段当作完整源码。查询未命中并不证明自然语言中不存在同义信息。

## 验证入口

```sh
node scripts/v04-evaluation.mjs
# 显式真实模型测试，使用已有 Codex 登录并消耗用量：
node scripts/v04-evaluation.mjs --live
```

离线测试包含大整数、负零、转义键、重复键、全量计数、分页、预算失败、无匹配、快照恢复及 usage 冲突顺序不变性。真实模型脚本进行四次单轮资料问答，原文和选择组共享模型设置；选择与恢复由脚本预先执行。它验证选取资料后的回答，不等同于自主 MCP 多轮恢复、真实业务工作流或通用质量证明。旧的 0.1 / 0.3 报告不替代 0.4 证据。
