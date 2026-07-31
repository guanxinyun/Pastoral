# Pastoral 主模型生命周期、归寝流水线与变量预设设计

日期：2026-08-01

## 概述

本轮修复三个相互关联的运行问题：主模型回复完成后界面仍显示等待、归寝流程被确定性 MVU 写回阻塞而不再调用变量 API，以及变量更新请求无法由玩家控制是否使用 SillyTavern 生成预设。主剧情继续使用酒馆原生发送行为；新增设置只影响主剧情结束后的普通变量更新和归寝变量更新。

## 目标

- 主剧情出现新的 AI 楼层后可靠结束等待状态，不依赖单一事件。
- 普通单 API 请求完成后显示明确完成状态，不遗留加载动画。
- 确定性结算写回悬挂时，归寝变量 API 仍能继续执行。
- 同一归寝结算 ID 不重复扣费、不重复推进作物。
- 普通变量更新与归寝变量更新分别支持不带预设、跟随当前预设、固定指定预设。
- 两类预设选择和无预设上下文开关持久化到 `mrfz_settings`。
- 第二 API 连接测试与真实变量请求使用相同的预设选择逻辑。

## 非目标

- 不改变主剧情的酒馆原生 `/send` 与 `/trigger` 行为。
- 不替换玩家当前选中的酒馆预设。
- 不通过浏览器直接 `fetch` 重写酒馆的 API 路由、鉴权和供应商兼容层。
- 不改变现有确定性日结算法、变量规则或 JSON Patch 协议。
- 不把 API Key、预设内容或变量快照写入日志。

## 1. 主剧情完成检测

### 1.1 完成条件

`/trigger await=true` 负责等待酒馆生成调用结束，但它的返回本身不保证界面已经能读取到新楼层。主剧情完成采用组合判定：

1. 请求开始前记录最后楼层 ID。
2. 触发生成后监听 `tavern_events.MESSAGE_RECEIVED` 和 `tavern_events.GENERATION_ENDED`，将收到的消息 ID作为候选值。
3. 同时轮询 `getLastMessageId()` 与候选消息。
4. 只有发现 ID 大于请求前楼层且该楼层不是 `user` 角色时，才将其认定为本次主回复。
5. `/trigger await=true` 已返回时缩短剩余等待；事件缺失或参数异常不妨碍轮询完成。
6. 超时必须抛出明确错误并结束 UI 加载状态，不能降级使用旧楼层。

### 1.2 状态收尾

每条成功路径必须写入非加载状态：

- 普通单 API：`主剧情完成 / 回复与变量已由酒馆处理。`
- 普通多 API：后处理成功时沿用 `变量更新完成`；失败时显示变量更新失败但主剧情已保留。
- 归寝：进入确定性结算时立即替换“等待主模型”；结束时显示完成或具体失败阶段。

`finally` 只负责解除输入锁和清除打字指示，不再依赖它隐式修正状态条。

## 2. 归寝流水线与写回超时

### 2.1 阶段顺序

归寝执行以下流水线：

1. 主剧情完成。
2. 多 API 模式执行本轮普通变量更新。
3. 从最新 MVU 快照在内存中运行确定性日结。
4. 尝试首次写回确定性结果。
5. 调用归寝变量更新 API。
6. 从 AI 更新后的最新快照重新锁定确定性事实。
7. 执行最终写回并显示账簿。

单 API 模式省略第二步；主剧情自身仍按酒馆规则处理日常变量。

### 2.2 计算与写回拆分

`MVU.settleAndWrite()` 不再成为不可分割的阻断步骤。改为：

- `settleDay()` 同步计算内存结果和报告。
- 写回通过带超时的 MVU 写入辅助函数执行。
- 首次写回超过限定时间时记录警告并继续归寝变量 API；内存中的确定性结果仍作为只读事实传给模型。
- AI 更新结束后执行事实锁定和最终写回；最终写回失败则将流程标记为部分失败，绝不报告“账簿已更新”。

写入超时只停止等待，不能假定底层 Promise 已取消。因此所有后续写回仍使用相同结算 ID 和确定性快照，结果必须幂等。

### 2.3 防重复

- 继续以 `endday-message-<messageId>` 作为结算 ID。
- 结算报告写入 `pastoral.lastSettlementId` 与 `lastSettlementReport`。
- 重试、超时后的迟到写回、UI 重绘和第二 API 手动重试均不得重新运行扣费或植物推进。
- 最终事实锁定只复制已计算结果，不再次执行日结算法。

## 3. 变量更新预设模型

### 3.1 设置结构

在 `mrfz_settings` 中新增：

```js
variablePresets: {
  normal: {
    mode: 'none',
    presetName: '',
    context: {
      worldInfoBefore: true,
      personaDescription: true,
      charDescription: true,
      charPersonality: true,
      scenario: true,
      worldInfoAfter: true,
      dialogueExamples: true,
      chatHistory: true
    }
  },
  endday: {
    mode: 'none',
    presetName: '',
    context: { /* 同上，独立保存 */ }
  }
}
```

`mode` 只接受：

- `none`：使用 Pastoral 空白变量预设。
- `current`：单次请求使用 `preset_name: 'in_use'`。
- `fixed`：单次请求使用保存的 `presetName`。

旧设置没有该字段时，两个阶段均规范化为 `none`。

### 3.2 空白变量预设

内部预设名称：`【Pastoral 内部】空白变量更新`。

生成方法：

