# MCP 安装与客户端配置

## 选哪种方式

| 方式 | 需要安装什么 | 数据来源 |
| --- | --- | --- |
| 直接连接托管 MCP | 支持 HTTP 的 MCP 客户端 | `https://thinkingmodels.site/mcp` |
| 本地 stdio | Node.js 22/24，本仓库依赖 | 公共 REST API；MCP 协议在本机 |
| 自托管 HTTP | Node.js / Docker、TLS 反向代理、令牌 | 公共 REST API 或你自己的兼容 API |

五个工具均只读公开知识。这里不提供认知助手生成、账户或私有记录接口。

## 本地 stdio

```sh
git clone https://github.com/Klesenchang/thinkingmodels-skills-mcp.git
cd thinkingmodels-skills-mcp
npm ci --ignore-scripts
node mcp/src/cli.mjs --help
node mcp/src/cli.mjs --transport stdio
```

服务从 stdin 读 JSON-RPC，stdout 只输出协议消息；日志与诊断写 stderr。客户端启动命令要直接使用 Node，不能使用会额外打印脚本提示的 `npm start`。

### Claude Desktop

将 [examples/claude-desktop.local.json](../examples/claude-desktop.local.json) 的 `thinkingmodels` 项合并到客户端 MCP 配置，替换两个绝对路径占位符。不要覆盖其他已配置服务。

```json
{
  "mcpServers": {
    "thinkingmodels": {
      "command": "/ABSOLUTE/PATH/TO/node",
      "args": ["/ABSOLUTE/PATH/TO/thinkingmodels-skills-mcp/mcp/src/cli.mjs", "--transport", "stdio"],
      "env": {
        "THINKINGMODELS_API_BASE_URL": "https://thinkingmodels.site",
        "THINKINGMODELS_TIMEOUT_MS": "10000"
      }
    }
  }
}
```

### Codex

Codex 配置使用 TOML，将 [examples/codex.local.toml](../examples/codex.local.toml) 合并到当前使用的配置文件（通常是 `~/.codex/config.toml`）。

```toml
[mcp_servers.thinkingmodels]
command = "/ABSOLUTE/PATH/TO/node"
args = ["/ABSOLUTE/PATH/TO/thinkingmodels-skills-mcp/mcp/src/cli.mjs", "--transport", "stdio"]
startup_timeout_sec = 30
tool_timeout_sec = 30

[mcp_servers.thinkingmodels.env]
THINKINGMODELS_API_BASE_URL = "https://thinkingmodels.site"
THINKINGMODELS_TIMEOUT_MS = "10000"
```

安装或修改后按客户端要求重新加载 MCP，确认列出五个工具，再调用 `get_taxonomy`。这不要求配置模型供应商密钥。

## 通过 npx 从 GitHub 启动

仓库集成版本为 `v1.0.0`，当前三个 Skill 各为 `1.0.1`。使用固定 tag 避免随 main 分支变化。

```sh
npx --yes --package='github:Klesenchang/thinkingmodels-skills-mcp#v1.0.0' thinkingmodels-mcp --transport stdio
```

Claude Desktop 的 command/args 形式见 [npx 配置](../examples/claude-desktop.npx.json)：

```json
{
  "mcpServers": {
    "thinkingmodels": {
      "command": "npx",
      "args": ["--yes", "--package=github:Klesenchang/thinkingmodels-skills-mcp#v1.0.0", "thinkingmodels-mcp", "--transport", "stdio"],
      "env": { "THINKINGMODELS_API_BASE_URL": "https://thinkingmodels.site" }
    }
  }
}
```

Codex 的 npx 配置见 [examples/codex.npx.toml](../examples/codex.npx.toml)。Windows 客户端若无法直接启动 `npx`，使用其宿主支持的可执行程序包装方式，或改用已克隆仓库的 Node 绝对路径方案。npx 首次安装可能较慢，必要时增加客户端启动超时；仓库未发布同名 npm 注册表包。

## 使用现成的托管 MCP

支持 Streamable HTTP 的客户端可以直接连接，无须启动本仓库服务：

```toml
[mcp_servers.thinkingmodels]
url = "https://thinkingmodels.site/mcp"
```

仅支持 stdio 的客户端可选择已验证过的外部桥接版本：

```sh
npx -y mcp-remote@0.15.1 https://thinkingmodels.site/mcp --transport http-only
```

该命令启动的是第三方桥接器，与本仓库的本地服务器是两种不同方式。可选代理配置属于该桥接器自身：

```sh
HTTPS_PROXY="http://<PROXY_HOST>:<PROXY_PORT>" npx -y mcp-remote@0.15.1 https://thinkingmodels.site/mcp --transport http-only --enable-proxy
```

本仓库服务器未声明支持 `HTTPS_PROXY`，不要把第三方桥接器的参数直接套用到本仓库。

## 服务配置

| 环境变量 | 默认 | 作用 |
| --- | --- | --- |
| `THINKINGMODELS_API_BASE_URL` | `https://thinkingmodels.site` | 兼容的公开 API 根地址，不是 `/mcp` 地址 |
| `THINKINGMODELS_TIMEOUT_MS` | `10000` | 每次上游读取的超时；范围以 `--help` / 校验结果为准 |
| `THINKINGMODELS_HTTP_HOST` | `127.0.0.1` | HTTP 监听地址；stdio 忽略监听操作 |
| `THINKINGMODELS_HTTP_PORT` | `3000` | HTTP 端口，可用 `--port` 覆盖 |
| `THINKINGMODELS_MCP_TOKEN` | 未设置 | 自托管 HTTP 的 Bearer 令牌；绑定非回环接口时必填 |
| `THINKINGMODELS_ALLOWED_HOSTS` | 回环主机 | 允许的请求主机名，逗号分隔，部署时显式设置域名 |
| `THINKINGMODELS_ALLOWED_ORIGINS` | 回环来源 | 允许的浏览器 Origin，逗号分隔；无 Origin 的原生客户端仍可认证连接 |

Node 不会自动读取 `.env`。要使用模板，复制 `.env.example` 为 `.env` 并用：

```sh
node --env-file=.env mcp/src/cli.mjs --transport http
```

`.env` 不进入 Git。可选令牌只校验下游访问，不转发给公共 API。

## 故障排查

- **进程等待没有文字**：stdio 正在等 MCP 输入，属于正常状态，使用客户端连接或 `--help`。
- **找不到 Node/npx**：GUI 客户端的 PATH 可能不同，改用可执行文件绝对路径。
- **上游不可用/限流**：返回可见工具错误；瞬时 GET 故障最多自动重试一次，持续失败不会伪装为空结果。
- **HTTP 401/403**：检查 Bearer 令牌、Host/Origin 白名单、反向代理转发的 Host；勿关闭边界后直接暴露公网。
- **404 模型不存在**：查询公开已收录的 ID，不能读取未收录内容。
- **离线**：Skill 可继续按已有材料工作；MCP 需要公共 API 或自行提供兼容 API。

`npm run smoke:remote` 对现有托管服务执行只读握手和五工具调用；每次仅使用公开检索词与返回的公开模型 ID。不要用私密问题作为检索词。
