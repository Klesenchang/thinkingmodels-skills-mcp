# 第三方组件

| 组件 | 用途 | 许可证 |
| --- | --- | --- |
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | MCP 协议与 stdio / Streamable HTTP 传输 | MIT |
| Node.js | JavaScript 运行时及标准库 | Node.js 随附许可 |
| zip / unzip（仅构建/测试） | 生成和验证 Skill ZIP | 系统安装包随附许可 |

运行依赖完整版本树由 package-lock.json 锁定，安装后各组件的 LICENSE 保留在 node_modules 中；本仓库不内嵌其源码。

文档中可选的 `mcp-remote` 为外部 stdio-to-HTTP 桥接工具，使用其自身的许可证和依赖；本项目未将其源码纳入发布。

Skill 源文件及产品既有五工具契约沿用原项目 CC0-1.0；图标来自产品既有公开 Skill。商标权与第三方来源内容不因本仓库许可发生变化。
