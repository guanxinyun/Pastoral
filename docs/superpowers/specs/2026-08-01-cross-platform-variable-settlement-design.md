# 跨平台变量请求与归寝流水线修复设计

日期：2026-08-01
状态：待用户最终审阅

## 背景

相同的酒馆、TavernHelper 版本和 `index.html` 在两个宿主上表现相反：

- Termux：变量更新请求只看到酒馆预设内容，前端保存的更新指导没有进入请求；
- Windows BAT：更新指导进入请求两遍；
- Windows 的归寝流程还表现为日常更新预设被使用，而归寝预设似乎没有使用；
- 归寝语义需要明确分成日常即时更新、前端确定性结算、跨日归寝更新，而不是只执行最后一段。

目标是让 Termux 和 Windows 生成完全相同、可核验的变量请求，并保证日常与归寝使用各自设置。

## 根因

### 1. 同一任务通过两条通道发送

`js/api.js` 的 `generateVariable()` 在 `assembly === 'inject'` 时同时：

1. 保留 `base.user_input`；
2. 将同一文本写入 `injects[0].content`。

这两条通道不是互斥的。Windows 运行时同时消费两者，得到两份更新指导；Termux 运行时没有可靠消费 `injects`，而 `user_input` 在预设中又没有保证落点，于是只剩预设内容。

### 2. 预设没有 `user_input` 槽位

- `_types_split/06-generate.txt` 的 `GenerateRawConfig.ordered_prompts` 支持 `'user_input'`；
- `_types_split/09-preset.txt` 的 `PresetPlaceholderPrompt` 只包含世界书、角色、玩家人格、场景、示例对话和聊天历史，占位符枚举中没有 `user_input`；
- `Overrides` 也没有 `user_input` 字段。

因此 `generate({ preset_name, user_input })` 无法保证任务文本进入最终请求。

### 3. 归寝阶段看似使用日常预设

多 API 归寝当前确实先调用一次：

```text
processAfterMain(... purpose: 'normal')
```

然后才执行确定性结算和：

```text
processEndday(... purpose: 'endday')
```

所以日志中首先出现日常预设本身符合当前顺序。若第二阶段因任务丢失、重复或格式错误失败，结果看起来就像归寝只使用日常预设。

### 4. 单 API 与多 API 的归寝语义不同

日常前置请求只在 `mode === 'multi'` 时显式执行。单 API 复用主剧情楼层自带的 MVU 更新，随后直接进入前端确定性结算与归寝请求。这种调用次数差异是合理的，但代码没有把两者表述成同一套三阶段语义，也缺少阶段级诊断。

## 已确认的产品语义

### 单 API

```text
主剧情（楼层自带 MVU = 日常阶段）
→ 前端确定性结算
→ 当前主 API 静默执行归寝阶段
→ 最终事实锁定与写回
```

单 API 不额外静默调用日常更新，避免重复请求。

### 多 API

```text
主剧情
→ 第二 API 执行日常阶段
→ 前端确定性结算
→ 第二 API 执行归寝阶段
→ 最终事实锁定与写回
```

### 日常阶段失败

多 API 的日常阶段失败后继续执行前端确定性结算和归寝阶段，但：

- 账簿标为“部分完成”；
- 保留日常阶段错误；
- 归寝提示包含“日常阶段失败，不得猜测补算”；
- 归寝阶段不能兼任或补算日常职责。

## 设计

## 1. 统一确定性编译

删除运行时的 `generate + injects` 变量请求路径。所有变量更新请求统一为：

```text
阶段配置快照
→ 读取选中预设
→ 编译 ordered_prompts
→ 强制追加唯一任务消息
→ generateRaw
```

### 1.1 阶段配置快照

每次变量请求开始时读取一次 `Settings.load()`，根据 `kind` 明确选择：

- `variablePresets.normal`；或
- `variablePresets.endday`。

建立不可变快照：

- `kind`；
- `mode`；
- `presetName`；
- `context`；
- `temperature`；
- 深度内容屏蔽设置；
- 本阶段更新指导。

后续编译和发送只能使用该快照，不能重新读取另一阶段设置。普通与归寝预设由结构保证隔离。

### 1.2 预设解析

- `none`：不读取预设提示词；
- `current`：读取 `getPreset('in_use')`；
- `fixed`：读取 `getPreset(snapshot.presetName)`；
- 固定预设不存在：明确报错或按既有行为降级为 none，并记录诊断。

只读取预设，不调用 `loadPreset`，不修改玩家当前预设，不写入临时预设。

### 1.3 消息编译

编译器按预设 `prompts` 原顺序：

1. 跳过 `enabled === false`；
2. 跳过 `prompts_unused`；
3. 普通和系统提示词转为 `{ role, content }`；
4. 占位符转为 `generateRaw` 对应占位符；
5. 玩家取消勾选的上下文，即使预设启用也不发送；
6. 最后追加唯一任务消息：

```js
{ role: 'user', content: taskPrompt }
```

发送前验证：

- 任务消息出现次数严格等于 1；
- 任务消息位于末位；
- 阶段为 `normal` 时只包含日常指导指纹；
- 阶段为 `endday` 时只包含归寝指导指纹；
- 编译预设名与阶段快照一致。

任一不变量失败时终止请求，不发送不完整或重复请求。

### 1.4 发送

只调用 `generateRaw()`：

