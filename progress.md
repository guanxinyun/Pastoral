# Progress Log: 主模型生命周期、归寝流水线与变量预设

**Last Updated:** 2026-08-01 03:39

## Current Status
**Active Task:** 无 — 已完成
**Completed:** 6 of 6 tasks

## Session Log

### 2026-08-01 01:30 — Planning Started
- 已批准设计：`docs/specs/2026-08-01-model-lifecycle-and-preset-design.md`。
- 根因一：普通单 API 成功路径没有写入终态，状态条停在“等待主模型”。
- 根因二：归寝在变量 API 前直接等待 `MVU.replaceMvuData()`；真实写回若悬挂则后续请求永远不发出。
- 根因三：变量请求固定使用 `generateRaw + ordered_prompts: ['user_input']`，没有 none/current/fixed 的完整酒馆预设语义；用户实测连接测试仍带预设行为。
- 用户确认主剧情不受新增预设设置影响；普通与归寝变量请求分别保存，默认均为 none。
- 用户选择空白内部预设方案；无预设模式仍按开关携带角色卡、世界书、聊天历史等占位上下文。

### 2026-08-01 01:30 — Task 1 Started
- 先通过 `test/settings.js` 固化默认结构、两阶段独立保存、损坏值归一化和未知字段兼容。
- 然后最小扩展 `js/settings.js`，不改现有 API 与提示词设置语义。

### 2026-08-01 01:45 — Task 1 Completed
- `test/settings.js` 先因 `variablePresets` 缺失触发 TypeError，确认 RED 有效。
- `js/settings.js` 新增普通/归寝独立预设默认结构、八项上下文默认值和严格归一化。
- 玩家执行 `node test/settings.js`，23 项全部通过。
- 保存仍深度合并并保留未知旧字段。

### 2026-08-01 01:45 — Task 2 Started
- 将先测试内部空白预设内容、三态 `preset_name`、固定预设缺失回退和连接测试复用策略。
- 生产实现将集中在 `js/api.js`，避免 UI 先行耦合。

### 2026-08-01 03:39 — Tasks 2–6 Completed
- `js/api.js` 已统一 normal/endday/连接测试的 none/current/fixed 策略；内部空白预设仅保留勾选占位符，清除人工提示词、未使用提示词、正则和酒馆助手脚本。
- 修正 `createOrReplacePreset()` 的 `render: 'debounced'` 参数，并覆盖只有 `generateRaw()` 的旧环境 none 回退。
- `js/chat.js` 组合 `MESSAGE_RECEIVED` 候选与最新楼层轮询，只接受本次请求后的非 user 楼层；成功、超时和发送失败均写入非加载终态。
- 日结拆分为内存结算、3 秒首次写回、归寝变量 API、最终事实锁定；迟到写回完成后会再锁定一次，最终写回失败显示“归寝部分完成”。
- 设置页新增普通/归寝独立三态预设、固定预设列表和八项上下文开关；已删除的固定预设保留原值并明确提示修正。
- `npm test` 全量通过；修改脚本 `node --check` 通过；`git diff --check` 通过；`index.html` 已重建并与 `public/index.html` 一致。
- 提交范围只含本任务的 12 个已跟踪文件；未暂存用户已有的删除项、MVU 文档和拆分参考文件。

### 2026-08-01 05:30 — 变量请求组装重构（新一轮）
- 玩家实测：固定预设下仍带酒馆正文预设、且前端更新提示词没有进入请求。
- 根因确证：预设的占位符提示词 id 枚举里**没有 `user_input`**（`_types_split/09-preset.txt` 全文出现 0 次），`Overrides` 也无对应字段，因此 `generate({ preset_name, user_input })` 无法保证任务消息进入最终请求；三处调用点还硬编码 `max_chat_history: 0`，把唯一可承载它的聊天区截断为零。
- 否决"假世界书注入"：条目仍需经预设占位符或深度注入，送达问题原样存在；`enabled: false` 永不激活；世界书是共享状态会污染主剧情。
- 否决"临时克隆预设"：会改动全局酒馆状态，且本仓库 `LEGACY_PRESET_NAME` 就是该模式留下的历史债。
- 按玩家要求两种策略都做：`compile`（默认，读预设编译成 `generateRaw` 消息列表，任务消息强制末位）与 `inject`（保真 `generate` + `injects` depth 0）。
- 上下文勾选优先于预设：取消勾选的占位符即使预设启用也被过滤，已实测确认。
- 设计文档：`docs/specs/2026-08-01-variable-request-assembly-design.md`。
- 实测（固定预设无 `chatHistory` 条目）：compile 编译出 4 条消息、任务消息 11677 字在末位；禁用条目与 `prompts_unused` 均未进入；inject 的 `max_chat_history` 由 0 改为 1 且 `should_scan: false`。
- 未验证：`generateRaw` 的 `RolePrompt.content` 是否仍执行宏替换（本地实测 `{{char}}` 原样透传，真实替换由酒馆运行时决定）；角色卡历史后指令在 `generateRaw` 路径下的行为。
- `npm test` 373 项全通过；`node --check`、`git diff --check`、`index.html` 与 `public/index.html` 一致。

## Decisions Made
- 2026-08-01 主剧情保持酒馆原生 `/send` 与 `/trigger await=true`，不由 Pastoral 选择预设。
- 2026-08-01 变量更新使用 `generate + preset_name`；`generateRaw` 仅作为 none 模式旧环境回退。
- 2026-08-01 内部预设名为 `【Pastoral 内部】空白变量更新`，不调用 `loadPreset()`，不改变玩家当前预设。
- 2026-08-01 首次 MVU 写回超时后继续归寝变量 API；最终写回失败不得报告完整成功。
- 2026-08-01 只提交本任务涉及文件，不触碰或暂存用户现有 MVU 文档和拆分参考改动。

## Open Questions
- 无。用户已授权技术细节采用推荐默认并直接实施。
