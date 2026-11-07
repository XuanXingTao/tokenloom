# 相关程序、理论与实现取舍

核对日期：2026-11-01。以下资料来自项目源码、官方说明或原始论文；项目公布的比例不等于 TokenLoom 的实测效果。

| 研究对象 | 学到的方法 | 本项目采用方式 |
|---|---|---|
| [Caveman](https://github.com/JuliusBrussee/caveman) | 输出简化和输入压缩是两个系统；规则本身有成本；候选不更短就透传 | 精简技能、真实 tokenizer 门槛、分别报告输入和指令开销 |
| [RTK](https://github.com/rtk-ai/rtk) | 工具输出进入模型前筛选、聚合、去重；只改变已生成回复无法追回输入成本 | 离线日志连续重复行聚合；Codex Skill 指导按需读取。首版未实现全局 shell hook |
| [TOON](https://github.com/toon-format/toon) | 同构记录的字段名只声明一次；嵌套或异构数据未必获益 | 独立的 columns/rows JSON 表示，显式 `--kind table`，与紧凑 JSON 逐次比较；不是 TOON 协议实现 |
| [LLMLingua / LLMLingua-2](https://github.com/microsoft/LLMLingua) | 分层预算、依据重要性选择内容；第二代以双向编码器做保留/删除分类 | 采纳“保护区域+预算”思路；首版不加载模型，不冒充已实现神经压缩 |
| [率失真框架论文](https://arxiv.org/abs/2407.15504) | 压缩目标要与下游问题和可接受的信息损失联合考虑 | focus 必须有查询和预算；不把最大删减率当作质量指标 |

## 源码层面的核对

- Caveman 的 Go Engine 用 BPE 计数；另一条 `skills/caveman-compress/scripts/compress.py` 的 `_is_smaller_than_body` 使用字符数。这两条路径必须区分。详见 [Caveman 专项研究](RESEARCH.zh-CN.md)。
- RTK 的 [tracking.rs](https://github.com/rtk-ai/rtk/blob/develop/src/core/tracking.rs) 与 [审计说明](https://github.com/rtk-ai/rtk/blob/develop/docs/usage/AUDIT_GUIDE.md) 将 token 估计建立在 bytes/4 上。比例实际反映命令输出字节变化；中文、多语言或格式变化时，不能把它当作精确 BPE 比例。本项目固定 `o200k_base`，计数失败则报错，不偷偷换成字符估算。
- LLMLingua 的 [prompt_compressor.py](https://github.com/microsoft/LLMLingua/blob/main/llmlingua/prompt_compressor.py) 有上下文和 token 两级筛选、强制保留 token、数字保护参数。该实现依赖 Torch/Transformers 及模型权重，压缩本身也需要时间和算力。[LLMLingua-2 论文](https://arxiv.org/abs/2403.12968) 的实验压缩率只适用于其设置，不构成中文任务的普遍保证。
- TOON 官方明确提醒：深度嵌套和异构数据可能由 compact JSON 获胜。因此本项目不强制改格式；先计算包含表头的完整候选，再选择更短者。

## 高压缩率的边界

率失真研究说明，少用 token 与保留任务所需信息是需要一起优化的目标；它没有提供一个对任意 ChatGPT 请求都可保证的固定比例。[跨语言压缩审计](https://arxiv.org/abs/2608.26175) 进一步报告了激进压缩在非英语任务上的退化。这是特定研究设置下的证据，不应扩大成所有模型都会失败；它足以支持我们对中文单独评测。

第一版优先减少重复字段、空白和完全相同的日志行。对自然语言，仅在用户明确选择 focus 后做段落选取；关键词保护只是启发式，不是语义等价证明。更高的压缩率需要在同一任务上验证答案、检索和恢复效果。

## 与源码实现的对应

`src/json-table.js` 把同构、扁平的 JSON 对象数组改为一个表头与多行值。不经过浮点重序列化，保留大整数、负零、指数写法和字符串转义；每次采用前都解码并与词法紧凑原文比较。异构、嵌套和重复键输入回退到紧凑 JSON。格式变换用于模型阅读，不能直接替代原系统的 API schema。

`src/core.js` 对原文、紧凑 JSON、表格候选做计数；计入省略标记和表头。CLI 不自动附加任何节省指令。`benchmarks/results.json` 另列“如果再加中文指令”的净变化，包括负收益案例。

后续可评估可选的本地 LLMLingua-2 适配器、按工具类型过滤和可检索原文存储，但应先增加中英双语任务级质量评测，再决定是否引入这些依赖。没有源数据访问能力时，不宣称一个 Skill 能替 ChatGPT 全局压缩历史。
