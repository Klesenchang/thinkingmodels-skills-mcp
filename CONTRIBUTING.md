# 贡献

1. 使用 Node.js 22 或 24，安装 zip/unzip。
2. `npm ci --ignore-scripts`，修改后运行 `npm run verify`。
3. MCP 仅增加公共只读能力；保持工具参数白名单与 `status=included`，用本地 fixture 证明错误和拒绝路径。
4. Skill 内容变化应升级对应 Skill 版本，再构建 ZIP。不要在同一版本号下替换已发布的 ZIP；catalog 的版本、大小和 SHA-256 要一致。
5. 根集成版本在 `package.json`，与三个 Skill 版本独立。Release 附 ZIP、catalog 与 `SHA256SUMS`，不自动部署生产站点，不发布 npm 包。
6. 不提交 `.env`、凭据、数据库、会话、用户内容或构建缓存。

提出变更时描述具体问题、改动后行为与验证结果。文档中的客户端配置是示例，不要擅自修改其他人的全局配置。
