# Pastoral 变量请求组装重构设计

日期：2026-08-01

## 概述

变量更新请求当前在"跟随当前预设"和"固定指定预设"两种模式下会丢失前端保存的更新指导。根因是接口契约缺陷：SillyTavern 预设的占位符提示词枚举里**没有 `user_input`**，`Overrides` 也没有对应字段，因此 `generate({ preset_name, user_input })` 中的 `user_input` 没有任何声明位置，是否进入最终请求完全由该预设是否启用聊天历史条目决定。本轮把变量请求的组装权从酒馆收回到前端，并提供两种可切换的组装策略。

## 根因证据

- `_types_split/06-generate.txt:328-337` — `generateRaw` 的 `PlaceholderPrompt` 联合类型**包含** `'user_input'`。
- `_types_split/09-preset.txt:162-175` — 预设的 `PresetPlaceholderPrompt` id 联合类型只有 `worldInfoBefore | personaDescription | charDescription | charPersonality | scenario | worldInfoAfter | dialogueExamples | chatHistory`，**不含 `user_input`**（全文出现 0 次）。
- `_types_split/06-generate.txt:345-365` — `Overrides` 无 `user_input` 字段，预设模式下没有覆盖通道。
- `js/api.js:193-199` `orderedPrompts()` 在 none 模式显式追加 `'user_input'`，所以 none 模式一直是正确的。
- `js/api.js:280-281` 预设模式直接调用 `generate({ preset_name })`，落点交给预设决定。
- `js/api.js:321`、`js/api.js:399`、`js/api.js:493` 三处调用点硬编码 `max_chat_history: 0`，而 `generateVariable()` 只在 none 分支重写该字段（`js/api.js:276`），预设分支把 `0` 原样透传，把唯一可能承载任务消息的区域截断为零。

因此 fixed 模式最容易丢失：为变量计算挑选的预设通常不会启用聊天历史条目。

## 目标

- 三种预设模式下，变量更新任务消息**必须**进入最终请求，且可在设置页逐条核验。
- 提供两种组装策略，玩家可按普通/归寝分别切换。
- 保留既有的深度注入屏蔽、上下文勾选、采样温度与格式救援能力。
- 不依赖世界书存放变量更新规则或输出格式。
- 组装结果可预览：显示每条消息的角色、来源、顺序和字符数。

## 非目标

- 不改变主剧情的 `/send` 与 `/trigger await=true` 行为。
- 不切换、不写入、不删除玩家的酒馆预设（不重蹈 `LEGACY_PRESET_NAME` 泄漏内部预设的旧错误）。
- 不向世界书写入任何条目。
- 不改变确定性日结算法、JSON Patch 协议与 MVU 写回流程。
- 不把 API Key、预设内容或变量快照写入日志。

## 为何不采用其他方案

**假世界书注入**：世界书条目只能经预设的 `worldInfoBefore`/`worldInfoAfter` 占位符或 `at_depth` 深度注入进入请求，两条路都重新取决于预设配置，送达问题原样存在；`enabled: false` 的条目永不激活；且世界书是共享状态，会污染主剧情生成。

**临时克隆预设**：`createOrReplacePreset` + `loadPreset` 会改动全局酒馆状态，`'in_use'` 可能与已保存预设不同（`09-preset.txt:190-198`），崩溃或并发会留下错误预设。本仓库 `js/api.js:11-12` 的 `LEGACY_PRESET_NAME` 就是这个模式留下的历史债。

## 1. 组装策略

新增每阶段设置 `assembly`，取值 `compile`（默认）或 `inject`。仅在 `mode` 为 `current`/`fixed` 时生效；`none` 模式恒定走既有的 `generateRaw + ordered_prompts` 最小路径。

### 1.1 compile：编译成消息列表（默认）

1. `getPreset(presetName)` 读取选中预设（`current` 用 `'in_use'`）。
2. 按 `prompts` 数组**原顺序**遍历，跳过 `enabled === false` 的条目，忽略 `prompts_unused`。
3. 分类映射：
   - 系统提示词（`main`/`nsfw`/`jailbreak`/`enhanceDefinitions`）与普通提示词 → `{ role, content }` 形式的 `RolePrompt`，`content` 为空则跳过。
   - 占位符提示词 → 对应的 `generateRaw` 占位符字符串（`worldInfoBefore` → `world_info_before` 等）。
4. 占位符再经上下文勾选过滤：玩家取消勾选的占位符不进入列表，即使预设启用了它。勾选优先级高于预设。
5. 末尾**强制追加**任务消息 `{ role: 'user', content: buildPrompt(...) }`。
6. 追加后断言任务消息存在且位于末位，否则抛出明确错误，不发送不完整请求。

`in_chat` 深度条目在此策略下按其在数组中的位置转为相对位置。这是本策略已知且明示的保真损失。

