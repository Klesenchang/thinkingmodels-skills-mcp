# ThinkingModels · Skill 与 MCP

认知脚手架的三个离线 Skill，以及五个公共知识工具的 MCP 服务。Skill 帮助你拆解问题、比较选择和复盘行动；MCP 按需提供模型、关系与来源查询。

- **Skill** 是给 Codex / Claude Code 阅读的指令文件，安装后由宿主使用，无须启动服务。
- **MCP** 是可独立启动的 Node.js 服务，支持本地 stdio 和自托管 Streamable HTTP。默认读取 `https://thinkingmodels.site` 的公开 REST API，需要联网。
- 不包含完整知识库离线副本、认知助手生成服务、用户对话、账号系统或生产数据库。MCP 只读公开知识，不查询或修改个人记录。

[产品主页](https://thinkingmodels.site/) · [Skill 安装](skills/README.md) · [MCP 配置](docs/mcp.md) · [远程部署](docs/deployment.md)

## 环境要求

- Node.js 22 或 24（CI 验证这两个版本）与 npm。
- Git：用于从仓库克隆，或通过 npx 从 GitHub 安装。
- `zip` / `unzip`：仅重新构建和测试 Skill ZIP 时需要。macOS 已提供；Ubuntu/Debian 可安装 `sudo apt-get install zip unzip`。Windows 可在 WSL 中执行完整构建；直接运行 MCP 和 Node 安装器不依赖这两个程序。
- MCP 调用需要访问公开知识 API；下载到本地的 Skill 在宿主内可离线使用。

## 快速开始

```sh
git clone https://github.com/Klesenchang/thinkingmodels-skills-mcp.git
cd thinkingmodels-skills-mcp
npm ci --ignore-scripts
npm run verify
```

`verify` 构建三个 ZIP，执行独立测试，并检查发布文件。测试使用本地固定数据，不依赖生产数据库或云服务凭据。

### 安装一个 Skill

```sh
node scripts/install-skill.mjs --skill thinkingmodels-problem-framing --host codex --scope project --project /ABSOLUTE/PATH/TO/YOUR/PROJECT
```

将 `codex` 换为 `claude` 即可安装至 Claude Code 项目目录。安装器只创建新目录，遇到同名目录停止，不覆盖已有内容。个人目录、ZIP 手动下载和可复制安装提示词见 [安装说明](skills/README.md)。

| Skill | 用途 | 版本 |
| --- | --- | --- |
| [问题拆解](skills/thinkingmodels-problem-framing/SKILL.md) | 区分事实、假设和约束，把模糊困扰改写成可验证的问题 | 1.0.1 |
| [决策与验证](skills/thinkingmodels-decision-validation/SKILL.md) | 按自己的标准比较方案，找出取舍，为关键假设设计小规模验证 | 1.0.1 |
| [学习与复盘](skills/thinkingmodels-learning-reflection/SKILL.md) | 把模型放进具体案例，检查适用边界，将反馈变成下一步行动 | 1.0.1 |

ZIP、版本、名称、图标、标签、双语描述、SkillHub 链接和 SHA-256 记录在 [catalog.json](skills/catalog.json)。可从 [GitHub Releases](https://github.com/Klesenchang/thinkingmodels-skills-mcp/releases) 下载三个 ZIP 及校验清单。Skill 版本与本仓库集成版本独立。

### 启动本地 MCP（stdio）

```sh
node mcp/src/cli.mjs --transport stdio
```

stdio 等待 MCP 客户端的 JSON-RPC 输入，不显示聊天界面。配置客户端时使用 `node` 与脚本的**绝对路径**，不要用 `npm start` 包装协议进程。参见 [Claude Desktop JSON](examples/claude-desktop.local.json) 与 [Codex TOML](examples/codex.local.toml)。

不克隆仓库也可以运行已标记版本：

```sh
npx --yes --package='github:Klesenchang/thinkingmodels-skills-mcp#v1.0.0' thinkingmodels-mcp --transport stdio
```

这是从 GitHub 安装的命令，**不是已发布到 npm 注册表的同名包**。首次运行需要网络与 Git；Node/npm 应在客户端进程的 PATH 中。首次使用可先克隆并检查代码。

### 启动本地 MCP（HTTP）

```sh
npm run start:http
# MCP: http://127.0.0.1:3000/mcp
# Health: http://127.0.0.1:3000/healthz
```

要绑定外部接口，必须配置访问令牌与允许的主机名，详见 [远程部署](docs/deployment.md)。该操作不需要、也不会自动部署到认知脚手架生产站点。

## 五个只读工具

| 工具 | 参数 | 结果 |
| --- | --- | --- |
| `get_taxonomy` | 无 | 分类、支持等级及相关公开分类信息 |
| `search_models` | `query?`, `category?`, `support?`, `limit?` | 已收录模型列表；固定 `status=included` |
| `get_model` | `id` | 一个已收录模型的详情 |
| `get_model_lineage` | `id` | 模型的公开谱系与关系 |
| `get_model_sources` | `id`, `verified?`, `limit?` | 来源及核验状态 |

模型 ID 格式为 `m` 加数字；`limit` 为 1–25，搜索词最长 300 字符。结果保持现有公开 API 字段。只有实际返回并读取过的模型与来源才能作为站点引文；服务不可用时应说明未检索，不伪造来源。

## 仓库结构

```text
skills/                  三个原始 Skill、图标、引用、catalog 与 ZIP 构建
mcp/src/                 公共 API 适配、五工具、stdio / HTTP 服务
mcp/test/                本地 fixture 与协议/错误处理测试
scripts/                 Skill 安装、发布校验、远程只读 smoke
examples/                Claude Desktop / Codex 配置片段
docs/                    MCP 配置、部署与来源说明
.github/workflows/       Node 22/24 构建和测试
Dockerfile               HTTP 服务容器
compose.yaml             本机反向代理前的容器配置
LICENSE                  CC0-1.0
```

## 开发与验证

```sh
npm run build:skills     # 重新生成 ZIP 与 catalog 中的校验信息
npm test                 # 本地 API fixture、stdio、HTTP、安装/ZIP 测试
npm run check            # 配置、文件范围与发布包检查
npm run smoke:remote     # 可选：对托管 /mcp 做公开只读握手、五工具 smoke
```

托管入口 `https://thinkingmodels.site/mcp` 可以直接接入客户端，无须自托管。独立服务的本地协议和错误处理有自动化测试；这些测试不等于已验证每个宿主版本的真实模型触发质量，也不代表公共 API 永久可用。来源、差异和维护方式见 [来源说明](docs/provenance.md)。

## 贡献与许可证

请使用议题描述可复现问题，提交改动前运行 `npm run verify`。不要提交令牌、`.env`、用户内容或数据库导出。详见 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [SECURITY.md](SECURITY.md)。

本仓库源代码与 Skill 沿用产品现有 **CC0-1.0**，完整条款见 [LICENSE](LICENSE)。第三方依赖各自适用其许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。运行时读取的第三方来源内容不因本仓库许可而改变其原有权利。
