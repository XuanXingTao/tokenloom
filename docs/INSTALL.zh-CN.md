# 安装 TokenLoom

TokenLoom 提供同一份简短技能，供 Codex 和 ChatGPT 使用。它引导模型减少重复表达、按需读取上下文；不会修改模型的计费、额度或内部推理机制。离线程序处理的是你交给它的文本，不会自动拦截聊天请求。

## Codex

在仓库根目录运行（需要 Node.js 22 或更高版本）：

```text
node scripts/install-codex.mjs
```

安装器默认将权威技能复制到当前官方文档推荐的 `~/.agents/skills/tokenloom/`。也可解压 `tokenloom-codex-skill-v0.1.0.zip`，将其中的 `tokenloom/` 文件夹放入该技能目录。最终文件应为 `~/.agents/skills/tokenloom/SKILL.md`。若目标已存在，先检查旧版本并按安装器提示处理。

仍使用 `~/.codex/skills` 的客户端可显式选择兼容路径。以下为 Windows PowerShell 示例：

```text
node scripts/install-codex.mjs --dest "$env:USERPROFILE\.codex\skills\tokenloom"
```

其他用户应换成自己客户端实际使用的完整目标目录；不要同时安装两份同名技能。官方当前位置说明：[Where Codex loads local skills](https://learn.chatgpt.com/docs/build-skills)。本仓库制作过程不会自动安装到你的用户目录。

新建聊天，在请求中写 `$tokenloom`，例如：

> $tokenloom 检查这个报错，先给修复办法，再解释必要原因。

若技能未出现，重启 Codex 再试。默认仍允许按任务自动选择，但安装不代表每次回答必定激活；明确引用最容易验证。删除安装的 `tokenloom` 文件夹可卸载。不要把整份技能追加到全局 `AGENTS.md`，以免每次请求都加载额外说明。

也可以使用下述仓库插件市场安装；选一种方式即可，避免重复加载。

## ChatGPT 网页：插件包

使用 `tokenloom-chatgpt-v0.1.0.zip`。插件包包含以下根目录结构，而非把整个 GitHub 仓库当作插件上传：

```text
plugin.json
skills/
  tokenloom/
    SKILL.md
```

打包内容来自 `plugins/tokenloom/`。`plugin.json` 使用 Agent Plugins 便携格式；技能没有 MCP 服务、外部账号、API key 或本地运行依赖。

如果你的 ChatGPT **Plugins** 页面提供上传插件 ZIP 的入口，可上传此包，查看技能内容并安装，然后新建聊天，用 `@` 选择 TokenLoom 并描述任务。若没有上传入口，使用下一节的自定义指令方式。上传、安装和分享权限取决于账号及工作区配置；本项目没有替你验证这些权限。将 ZIP 作为普通聊天附件上传，不等于安装插件。

官方说明：[插件打包格式](https://developers.openai.com/plugins/build/plugins)、[插件上传权限](https://learn.chatgpt.com/docs/enterprise/apps-and-connectors)、[安装与调用插件](https://learn.chatgpt.com/docs/plugins)。

## ChatGPT 网页：自定义指令

打开设置中的 **Personalization / 个性化**，找到自定义指令，将 `integrations/chatgpt/custom-instructions.zh-CN.txt` 或 `custom-instructions.en.txt` 的内容加入现有偏好，保留你原来的其他要求。保存后在新聊天中验证。

这份文本只约束回答风格，不运行离线压缩程序。它会增加指令长度，短任务未必净省 token。若同一聊天已显式使用 TokenLoom 技能，通常无需再加入相同指令。移除对应文本即可停止使用。

官方说明：[个性化与自定义指令](https://learn.chatgpt.com/docs/personalize)。

## ChatGPT 桌面：本地插件市场

仓库已包含 `.agents/plugins/marketplace.json`，条目指向 `./plugins/tokenloom`，路径相对仓库根目录。用支持本地插件市场的 ChatGPT 桌面版本打开本仓库项目，重启或刷新插件列表，在 `tokenloom-local` 来源中安装 TokenLoom。新建本地 Work 或 Codex 聊天后，通过 `@` 选择插件。

本地市场的可用范围取决于客户端。它不会自动将插件同步到网页或公开插件目录。官方描述的本地缓存会保存安装副本；修改仓库技能后需重新加载或更新安装，再开启新聊天验证。

官方说明：[本地市场与路径规则](https://developers.openai.com/plugins/build/plugins)。

## 使用边界

- 想减少本轮输入，应先在离线程序中处理文本，再把结果发给 ChatGPT 或 Codex。先发送原文再让模型压缩，原文已经进入处理过程。
- 本地 token 数是指定编码器的文本计数，不是 ChatGPT 的实际账单或额度统计；指令、工具调用和重试也有开销。
- 长聊天摘要可供用户审核后带到新聊天继续工作。摘要可能遗漏细节；把它贴回旧聊天不会清除旧上下文。
- 需要详细解释、精确代码或完整引文时，明确提出；TokenLoom 应遵守这些要求。
- 技能以 `plugins/tokenloom/skills/tokenloom/SKILL.md` 为唯一维护源。Codex 安装副本和 ChatGPT ZIP 均由此文件生成，更新时不要各自修改成不同版本。

以上安装方式依据 2026-11-01 查阅的官方文档；实际入口以你的客户端和工作区权限为准。文件均为本项目原创，适用仓库 MIT 许可证。
