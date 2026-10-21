# 安全边界

MCP 只访问固定公共 API 路径，不转发客户端 Cookie、Authorization 或个人对话。Skill 的可选检索应使用不含隐私信息的通用概念。

本地 stdio 是首选接入方式。HTTP 默认仅监听 127.0.0.1，非回环监听必须设置 `THINKINGMODELS_MCP_TOKEN`；远程使用 TLS、受控主机名和访问控制。令牌不要写入仓库或 URL。服务不信任客户端 X-Forwarded-For，内存限流按直接连接地址统计；反向代理后应在代理层补充客户端限流，多实例应共享网关限流。

漏洞请使用本仓库 GitHub 的 Private vulnerability reporting（如可用），或先联系仓库维护者安排私密报告渠道。不要将访问令牌、私密输入、生产数据放入公开 issue。错误报告应仅使用可公开的最小复现。

本仓库不附带账号、助手生成、个人记录或数据库管理能力。
