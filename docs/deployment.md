# 自托管 HTTP

本仓库可部署在能运行 Node.js 22/24 的服务器或 Docker 环境。它仍读取 `THINKINGMODELS_API_BASE_URL` 配置的公共知识 API；这不包含私有 D1 数据库的部署、离线知识库或认知助手生成服务。

## 直接启动

```sh
npm ci --ignore-scripts
node mcp/src/cli.mjs --transport http --host 127.0.0.1 --port 3000
curl http://127.0.0.1:3000/healthz
```

默认仅本机可连接。生产远程环境使用 Bearer 令牌、允许的域名及 TLS：

```sh
export THINKINGMODELS_MCP_TOKEN='<YOUR_RANDOM_SECRET>'
export THINKINGMODELS_ALLOWED_HOSTS='localhost,127.0.0.1,mcp.example.com'
export THINKINGMODELS_ALLOWED_ORIGINS='https://mcp.example.com'
node mcp/src/cli.mjs --transport http --host 0.0.0.0 --port 3000
```

不要直接使用示例占位符作为真实令牌；可通过 `openssl rand -hex 32` 在部署环境生成。令牌在下游校验，不转发给上游。

HTTP 入口为 `/mcp`（POST）；没有 GET SSE 长连接或会话持久化。`/healthz` 只表示进程存活，不代表上游可用。每次请求创建独立协议服务器，适合经网关横向扩展。多实例限流应由网关共同承担；本进程限流不会跨实例共享。

## Docker

```sh
cp .env.example .env
# Edit .env locally; set THINKINGMODELS_MCP_TOKEN to a random secret.
docker compose up --build -d
curl http://127.0.0.1:3000/healthz
```

Compose 只将容器端口映射到宿主机 `127.0.0.1:3000`，供本机反向代理使用，不直接发布到所有外部接口。容器以非 root 用户运行；镜像只包含运行依赖与 MCP 代码，不包含 Skill 构建环境。

## TLS 反向代理示例（Caddy）

```caddyfile
mcp.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

把域名替换成你控制的真实域名，并确保其 DNS 指向你的服务器。Caddy 保留请求 Host 并处理 TLS，服务的 `THINKINGMODELS_ALLOWED_HOSTS` 必须包含该域名。不要在代理层丢弃 Authorization。服务不信任 X-Forwarded-For；按客户端的限流、请求大小限制与日志脱敏应在网关补充配置。

本仓库未自动创建 DNS、云资源、证书或服务实例。根据自己的部署平台配置进程重启、日志保留和网关限制。

## 连接自托管服务

Codex 使用 HTTP URL 与令牌环境变量：

```toml
[mcp_servers.thinkingmodels]
url = "https://mcp.example.com/mcp"
bearer_token_env_var = "THINKINGMODELS_MCP_TOKEN"
```

在启动客户端的环境中设置同名变量；不要把真实令牌提交到仓库。Claude Desktop 等客户端可使用其原生远程 MCP 支持，或使用支持自定义 Authorization 头的桥接配置；不同客户端的远程认证 UI 可能不同。

## 运维检查

- 先检查 `/healthz`，再用 MCP 客户端完成 initialize、tools/list、get_taxonomy。健康检查不会消耗上游模型查询。
- 检查默认工具仅为五个公共只读工具，不存在个人数据或写入工具。
- HTTP 请求体最大 32KiB，单进程默认每直接连接地址每分钟 60 请求，同时执行上限 32；超出时返回明确错误。
- API GET 有超时、响应体大小上限与一次瞬时错误重试；不会无限重发。
- 升级时锁定 Git tag 与 package-lock，先跑 `npm run verify`，再替换进程；回退到此前 tag 即可，不涉及数据库迁移。
