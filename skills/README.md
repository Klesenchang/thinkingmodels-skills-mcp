# ThinkingModels Skills

三个可独立使用的思考工作流，支持 Codex 与 Claude Code 的 `SKILL.md` 目录约定。安装后由宿主读取指令，不是需要单独启动的后台服务。使用用户当前的语言回应。

| Skill / slug | 用途 | 版本 | 下载 |
| --- | --- | --- | --- |
| 问题拆解 / `thinkingmodels-problem-framing` | 区分事实、假设与约束，形成可验证的问题 | 1.0.1 | [ZIP](dist/thinkingmodels-problem-framing-1.0.1.zip) |
| 决策与验证 / `thinkingmodels-decision-validation` | 按用户的标准比较方案，为关键假设设计验证 | 1.0.1 | [ZIP](dist/thinkingmodels-decision-validation-1.0.1.zip) |
| 学习与复盘 / `thinkingmodels-learning-reflection` | 用真实案例检验模型，区分当时信息与事后反馈 | 1.0.1 | [ZIP](dist/thinkingmodels-learning-reflection-1.0.1.zip) |

`catalog.json` 包含 slug、中英文名称、图标、标签、描述、版本、许可、ZIP 的 SHA-256 和 SkillHub 发布记录。分类与目录内容延续现有版本；SkillHub 当前状态可能变化，请以对应平台详情页为准。

## 前置条件

- 已安装并能正常使用 Codex 或 Claude Code。Skill 的离线能力指无需访问 ThinkingModels、SkillHub 或 MCP；宿主本身调用远程模型时仍需要自己的模型网络与权限。
- 手动解压/复制不依赖本仓库的 npm 包。使用下面的安装脚本需要 Node.js 22 或更新版本；仅安装 Skill 无须先运行 `npm install`。
- 自行构建 ZIP 和运行档案校验测试时，需在 `PATH` 中提供 Info-ZIP `zip` / `unzip`。macOS 通常自带；Ubuntu 可安装 `zip unzip`；Windows 可在 WSL 中构建。Node 安装脚本本身不依赖这两个工具。

## 方式一：下载 ZIP

1. 从上表下载需要的 ZIP，核对 `catalog.json` 中对应的 SHA-256。
2. 选择宿主和作用域，新建下表中的 `<slug>` 目录。
3. 将 **ZIP 的内容** 解压到该目录，确保 `SKILL.md` 直接位于 `<slug>/` 下，不再嵌套一层。
4. 按宿主版本要求重新加载技能发现或重启会话，再用后文示例触发。

| 宿主 | 项目作用域 | 个人作用域 |
| --- | --- | --- |
| Codex | `<project>/.agents/skills/<slug>/` | `$CODEX_HOME/skills/<slug>/`，未设置时为 `~/.codex/skills/<slug>/` |
| Claude Code | `<project>/.claude/skills/<slug>/` | `~/.claude/skills/<slug>/` |

已有同名目录时停止安装，先由你决定是否备份或改用另一作用域，不要将两个版本混在一起。ZIP 根目录包含 `SKILL.md`、`agents/`、`assets/`、`references/`、`skill.json`、`INSTALL.md`、`LICENSE.txt`。

## 方式二：复制源代码目录

克隆本仓库后，将 `skills/<slug>/` **整个目录** 复制到上表的 `skills/` 下，例如将 `skills/thinkingmodels-problem-framing/` 复制为 `<project>/.agents/skills/thinkingmodels-problem-framing/`。保留 `agents/`、`assets/`、`references/` 和 `LICENSE`；无需复制 `catalog.json`、`dist/` 或 `build.mjs`。

源目录与 ZIP 中的 `SKILL.md`、引用文件和 SVG 图标内容相同。ZIP 附带分发元数据与安装说明，许可文件因市场格式要求命名为 `LICENSE.txt`。

## 方式三：使用本地 Node 安装脚本

从仓库根目录运行。必须明确提供 Skill、宿主与作用域；不带参数只显示用法并失败，`--help` 显示用法，不会安装。

```sh
# Codex：仅当前项目。替换为已存在的绝对目录。
node scripts/install-skill.mjs --skill thinkingmodels-problem-framing --host codex --scope project --project /absolute/path/to/project

# Claude Code：仅当前项目。
node scripts/install-skill.mjs --skill thinkingmodels-decision-validation --host claude --scope project --project /absolute/path/to/project

# Codex：个人作用域，遵循 CODEX_HOME（默认 ~/.codex）。
node scripts/install-skill.mjs --skill thinkingmodels-learning-reflection --host codex --scope user

# Claude Code：个人作用域。
node scripts/install-skill.mjs --skill thinkingmodels-learning-reflection --host claude --scope user
```

