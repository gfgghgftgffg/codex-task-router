# Codex Task Router

为 Codex 原生 subagents 配置任务分工、模型和思考强度。一个 `routing.toml` 管理全部角色，生成独立 profile、角色配置、精简的全局 AGENTS.md 入口和按需加载的 Skill。

默认由 Astra 主 Agent 把握方向，DeepSeek Flash 编码，Sol 检索、独立验证和处理非编码产出。模型都是可替换的配置值，不与某个服务商绑定。

**状态：本地配置、安装保护和静态场景检查已验证；尚未进行真实多模型调用或质量、成本基准测试。** 本项目提供编排政策和配置生成器，不提供模型服务，也不声称硬性拦截所有工具调用。

## 快速开始

需要 Node.js 22+、支持命名 subagent 角色及独立 profile 的 Codex，以及已配置的模型 provider。原生配置在 Codex CLI 0.156.1 上做过解析验证；其他版本和桌面宿主需要确认兼容性。

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

**安装到全局目录不等于所有会话自动启用。** 通过 `-p task-routing` 加载路由 profile；入口也支持显式调用 `$task-routing`，但这不能让未加载的角色、模型或工具自动变得可用，也不能改变当前主会话模型。

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
- `max_concurrent` 默认 3，只是并发上限，不要求每次创建 3 个子 Agent。
- `max_coding_repairs` 默认 2，限制首次实现之后的编码修复跟进；耗尽后交回主 Agent 判断，不静默改用 GPT 编码。
- 当前角色集合固定，但每个角色的模型、强度、provider 均可修改。新增角色需要扩展生成器和角色契约。

### 仅本次任务指定模型

例如“这次总结用 Astra high”：仍可交给 general，但用该任务明确指定的模型和强度；其他角色维持默认配置，不改写 `routing.toml`。只更换主模型，不会自动改变所有子模型。

这是明确的编排规则，实际执行依赖宿主是否允许每次 spawn 覆盖模型和强度。如果不能保留角色权限或不能调用指定模型，应报告限制，不能假装覆盖成功或静默使用默认值。当前没有独立的运行时拦截器来强制这一行为。

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

已有 `config.toml`、认证、其他 Skills、其他角色文件和 AGENTS.md 标记之外的内容不会被改写。文件冲突或手工改过的托管角色会阻止覆盖；AGENTS.md 的本项目区块会随生成器更新，因此持久自定义规则应放在区块外。

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

修改 `routing.toml` 或本项目的角色/Skill 源文件后：

```sh
node cli.mjs doctor
node cli.mjs install
node cli.mjs install --apply
```

启动新会话重新加载。`install` 直接从源文件生成，不要求先构建；构建用于检查独立发布产物。避免手工编辑安装后的生成文件。已安装后不要直接重命名 profile；使用不同目标目录，否则安装器会拒绝留下旧托管文件。

不加载 profile 且不显式调用 Skill 时，入口要求维持原工作方式。全局安装的 Skill 仍可被宿主发现；停用 profile 不会删除安装文件。当前没有自动卸载命令，删除时应只移除本项目文件和 AGENTS.md 中 `codex-task-router:start/end` 标记之间的区块，保留用户其余内容。

桌面应用没有 profile 入口时，安装不会使其自动启用。先在 CLI 验证；不要把配置文件存在等同于当前会话已加载相应角色。

## 开发与验证

```sh
npm test
npm run build
```

`npm test` 使用临时目录和本地子进程，不发起模型请求，不安装到实际用户目录。修改后可以直接修复相关失败并重跑受影响的测试，不需要逐步确认。这一说明仅适用于本仓库的测试。

构建后可执行 `node scripts/check-native.mjs <Codex原生可执行文件路径>`，通过只读的 `features list` 检查 profile 与角色配置能否被解析；不发起模型请求或启用功能。

| 路径 | 用途 |
| --- | --- |
| `routing.toml` | 用户可修改的默认角色配置 |
| `roles/*.md` | 子 Agent 的职责和交付契约 |
| `skill/` | 编排入口及按需加载的参考文件 |
| `src/router.mjs` | 配置校验、生成、安装保护；全局 AGENTS.md 的生成来源 |
| `cli.mjs` | build、doctor、install 命令 |
| `test/` | 配置映射、引用完整性、安装预览、更新、备份与路径保护测试 |

现有验证包含 15 项自动测试、Codex CLI 0.156.1 原生配置解析、skill-creator 校验和部分独立场景审查。真实模型调用、不同宿主上的调度一致性以及质量/成本收益尚未验证。

## 发布与参考

本项目可作为独立 GitHub 仓库分发。提交源文件与 `package-lock.json`，不要提交 `node_modules/`、`dist/` 和 `.test-output/`；这些目录已被 `.gitignore` 排除。`package.json` 的 `private: true` 防止意外 npm 发布，不影响 GitHub 分发。当前尚未指定开源许可证，正式开源前需由维护者选择并添加许可证。

设计参考：[codex-astra-luna-orchestrator](https://github.com/donvito/codex-astra-luna-orchestrator)、[Oh My OpenAgent](https://github.com/code-yeongyu/oh-my-openagent)、[Superpowers](https://github.com/obra/superpowers)。原生字段依据 [Codex 0.156.1 schema](https://github.com/openai/codex/blob/rust-v0.156.1/codex-rs/core/config.schema.json)。角色和 Skill 独立编写，没有复制上述项目的完整流程。
