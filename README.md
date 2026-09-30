# Codex Task Router

为 Codex 原生 subagents 配置任务分工、模型和思考强度。一个 `routing.toml` 管理全部角色，生成独立 profile、角色配置、精简的全局 AGENTS.md 入口和按需加载的 Skill。

默认由 Astra 主 Agent 把握方向，DeepSeek Flash 编码，Sol 检索、独立验证和处理非编码产出。模型都是可替换的配置值，不与某个服务商绑定。

**状态：23 项自动测试通过；本机已验证原生 V1 下的 DeepSeek 任务收发、编码和独立 Sol 验证流程。** 质量、成本收益和不同宿主上的一致性尚未做基准测试。本项目提供编排政策和配置生成器，不提供模型服务，也不声称硬性拦截所有工具调用。

## 必需配置：使用 V1 子 Agent 通讯

使用本项目时，必须启用多 Agent 并关闭 MultiAgentV2。将以下配置合并到 `~/.codex/config.toml` 已有的 `[features]` 表中：

```toml
[features]
multi_agent = true
multi_agent_v2 = false
```

如果使用 `model_catalog_json` 指定模型 JSON，模型条目也必须设置 `"multi_agent_version": "v1"`，包括主 Agent 和所有可能选用的子模型。下面是单个模型条目的相关字段示例，请保留该条目的其他字段：

```json
{
  "slug": "gpt-6-astra",
  "multi_agent_version": "v1"
}
```

在已验证的 Codex CLI 0.159 中，仅设置 `multi_agent_v2 = false` 不足以覆盖模型目录中明确的 `"multi_agent_version": "v2"`。两处都需要检查，修改后必须启动新会话；已有会话不会自动切换通讯方式。

本项目安装器不会自动改写这些全局功能开关或模型 JSON。原生 V1 的普通任务消息已在本机通过 DeepSeek 收发验证；其他版本、provider 和宿主仍需分别验证。

## 快速开始

需要 Node.js 22+、支持命名 subagent 角色及独立 profile 的 Codex，以及已配置的模型 provider。原生配置在 Codex CLI 0.156.1 上做过解析验证；Codex CLI 0.159 的 profile 指令语义见下文“profile 指令替换与 base 快照”。其他版本和桌面宿主需要确认兼容性。

克隆或下载本仓库后，在项目目录执行：

```sh
npm ci
```

先编辑 [`routing.toml`](routing.toml)，确认模型 ID、思考强度适用于自己的 provider。然后检查并预览安装：

```sh
node cli.mjs doctor
node cli.mjs install
```

应用安装并在工作项目目录启动新会话：

```sh
node cli.mjs install --apply
```

```sh
codex -p task-routing
```

**安装到全局目录不等于所有会话自动启用。** 通过 `codex -p task-routing` 加载路由 profile；普通 `codex` 启动不加载它，仍按原有工作方式运行。入口也支持在未加载 profile 的会话中显式调用 `$task-routing`，但这只让当前会话按 Skill 政策工作，不能让未加载的角色、模型或工具自动变得可用，也不能改变当前主会话模型。安装或修改 profile、角色、Skill 后需要重启 Codex（启动新会话）才会重新加载。

### profile 指令替换与 base 快照