- `ordered_prompts` 使用编译结果；
- 第二 API URL、Key、模型和采样参数继续通过 `custom_api` 提供；
- 单 API 静默归寝也走同一编译器，但不提供 `custom_api`；
- 不传 `injects`；
- 不再把同一任务同时放入 `user_input` 与消息列表；如 API 契约要求 `user_input` 字段，传空字符串或不传。

缺少 `generateRaw` 或需要的预设读取 API 时明确报兼容错误，不静默退化为 `generate()` 或酒馆当前预设。

## 2. 归寝阶段控制器

将现有散落在 `Chat.handleUnifiedRequest()` 与 `ApiEngine.processEndday()` 的阶段调用抽成明确控制器。每个阶段返回：

```js
{
  stage: 'normal' | 'deterministic' | 'endday' | 'enforce',
  ok: boolean,
  source: 'main-story' | 'main-api' | 'second-api' | 'script',
  snapshot,
  error,
  stageId
}
```

### 2.1 多 API 流程

1. 从主生成前快照，以 `normal` 阶段快照调用第二 API；
2. 将日常结果写回，读取最新 MVU 快照；
3. 执行前端确定性结算和有限等待写回；
4. 以确定性结算后的最新快照和 `endday` 阶段快照调用第二 API；
5. 锁定确定性事实并最终写回。

### 2.2 单 API 流程

1. 将主剧情楼层已完成的 MVU 视为 `normal` 阶段结果，来源标记 `main-story`；
2. 读取主剧情后的最新 MVU 快照；
3. 执行同一套前端确定性结算；
4. 以 `endday` 阶段快照调用当前主 API一次；
5. 锁定确定性事实并最终写回。

### 2.3 幂等性

每个阶段使用独立标识：

```text
endday:<messageId>:normal
endday:<messageId>:deterministic
endday:<messageId>:endday
endday:<messageId>:enforce
```

同一消息不能重复执行同一阶段。重试只重试失败阶段，不重新执行已成功阶段或确定性扣费。

## 3. 失败处理

### 日常阶段失败

- 记录错误；
- 继续确定性与归寝阶段；
- 把以下事实加入归寝任务：

```text
日常变量阶段失败；不得猜测、补算或重复执行日常即时变化。
```

- 最终账簿标为“部分完成”。

### 首次确定性写回超时

沿用当前有限等待：继续归寝阶段，结束时再次锁定。迟到写回完成后再执行一次事实锁定。

### 归寝阶段失败

保留日常阶段结果和确定性结算，账簿标为“部分完成”。

### 最终写回失败

不得报告完整成功；显示最终写回错误。

## 4. 设置迁移与界面

保留普通/归寝各自的：

- `mode`；
- `presetName`；
- `context`；
- `temperature`；
- 深度内容屏蔽设置。

移除界面上的 `assembly` 选择。旧缓存中的 `assembly: 'inject'` 自动归一化为确定性编译，不要求清缓存。

设置页和预览页显示：

- 阶段；
- 实际预设；
- 编译消息数；
- 任务消息数量；
- 任务消息是否末位；
- 上下文占位符清单。

不再显示“保真 + 注入”选项或可能误导的说明。

## 5. 诊断

每个变量请求发送前记录安全元数据：

```text
[Pastoral][VariableRequest]
stage=normal|endday
mode=none|current|fixed
preset=<name|none>
transport=generateRaw
messages=<n>
taskCount=1
taskLast=true
taskFingerprint=<hash>
tavernHelperVersion=<version|unknown>
tavernVersion=<version|unknown>
```

不记录：

- API Key；
- 完整提示词；
- 完整 MVU 快照。

诊断使 Termux 与 Windows 能直接比较同一请求的结构，而不依赖模型回复倒推。

## 6. 测试

### 请求组装

- 生产变量路径不调用 `generate()`；
- 生产变量路径不设置 `injects`；
- 任务文本只出现一次且位于 `ordered_prompts` 末位；
- 格式纠正请求同样只有一份任务；
- 模拟 Windows 同时消费 `user_input` 和 `injects`、Termux 忽略 `injects`：两种宿主均只收到相同的 `ordered_prompts` 任务消息。

### 阶段设置隔离

设日常固定预设 A、归寝固定预设 B：

- 多 API 归寝必须记录 `normal → A`；
- 确定性结算后必须记录 `endday → B`；
- 两阶段指导指纹不同且与对应阶段匹配；
- 阶段二不重新读取或复用阶段一快照。

### 归寝顺序

多 API：

```text
normal(A) → deterministic → initial-write → endday(B) → enforce
```

单 API：

```text
main-story-as-normal → deterministic → initial-write → endday(B) → enforce
```

单 API 不额外调用日常静默请求。

### 失败路径

- 多 API 日常失败后仍继续后两阶段；
- 归寝提示包含“日常阶段失败，不得补算”；
- 最终结果标为部分完成并包含日常错误；
- 归寝失败保留前两阶段；
- 最终写回失败不报成功；
- 重试不重复扣费、不重复推进作物。

## 7. 验收标准

- Termux 与 Windows 的请求诊断中，给定相同设置时 `stage/preset/messages/taskCount/taskLast/taskFingerprint` 完全一致；
- 任何变量请求都不存在同一任务两份或零份；
- 日常与归寝使用各自预设和指导；
- 多 API 归寝按日常 → 确定性 → 归寝执行；
- 单 API 复用主剧情日常结果，不额外调用日常静默请求；
- 日常阶段失败时归寝可继续但明确为部分完成；
- 全量测试、脚本语法检查、构建一致性和差异检查全部通过。
