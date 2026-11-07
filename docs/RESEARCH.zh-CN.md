# Caveman 研究与 TokenLoom 的定位

研究日期：2026-11-01。上游固定版本：[9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4](https://github.com/JuliusBrussee/caveman/commit/9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4)（2026-10-25）。只读研究，未运行上游安装器。本项目独立实现；以下是设计依据，不是性能胜出声明。

## Caveman 已经做到什么

当前 Caveman 4.0 已从回答风格提示词扩展为多层系统，不能把它描述成只删除语气词的工具。

| 层次 | 实际原理 | 源码或说明 |
|---|---|---|
| 输出风格 | 结论先行、去客套、短句；保留否定、条件、数字、代码、命令和用户语言 | [SKILL.md](https://github.com/JuliusBrussee/caveman/blob/9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4/skills/caveman/SKILL.md) |
| 输入压缩 | 按内容类型选择变换；离线 tokenizer 比较前后；不更短或解析失败就透传；有损结果先保存原文供恢复 | [engine.go](https://github.com/JuliusBrussee/caveman/blob/9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4/engine/engine.go) |
| JSON 选取 | 保留首尾、错误、MAD 数值异常、CUSUM 变化点和 BM25 查询相关记录；显式标记被省略部分 | [json.go](https://github.com/JuliusBrussee/caveman/blob/9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4/engine/compressors/json.go) |
| 格式候选 | 可比较 TOON 与数组省略候选的 token 数，并记录是否保留模型可见信息 | [json_strategy.go](https://github.com/JuliusBrussee/caveman/blob/9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4/engine/compressors/json_strategy.go) |
| 请求适配 | 修改发给模型的副本、保留原历史；实际绑定恢复执行器才允许部分压缩路径 | [Python middleware](https://github.com/JuliusBrussee/caveman/blob/9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4/packages/middleware/python/README.md) |
| 其他层 | 模型和推理强度路由、可复用脚本、缓存优化、网页压缩 | [README](https://github.com/JuliusBrussee/caveman/blob/9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4/README.md) |

因此，“自适应”“可恢复”“结构化压缩”“没有收益就原样返回”都不能单独作为 TokenLoom 超越上游的证据。

## 节省数字应怎样理解

- **输出变短不等于总成本下降。** 上游 [Honest Numbers](https://github.com/JuliusBrussee/caveman/blob/9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4/docs/HONEST-NUMBERS.md) 承认 skill 本身增加输入 token；短任务可能得不偿失。早期固定 65% 估算不能当作普遍效果。
- 相比普通 `Answer concisely.`，其旧 3.1.0 规则在 10 个问题上，中位额外输出缩短约为 caveman 3%、ultracave 35%、megacave 9%。这是单次运行的长度比较，使用 o200k 近似 Claude tokenizer，不是最新规则的完整成本或质量结论。
- [Wrap benchmark](https://github.com/JuliusBrussee/caveman/blob/9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4/docs/WRAP-BENCHMARK.md) 报告六类确定性工具输出、18 个配对：provider input 总量 885,793 → 591,673，下降 33.2%，18/18 答案检查通过；按案例聚类的 95% 区间为 14.6%–48.5%。HTML 案例多消耗 9.9%。
- 上述输入量把不同缓存桶相加，未按价格加权，不能写成“账单下降 33.2%”。报告使用旧引擎，当前引擎未重跑完整会话；文档明确说公开仓库没有该结果的原始 harness/run artifacts，无法仅凭 checkout 独立复现。
- [公开输出评测](https://github.com/JuliusBrussee/caveman/blob/9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4/evals/README.md) 有 baseline/concise/skill 三臂设计，但当时提交的长度快照没有 usage，尚无已复核的 fidelity 快照。正则保真检查也不能证明所有答案正确。
- Auto 的约 54% 成本下降是另一类实验：模型/effort 路由，相比固定高 effort 的阶段性编码任务结果，不能算作文本压缩效果。

## TokenLoom 选择的切入点

首版定位为可在 GitHub 分享的轻量文件包：Codex 侧使用 Skill 或对应宿主支持的插件文件，ChatGPT 侧使用可复制的简洁回答指令；本地 CLI 是选配，用于整理显式提供的资料。不同产品的安装入口并不相同，不能把 Codex Skill 文件当作 ChatGPT 自动执行程序。首版不要求网页 UI 或 API 服务，也不接管 ChatGPT 内部上下文、推理预算或套餐额度。

1. **低安装成本。** 先使用短小的 Skill／指令；需要处理长资料时再运行选配 CLI。指令负责输出风格，程序负责发送前的数据变换。
2. **明确保真边界。** `safe` 默认保守；`focus` 是用户主动选择的有损资料选取。能保留原文件，不代表模型当次已看到全部信息。
3. **测最终可见文本。** 使用 o200k_base 检查候选，计入候选自身的格式说明和省略标记；额外添加的回答策略及后续恢复仍要在完整任务评测中计入。
4. **中文任务优先验证。** 重点覆盖否定、限定、数字、单位、代码、路径和多语言混排，避免通过切换语言或不自然缩写制造漂亮比例。
5. **公开证据。** 离线样例、负收益情况、质量检查与测试命令都应可复现；实测账单与本地计数分开报告。

这些是工程取舍和待验证的差异，不是“全面优于 Caveman”的结论。若要宣称胜出，必须固定上游版本，针对相同任务、模型、输入、恢复机会和质量门槛做直接对照，保留失败案例。

## 开源与命名

上游声明整仓 Apache-2.0，Caveman 名称和 logo 属于其商标。TokenLoom 使用独立名称和实现，并在此记录灵感来源。若未来复制上游源码，应同时检查具体文件和第三方许可，保留相应版权、许可与 notice；不要把上游标识当成本项目品牌。

评测口径及发布门槛见 [EVALUATION.zh-CN.md](EVALUATION.zh-CN.md)。
