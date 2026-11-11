# 来源与独立运行边界

本仓库于 2026-10-21 从认知脚手架当前产品代码中整理，采用新仓库、单独版本与全新 Git 历史发布。

- 三个 Skill 来自产品 `skills/`，保留 1.0.1 原内容、SkillHub 标识、图标与 ZIP；许可证为 CC0-1.0。
- 2026-11-11 新增 [thinkingmodels 规则治理](../skills/thinkingmodels-rule-governance/SKILL.md) 0.1.0。其审核正文与 [SkillHub 公开包](https://skillhub.cn/skills/indiv-klesen/thinkingmodels-rule-governance) 的三份 Markdown 文件逐字节相同；平台下载包另带 `_meta.json`，审核分发 ZIP 则保留独立 `LICENSE`，两 ZIP 的文件集和总 SHA 不相同。本仓库保留审核分发 ZIP，许可来自该技能正文的 CC0-1.0 声明，不由其他技能推定。
- 规则治理仅包含流程指引和合成验收案例，没有自动执行、学习、调度器、部署配置或真实项目运行记录；不表示已经实施或赋予操作权限。
- 五个 MCP 工具名称、输入 schema 与公开只读语义来自产品 `apps/api/src/index.js` 的 Public read-only MCP 部分。
- 原产品 MCP 直接使用 Cloudflare D1 / KV。这里将传输层改为官方 Node.js MCP SDK，将数据层改为公开 REST API 适配，提供独立 stdio / HTTP 启动方式。
- 未复制完整产品 API Worker、认证模块、私有会话、生产绑定、数据库或数据导出。不会从此仓库部署或覆盖产品站点。

## 数据流

```text
Codex / Claude 等 MCP 客户端
          ↓ stdio 或 Streamable HTTP
本仓库 MCP 服务器 → 参数校验与固定公开路径
          ↓ 无 Cookie / Authorization 的 GET
ThinkingModels 公共 REST API（或你配置的兼容服务）
          ↓
保留原字段的结构化结果 + JSON 文本
```

搜索固定读取 included 模型。API base URL 只能由运行服务的操作者配置，工具参数不能修改主机、路径或增加任意查询参数。本地启动服务不等于本地拥有知识库；离线时四类 Skill 指令仍可读取，MCP 查询需要可达的兼容 API。

## 参考资料

- [MCP TypeScript SDK v1 服务指南](https://ts.sdk.modelcontextprotocol.io/server)
- [MCP Streamable HTTP 传输规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Codex Skill 文档](https://developers.openai.com/codex/skills/)
- [Codex MCP 文档](https://developers.openai.com/codex/mcp/)
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