在 Codex CLI 0.159 中，profile 里的 `developer_instructions` 会替换基础配置里的同名文本，而不会自动合并（依据 [Codex 配置参考](https://developers.openai.com/codex/config-reference/) 与 [0.159 的 `config/mod.rs`](https://raw.githubusercontent.com/openai/codex/rust-v0.159.0/codex-rs/core/src/config/mod.rs)）。因此 `install --apply` 会把安装那一刻 `config.toml` 中的 `developer_instructions` 原样快照进 `<profile>.config.toml`，再接上本项目的激活说明；`config.toml` 本身从不改写，字节保持不变。

- 基础文本被修改或删除后，重新执行 `install --apply` 会刷新快照；没有其他变化时计划为空，重复安装是幂等的。
- 预览之后、应用之前，只要基础 `config.toml` 或任何托管文件的存在性或内容发生变化（即使计划本身零变更），应用都会被拒绝为失效计划。
- `npm run build` 产出可移植 bundle，只含激活说明，不包含你的基础指令、凭据或本机配置内容。
- 该替换语义已在 Codex CLI 0.159 上验证；其他版本和宿主需要另行确认。

## 配置模型和思考强度

所有设置都在 [`routing.toml`](routing.toml)。例如：

```toml
[roles.coding]
model = "deepseek-flash"
effort = "low"

[roles.search]
model = "gpt-6-sol"
effort = "medium"
```

| 配置项 | 默认模型 / 思考强度 | 职责 |
| --- | --- | --- |
| `orchestrator` | `gpt-6-astra` / `medium` | 主 Agent：目标、方向、关键决策、整合 |
| `roles.coding` | `deepseek-flash` / `max` | 有明确边界的编码、测试代码和重构 |
| `roles.search` | `gpt-6-sol` / `high` | 只读检索、代码探索、资料核实 |
| `roles.verify` | `gpt-6-sol` / `medium` | 独立验收、运行检查，不修改业务代码或测试源码 |
| `roles.reasoning` | `gpt-6-astra` / `xhigh` | 按需的复杂判断、独立高风险审查 |
| `roles.general` | `gpt-6-sol` / `medium` | 较大的非编码分析、总结、写作、结构化产出 |

每项还可设置 `provider = "已配置的-provider-id"`，省略时继承主会话 provider。认证和服务地址保留在原有 Codex 配置中；本项目不保存 API 密钥。

- 思考强度默认按配置固定，不会根据难度自动升档。`doctor` 根据有效模型目录检查支持的档位；没有目录时会明确提示未验证。不同 provider 的同名模型也可能支持不同档位。
- `max_concurrent` 默认 30，只是并发上限，不要求每次创建 30 个子 Agent。
- `max_coding_repairs` 默认 5，限制首次实现之后的编码修复跟进；耗尽后交回主 Agent 判断，不静默改用 GPT 编码。
- 当前角色集合固定，但每个角色的模型、强度、provider 均可修改。新增角色需要扩展生成器和角色契约。

### 仅本次任务指定模型

例如“这次总结用 Astra high”：仍可交给 general，但用该任务明确指定的模型和强度；其他角色维持默认配置，不改写 `routing.toml`。只更换主模型，不会自动改变所有子模型。

这是明确的编排规则，实际执行依赖宿主是否允许每次 spawn 覆盖模型和强度。如果不能保留角色权限或不能调用指定模型，应报告限制，不能假装覆盖成功或静默使用默认值。当前没有独立的运行时拦截器来强制这一行为。

### 政策和强制执行

本工具产出的是政策文本和原生配置，不是运行时拦截器。`<profile>.config.toml` 只在加载该 profile 时提供激活说明和角色注册；角色的模型、思考强度和 sandbox 由宿主在 spawn 时执行；能否按角色覆盖模型、某个模型是否真的可调用，取决于宿主能力和 provider。`doctor` 只做静态配置与模型目录检查，不证明服务可达、凭据有效或子代理真的可用。安装不修改全局默认权限，也不能阻止其他会话或工具绕过路由政策。

## 怎样分工

普通任务只使用必要的角色，不经过固定的全角色流水线：

| 任务 | 默认处理 |
| --- | --- |
| 简单非编码问答、读取已知短文件 | 主 Agent 直接完成 |
| 多轮搜索或探索 | search 收集资料；main 阅读重要结论所需的原文，判断是否补搜 |
| 明确的代码修改 | coding 实现，verify 独立验收；小改可只检查 diff |
| 已有材料的长文总结 | general 处理，不强制先搜索或走编码验证流程 |
| 研究后制作 HTML 报告 | 先确认资料和内容；需要新写呈现代码时再交 coding |

摘要用于导航，不替代证据。main Agent（默认 Astra）在采纳重要研究结论前亲自读取完整相关原文，检查限定条件、反例和覆盖缺口。长材料分批读取，明确未读、无法访问或截断部分；需要全文理解时读全文，不机械扫描无关资料。后续执行者直接读取指定来源，避免主 Agent 重复转述全文。

search 保持只读，通过链接、现有文件或分批回传原文交接。编码后的独立验证保留，但不强制全量测试或额外 Astra 审查；同类小修改可以合并处理。详见 [Skill](skill/SKILL.md)、[研究证据规则](skill/references/research-evidence.md) 和 [编码验证规则](skill/references/coding-quality.md)。

## 全局安装会修改什么

目标默认为 `CODEX_HOME`；未设置时使用用户目录下的 `.codex`。也可通过 `--codex-home <目录>` 指定安装位置。

| 路径，相对于目标目录 | 安装行为 |
| --- | --- |
| `task-routing.config.toml` | 新增或更新独立 profile |
| `agents/task-routing/*.toml` | 新增或更新本项目的 5 个角色配置 |
| `skills/task-routing/` | 新增或更新本项目的 Skill、角色契约和参考文件 |
| `AGENTS.md` | 不存在则创建；存在则追加或更新带标记的路由区块 |
| `.task-router/manifest.json` | 记录本项目托管文件，用于检查后续更新 |
| `.task-router/backups/` | 更新已有文件前保存备份 |

已有 `config.toml`、认证、其他 Skills、其他角色文件和 AGENTS.md 标记之外的内容不会被改写。安装只读取 `config.toml` 中的 `developer_instructions` 作为快照来源，不改写该文件。文件冲突或手工改过的托管角色会阻止覆盖；AGENTS.md 的本项目区块会随生成器更新，因此持久自定义规则应放在区块外。

安装器保留现有指令文本，但不会替用户分析或修复其中的语义冲突。已有“全部自行完成”“每阶段必须确认”等旧规则可能与路由政策冲突，需要单独审查。AGENTS.override.md 或其他宿主配置也可能影响入口加载。

角色沙箱随角色配置生效：search/reasoning 为 read-only，coding/verify/general 为 workspace-write。verify 不修改源码等更细的边界由角色契约约束，workspace-write 并不硬性限制它只能写测试产物。安装不会修改全局默认权限或授予额外外部操作权限。

### AGENTS.md 为什么保持简短

全局入口只规定启用条件、默认值与用户指定的优先级、主子职责、重要证据的阅读要求，以及任务完成边界。模型映射和详细流程按需从 Skill 加载。

依据用户提供的《Rethinking skills and prompts for GPT-6 Astra》采用以下边界：

- 不要求每次先阅读整套文档、完整仓库或所有角色契约。
- 不强制全角色流程、重复成功的检查或每一步用户确认。
- 明确在已授权范围内完成交付和相关验收，不停在第一版产出。
- 已授权的任务不扩展为无关改进，也不自动授权发布等外部操作。
- DeepSeek 编码的独立验证是这个 profile 的特定质量策略，不是对所有模型和任务的通用审查要求。

不要把“所有本地测试都无生产访问”写进全局规则。只有具体项目确认测试使用一次性数据、无外部副作用后，才在该项目的 AGENTS.md 中说明。这篇文章强调适当删减和澄清指令，而不是把全文或通用检查清单加入全局上下文。

运行 `npm run build` 后可检查完整的 `dist/AGENTS.md` 和 `dist/skills/task-routing/`；生成文件不提交到 GitHub。

## 更新与停用

### 每次修改模型后怎么更新

修改本仓库的 [`routing.toml`](routing.toml)，调整 `orchestrator` 或 `roles.*` 的 `model`、`effort`，保存后在仓库目录执行以下命令。Windows、macOS、Linux 使用相同命令：

```sh
node cli.mjs install --apply
```

更新成功后，在要工作的项目目录启动新的 Codex 会话：

```sh
codex -p task-routing
```

`install --apply` 已包含模型目录校验，并同步生成 profile、角色配置和 Skill；不需要每次先运行 `doctor`、构建或重新安装 Codex。已有会话不会自动刷新配置。修改角色/Skill 源文件后也使用这个流程。

- 需要单独诊断时执行 `node cli.mjs doctor`；只想预览文件变更时执行 `node cli.mjs install`。这两步都是可选的。
- 模型 ID 和思考强度需要与有效模型目录匹配。仅更新 `codex-models.json` 不会改变路由分配，还需要修改 `routing.toml` 并执行上述同步命令。使用模型 JSON 时，新增模型也要满足上文的 V1 配置要求。
- 默认读取当前这份仓库的 `routing.toml`，不会自动读取 `~/.codex/routing.toml`。有多份仓库时，请固定使用同一份。自定义源配置用 `--config <文件路径>`；首次安装使用了 `--codex-home <目录>` 的，更新时也要指定相同目录（或保持相同的 `CODEX_HOME`）。

**生成文件中的额外设置：** 当前安装器按整个文件管理 profile 和角色配置，不会合并保留其中新增的 `[tui]` 等设置。检测到与安装记录不一致的修改时会拒绝覆盖；若额外设置已被纳入安装记录，后续重新生成仍可能将其移除。更新前请另行备份需要保留的内容；遇到冲突应先核对差异，不要通过删除 manifest 绕过保护。安装器成功更新已有文件时也会在 `.task-router/backups/` 留存备份。直接恢复额外设置会使生成文件再次偏离安装记录，下次更新仍可能需要处理冲突。

避免手工修改生成文件来调整模型，应修改源 `routing.toml`。已安装后不要直接重命名 profile；使用不同目标目录，否则安装器会拒绝留下旧托管文件。修改了基础 `config.toml` 的 `developer_instructions` 后，需要重跑 `install --apply` 刷新 profile 中的快照（Codex CLI 0.159 的替换语义见上文，其他版本需自行确认）。

### 停用

不加载 profile 且不显式调用 Skill 时，入口要求维持原工作方式。全局安装的 Skill 仍可被宿主发现；停用 profile 不会删除安装文件。当前没有自动卸载命令，删除时应只移除本项目文件和 AGENTS.md 中 `codex-task-router:start/end` 标记之间的区块，保留用户其余内容。

桌面应用没有 profile 入口时，安装不会使其自动启用。先在 CLI 验证；不要把配置文件存在等同于当前会话已加载相应角色。

## 开发与验证

```sh
npm test
npm run build
```

`npm test` 使用临时目录和本地子进程，不发起模型请求，不安装到实际用户目录。修改后可以直接修复相关失败并重跑受影响的测试，不需要逐步确认。这一说明仅适用于本仓库的测试。

构建后可执行 `node scripts/check-native.mjs <Codex原生可执行文件路径>`。先检查配置解析，再启动应用服务和临时线程，检查角色自动发现产生的启动警告；不提交对话轮次或发起模型推理。该检查也会发现当前用户目录中遗留的无效角色，因此更新角色文件后应先重新安装再运行。

| 路径 | 用途 |
| --- | --- |
| `routing.toml` | 用户可修改的默认角色配置 |
| `roles/*.md` | 子 Agent 的职责和交付契约 |
| `skill/` | 编排入口及按需加载的参考文件 |
| `src/router.mjs` | 配置校验、激活说明与 profile 生成、base 快照、安装保护；全局 AGENTS.md 的生成来源 |
| `cli.mjs` | build、doctor、install 命令 |
| `test/` | 配置映射、引用完整性、base 快照刷新、失效计划拒绝、安装预览、更新、备份与路径保护测试 |

现有验证包含 23 项自动测试（配置生成、自定义 profile 名、base 快照、失效计划拒绝、安装保护、路径保护、CLI 预览与构建）、原生配置解析及角色发现启动检查，以及本机 Codex CLI 0.159 下的 V1 任务收发、DeepSeek 编码和独立 Sol 验证。模型质量、成本收益及不同宿主上的调度一致性尚未做基准测试。

## 发布与参考

本项目可作为独立 GitHub 仓库分发。提交源文件与 `package-lock.json`，不要提交 `node_modules/`、`dist/` 和 `.test-output/`；这些目录已被 `.gitignore` 排除。`package.json` 的 `private: true` 防止意外 npm 发布，不影响 GitHub 分发。当前尚未指定开源许可证，正式开源前需由维护者选择并添加许可证。

设计参考：[codex-astra-luna-orchestrator](https://github.com/donvito/codex-astra-luna-orchestrator)、[Oh My OpenAgent](https://github.com/code-yeongyu/oh-my-openagent)、[Superpowers](https://github.com/obra/superpowers)。原生字段依据 [Codex 0.156.1 schema](https://github.com/openai/codex/blob/rust-v0.156.1/codex-rs/core/config.schema.json)。角色和 Skill 独立编写，没有复制上述项目的完整流程。
