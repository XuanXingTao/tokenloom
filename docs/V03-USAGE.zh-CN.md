# TokenLoom 0.3 使用与边界

这是可运行的本地工具层；只有通过这些命令或 MCP 工具的内容会被处理。没有全局网络代理或 ChatGPT 内部上下文拦截。已有普通 JSON、table、logs、pack 命令保持兼容。

## CLI

在源码目录安装锁定依赖：`pnpm install --frozen-lockfile`。以下 `node src/cli.js` 可在已配置 bin 的环境用 `tokenloom` 替代。

```sh
node src/cli.js read data.json --root /absolute/workspace --task task-a
node src/cli.js read tests.tap --root /absolute/workspace --task task-a --allow-lossy
node src/cli.js run --root /absolute/workspace --task task-a --allow-lossy -- node --test --test-reporter=tap
node src/cli.js recall RECOVERY_ID --root /absolute/workspace --task task-a --start 20 --end 40
node src/cli.js report --root /absolute/workspace --task task-a
node src/cli.js usage-import usage.json --root /absolute/workspace --task task-a
```

Windows 使用实际绝对路径，例如 `E:/my-project`。run 不经过 shell，参数按数组传递；不能把管道或重定向写成 shell 字符串。程序可执行文件需要能被系统解析，Windows 的 `.cmd` 包装器不保证直接可执行。stdin 关闭，不支持交互命令。

read 自动识别 JSON/对象数组、显式 .jsonl/.ndjson、CSV；允许有损时识别 Node TAP 及 .log 连续重复行。CSV 解析保留字符串值、引号及字段边界，只有替代表示更短才采用。未知格式、YAML、HTML、Git diff 默认原样，不声称已有专用解析器。Git 及其他命令仍可通过 run 执行。

原文存储失败或包含恢复提示后没有节省时返回原文。失败命令的正常 UTF-8 stdout/stderr 不压缩，退出码保留。输出总计超过 2 MiB 会停止命令，显式标记 limited，退出 125；超时退出 124，取消退出 130，二进制或非法 UTF-8 输出不作为文本返回（退出 126）。这是有限大小的文本工具，尚无大文件流式落盘模式。不要用它包装媒体/二进制或交互任务。

原文保存在指定工作区 `.tokenloom-store`，以 hash 去重并校验。原文容量门限 64 MiB（并发进程不是硬配额），满后回退；审计记录单文件独占创建。没有自动过期删除；停用服务后用户可自行归档/清理整个目录，清理后旧 ID 失效。POSIX mode 不替代 Windows ACL。只读文件工具限制真实路径在工作区内并排除存储目录；原文和事件按工作区共享，不是多租户服务。

## MCP 接入

```sh
node src/cli.js serve --root /absolute/workspace
```

stdout 专用于 MCP。默认提供 tokenloom_read、tokenloom_recover、tokenloom_report。只有启动时显式传 `--allow-run` 才提供 tokenloom_run。执行工具使用服务进程权限，cwd 限制不是操作系统沙箱；宿主应对该工具配置审批，不能当成只读工具自动批准。

可配置 Codex 本地 MCP（将路径替换成实际位置）：

```toml
[mcp_servers.tokenloom]
command = "node"
args = ["/absolute/tokenloom/src/cli.js", "serve", "--root", "/absolute/workspace"]
```

本发行包未修改用户全局配置。MCP 使用官方 SDK 1.32.2 的稳定兼容协议，最高 2025-11-25；官方客户端已验证，不宣称原生实现 2026-07-28 无状态协议。ChatGPT 网页不读取这个本地配置；远程 HTTP、认证和网页端部署尚未提供。技能包本身不含 Node 服务依赖，需另外安装完整源码包。

## 用量与恢复评估

usage.json 格式：

```json
[
  {"requestId":"unique-request-1","usage":{"input_tokens":1000,"output_tokens":200}},
  {"requestId":"failed-or-unobserved-request-2","usage":null}
]
```

导入所有请求，包括恢复后的请求和重试；ID 去重，冲突记录在报告中标出。provider input+output 不再次加上本地工具/恢复 token，也不额外相加 reasoning 子项。缓存字段原样保存在事件中；未计算费用。缺失 usage 保持未知，report.complete 始终为 false，因为服务本身无法证明导入覆盖了全部模型调用。账本是计量基础，不是已完成的全量账单抓取器。

也可以在执行 Codex 时自动收集 JSONL 回合用量（会实际调用模型，消耗当前账号用量）：

```sh
node src/cli.js run --root /absolute/workspace --task eval-a --timeout 240000 --observe-codex-usage -- codex exec --json "你的任务"
```

此选项只适用于真实 Codex `--json` 输出，不能用于把普通程序伪造的 JSON 当成 provider 证据。每个 turn.completed 作为一个聚合观察记录，不假称单个 HTTP request；所有回合累计。出现 error/turn.failed 或没有完成回合时额外记未知用量。服务不能观测平台未返回的使用量，也不把本地错误消息转换成虚构 token。

运行 `node scripts/runtime-evaluation.mjs` 可做真实命令/协议和离线恢复开销验证；脚本尝试导入本机已有的历史测试记录，没有该文件时跳过。它不发起付费模型调用。完整质量/费用对照仍需外部模型实验，不能用此离线结果代替。