预设的 `settings`（`squash_system_messages`、`character_name_prefix`、`wrap_user_messages_in_quotes`、`reasoning_effort`、`max_context` 等）不随 `ordered_prompts` 传递，因此不生效。对变量计算无实质影响：合并系统消息与角色名前缀不改变 JSON Patch 结果。采样参数仍由本项目的 `samplingOverrides()` 经 `custom_api` 控制。

### 1.2 inject：保真 + 注入

1. 仍调用 `generate({ preset_name })`，预设的提示词、`settings`、`in_chat` 深度条目全部由酒馆保真组装。
2. 任务消息经 `injects: [{ role: 'system', content: prompt, position: 'in_chat', depth: 0, should_scan: false }]` 送入聊天区最深处。
3. `should_scan: false` 确保任务文本不进入世界书绿灯扫描文本，不会激活任何世界书条目。
4. **不再**硬编码 `max_chat_history: 0`：该值截断唯一可承载注入的区域。预设模式改用可配置的历史条数，默认 `0` 条真实历史但保留区域本身；若该组合仍导致注入丢失，回退为 `1`。
5. `user_input` 同时保留填充：预设若确实暴露聊天历史块则无害，且维持格式纠正流程一致。

此策略下落点仍由酒馆决定。若预设没有启用聊天历史条目，任务消息**仍有丢失风险**；设置页明确标注这一点。

### 1.3 两策略共用

- 深度注入与作者注释屏蔽（`overrides.chat_history.with_depth_entries = false`、`author_note = ''`）。
- 采样参数覆盖（温度默认 0，惩罚项 `'unset'`）。
- 格式救援与每次尝试内附的一次格式纠正请求（不占用玩家重试次数）。
- 固定预设已删除时降级为 none，并提示玩家修正。

## 2. 设置结构

`mrfz_settings.variablePresets.{normal,endday}` 增加一个字段：

```
assembly: 'compile' | 'inject'   // 默认 'compile'，非法值归一化为 'compile'
```

现有 `mode`、`presetName`、`context`、`blockDepthEntries`、`temperature` 语义不变。普通与归寝仍独立保存。未知旧字段继续保留。

## 3. 界面

### 3.1 变量请求预设页

每张卡片在"预设模式"下方增加"组装方式"下拉，仅在 `current`/`fixed` 时显示：

- `编译成消息列表（保证送达）`
- `保真 + 注入（可能丢失）`

选择 `inject` 时显示警示说明：落点由酒馆决定，预设未启用聊天历史条目时任务消息可能不进入请求。

"实际发送"说明行同步反映当前组装方式。

### 3.2 组装预览

预设页新增"预览本阶段组装结果"按钮，输出编译后的完整消息清单，每行显示序号、角色、来源（预设条目名 / 占位符 / 本项目任务）和字符数，末行明确标注任务消息位置。`inject` 模式下改为显示将要注入的 `injects` 结构与其落点说明。

更新提示词页现有的请求预览保留，继续显示任务消息全文。

## 4. 测试

`test/api.js`：

- compile 模式：`ordered_prompts` 末位是任务消息且含前端指导与输出格式；禁用条目不出现；`prompts_unused` 不出现；占位符按预设顺序映射；取消勾选的占位符被过滤。
- compile 模式关键回归：预设 `prompts` 中**没有** `chatHistory` 条目时，任务消息依然送达（当前实现无法通过此项）。
- inject 模式：`injects[0]` 含任务文本且 `should_scan === false`；不再传 `max_chat_history: 0`；`preset_name` 正确。
- 两模式均不调用 `createOrReplacePreset` / `loadPreset` / 任何世界书写接口。
- 格式纠正 pass 2 仍携带任务消息（compile 走 `ordered_prompts`，inject 走 `injects`）。
- none 模式行为不回退。

`test/settings.js`：`assembly` 默认值、非法值归一化、两阶段独立保存、持久化往返。

`test/smoke.js`：组装方式下拉存在且仅在预设模式显示；切换后说明文字变化；预览按钮输出消息清单且末行为任务消息；保存往返。

## 5. 验证

`npm test` 全量通过；修改脚本 `node --check`；`git diff --check`；重建 `index.html` 并与 `public/index.html` 一致；用玩家实际配置（`http://127.0.0.1:7861/v1`、`gemini-3.1-flash-lite`、固定预设无 `chatHistory` 条目）模拟两种组装方式，核对最终消息列表确认任务消息在位。

## 6. 未验证事项

TavernHelper 运行时未包含在本仓库（只有 `_types_split` 类型声明），因此以下无法从源码确认，将在实测中核对：

- `generateRaw` 的 `ordered_prompts` 中 `RolePrompt.content` 是否仍执行宏替换（`{{char}}`、`{{user}}` 等）。若不替换，预设条目里的宏会以字面量发出。
- `injects` 在预设完全没有聊天历史块时的确切落点。
- 角色卡的历史后指令（Post-History Instructions）在 `generateRaw` 路径下是否仍被附加。