1. 深拷贝酒馆 `default_preset`，获得有效生成参数结构。
2. 清除普通提示词和系统提示词。
3. 根据该阶段的上下文开关建立并启用唯一的占位符提示词。
4. `prompts_unused` 不保留会被误启用的人工提示词。
5. 清空 `extensions.regex_scripts` 与 `extensions.tavern_helper`，避免内部预设携带正则或助手脚本。
6. 通过 `createOrReplacePreset()` 幂等创建或更新；不调用 `loadPreset()`，不改变玩家酒馆界面当前预设。

保留/可选占位符：

- `worldInfoBefore`
- `personaDescription`
- `charDescription`
- `charPersonality`
- `scenario`
- `worldInfoAfter`
- `dialogueExamples`
- `chatHistory`

本次请求的 `user_input` 始终存在，不能关闭。变量规则、最近正文、MVU 快照、确定性事实和输出格式继续由程序拼入 `user_input`。

### 3.3 跟随与固定预设

- `current` 完整遵循酒馆当时的 `in_use` 预设，包括其提示词、占位符顺序和生成参数。
- `fixed` 通过 `getPresetNames()` 验证名称后，将该名称作为本次 `preset_name`。
- 固定预设不存在时不静默改用当前预设；显示错误并对本次请求安全回退 `none`，同时保留原设置供玩家修正。
- Pastoral 的上下文开关仅在 `none` 模式生效；不得覆盖完整预设自身的占位符设置。

## 4. 生成接口统一

变量更新和第二 API 连接测试统一走同一个请求构造器：

- 使用 `generate()`，以 `preset_name` 表达 `none/current/fixed`。
- `none` 先确保内部空白预设存在，再传其名称。
- 第二 API 请求继续携带现有 `custom_api`，主 API 静默归寝不传 `custom_api`。
- 连接测试使用普通变量更新阶段的预设设置，默认因此是不带预设。
- 请求日志只记录 generation ID、目标主机、阶段、预设模式和固定预设名称；不记录 Key、完整提示词或变量快照。

若运行环境缺少预设 API：

- `none` 回退到现有 `generateRaw + ordered_prompts: ['user_input']` 最小路径，并显示兼容模式提示。
- `current/fixed` 缺少 `generate()` 时返回明确错误，不伪装成已应用预设。

## 5. 设置界面

在设置对话框新增“变量请求预设”页或区域：

- 普通变量更新与归寝变量更新各一张设置卡。
- 模式选择：不带预设、跟随酒馆当前预设、固定指定预设。
- 固定模式显示从 `getPresetNames()` 动态读取的下拉框；排除内部空白预设。
- 不带模式显示八个上下文开关。
- 保存后写入 `mrfz_settings`；表单关闭再打开必须恢复。
- 预设 API 不可用时禁用固定列表并显示说明，不显示空白无反馈。

所有控件保持现有暗色/亮色令牌、44px 触控目标、可见焦点和键盘操作。

## 6. 错误与状态反馈

请求状态至少区分：

- 发送主剧情
- 等待主模型
- 主剧情完成
- 普通变量更新
- 计算确定性结算
- 首次 MVU 写回
- 首次写回超时、继续变量更新
- 归寝变量更新
- 最终事实锁定
- 归寝完成
- 部分完成或失败

状态条不得在 Promise 已结束后继续显示加载。首次 MVU 写回超时属于可恢复警告；最终事实写回失败属于结算未完整落盘，必须显示错误。

## 7. 测试

自动化覆盖：

1. `/trigger await=true` 返回且新 AI 楼层出现后完成。
2. `GENERATION_ENDED` 缺失但 `MESSAGE_RECEIVED`/轮询发现新楼层时完成。
3. 普通单 API 最终状态非加载且标题为主剧情完成。
4. 旧楼层或用户楼层不能被误判为主回复。
5. 首次 MVU 写回永不返回时，归寝变量 API 仍在超时后调用。
6. 最终事实锁定写回成功与失败分别报告正确结果。
7. 同一结算 ID 不重复扣费、维护费或作物推进。
8. `none/current/fixed` 生成正确的 `preset_name`。
9. 内部空白预设清除人工提示词，只启用勾选的占位符并清除扩展。
10. 普通与归寝设置独立保存、深度合并并保留未知字段。
11. 固定预设删除后本次安全回退无预设并显示错误。
12. 第二 API 连接测试复用普通变量阶段的预设解析。
13. `npm test`、`node --check` 与 `git diff --check` 全部通过。

## 8. 文件范围

预计修改：

- `js/settings.js`
- `js/api.js`
- `js/chat.js`
- `js/mvu.js`
- `js/app.js`
- `css/components.css`
- `src/template.html`（如设置页或状态 DOM 需要）
- `test/settings.js`
- `test/api.js`
- `test/smoke.js`
- `index.html`（构建产物）

不修改用户当前未提交的 MVU 文档和拆分参考文件。

## 9. 权衡

### 保留 `generateRaw + ordered_prompts`

改动最小，但无法完整表达跟随/固定酒馆预设；用户实测连接测试仍出现预设行为，不采用为主方案，仅作旧环境兼容回退。

### 浏览器直接 `fetch`

可完全控制请求体，但会绕过酒馆的供应商适配、认证、连接配置与 CORS 处理，范围过大，不采用。

### `generate + preset_name` 与内部空白预设（采用）

利用酒馆正式预设模型，对三种模式语义清楚；内部空白预设可保留玩家选择的游戏上下文，又不会切换玩家当前预设。代价是酒馆预设列表中会出现一个明确标记为内部使用的预设。