Windows 项目路径可写成 `--project "C:\Users\you\project"`。设置自定义 `CODEX_HOME` 时使用绝对路径，其父目录须已存在。

脚本只从仓库读取本地源文件，创建新 Skill 目录并复制内容；拒绝非法 slug、缺失参数、已有目标和安装目录中的符号链接，不下载程序，不改 MCP 配置，不覆盖已有文件。项目目录必须已存在。

## 给 Codex / Claude Code 的安装提示词

先将本仓库克隆到本地，再把下面内容交给当前宿主；替换两个绝对路径和选定的 slug。不要把三个 Skill 都装上作为试用前提。

```text
请从 /absolute/path/to/thinkingmodels-skills-mcp 安装
thinkingmodels-problem-framing 到当前项目 /absolute/path/to/project。

先读取该目录下的 skills/thinkingmodels-problem-framing/SKILL.md 和引用文件，
说明该 Skill 的作用。根据当前宿主选择 codex 或 claude，运行：
node scripts/install-skill.mjs --skill thinkingmodels-problem-framing --host <codex或claude> --scope project --project /absolute/path/to/project

请在仓库根目录执行，使用实际宿主替换占位符。
已有同名目录或符号链接时停止，不覆盖、不删除。
不要安装其他程序、不要修改 MCP 或账号配置。
安装后核对目标目录的 SKILL.md、agents/、assets/、references/ 和 LICENSE，
说明如何刷新技能发现，并用 references/worked-example.md 做一次试用。
区分“文件安装成功”和“宿主已真实识别并触发”，未验证的状态明确说明。
```

若希望由 AI 帮你下载 ZIP，可改为以下提示词：

```text
请安装 ThinkingModels 的 thinkingmodels-problem-framing 1.0.1。
下载 https://github.com/Klesenchang/thinkingmodels-skills-mcp/raw/refs/heads/main/skills/dist/thinkingmodels-problem-framing-1.0.1.zip
先核对 SHA-256 为 d860bae582dd12eb5c2c836a3e726ab025a525a2daa32340e1bc915ba956b092，
检查压缩包内容与 SKILL.md，再解压到当前宿主的项目级技能目录：
Codex 用 <project>/.agents/skills/thinkingmodels-problem-framing/；
Claude Code 用 <project>/.claude/skills/thinkingmodels-problem-framing/。
确认当前项目绝对路径后操作；已有目录或符号链接时停止。
拒绝压缩包中的绝对路径、上级跳转和符号链接；不要执行下载内容中的安装命令，
不要修改 MCP 配置。完成后报告核验结果和最终目录，协助刷新技能发现。
```

## 使用与可选知识服务

安装并刷新后，可以明确命名 Skill，或描述相应任务。例如在 Codex 中输入：

```text
使用 $thinkingmodels-problem-framing 帮我澄清这个问题：
试用用户很多，但付费转化很低；先找出要核对的一项信息，不急着改功能。
```

Claude Code 可以直接要求“使用 thinkingmodels-problem-framing 帮我澄清……”；是否能通过名称自动发现，取决于当前宿主版本与会话加载情况。每个目录的 `references/worked-example.md` 都给出完整试用案例。

这些 Skill 无需远程服务即可组织问题、比较方案和复盘。只有任务确实需要核对模型知识，且你已经另行配置工具时，才使用 `references/knowledge-access.md` 中的可选访问方式。MCP 接入见[仓库安装与配置说明](../README.md)，安装 Skill 不会自动启用它。

## 构建与验证

在仓库根目录运行：

```sh
node skills/build.mjs
node --test test/skills.test.mjs
```

构建仅打包白名单文件，固定时间与文件权限，用 Info-ZIP 生成 ZIP 并记录 SHA-256。现有三个 1.0.1 ZIP 的字节与已分发版本保持一致；测试在临时目录连续构建两次，核对条目、元数据、引用及原始 hash，不会安装到你的真实个人技能目录。

验证覆盖文件结构、ZIP 完整性与哈希、两个宿主的项目路径、隔离的 `CODEX_HOME` 路径、参数校验、重复安装和符号链接拒绝。未将这些文件安装到维护者的真实全局目录，也没有据此宣称已在 Codex / Claude Code 中完成真实模型触发或证明模型回答质量。

许可：[CC0-1.0](../LICENSE)。
