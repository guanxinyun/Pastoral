# 跨平台变量请求与归寝流水线修复设计

日期：2026-08-01
状态：已批准

## 背景与根因

同一酒馆、TavernHelper 版本和 `index.html` 在两个宿主上表现相反：

- Termux：固定预设请求仍使用当时的酒馆当前预设，前端更新任务没有进入请求；
- Windows：更新任务进入请求两遍；
- 归寝看起来一直使用日常预设；
- 归寝还需要先完成即时（日常）更新，再做确定性结算，最后做跨日更新。

当前 `js/api.js` 的 `inject` 路径把同一任务同时放在 `user_input` 和 `injects[0].content`。Windows 同时消费两条通道，所以出现两份；Termux 没有可靠消费 `injects`，而 `preset_name` 路径又没有像真正切换当前预设那样生效，所以只剩原酒馆预设。

用户确认此前脚本通过“切换预设、发起生成、立刻切回”在手机端正常工作。变量请求因此改用酒馆原生当前预设生成，不再依赖 `preset_name + injects` 组合。

## 已确认的产品语义

### 预设模式

- `none`：不切换酒馆预设，使用 `generateRaw()` 和前端明确组装的上下文。
- `current`：不切换，直接用当前 `in_use` 调用 `generate({ user_input })`。
- `fixed`：短事务切换到阶段固定预设，调用 `generate({ user_input })` 获得 Promise，立刻恢复原预设，再在事务外等待结果。

所有模式中更新任务只通过一条通道发送；不再使用 `injects`。

### 单 API 归寝

```text
主剧情（楼层自带 MVU = 日常阶段）
→ 前端确定性结算
→ 当前主 API 使用归寝预设静默执行归寝阶段
→ 最终事实锁定与写回
```

单 API 不额外静默调用日常更新。

### 多 API 归寝

```text
主剧情
→ 第二 API 使用日常预设执行日常阶段
→ 前端确定性结算
→ 第二 API 使用归寝预设执行归寝阶段
→ 最终事实锁定与写回
```

多 API 日常阶段失败后继续确定性与归寝阶段，但最终标为“部分完成”，且归寝提示包含“日常变量阶段失败；不得猜测、补算或重复执行日常即时变化”。

## 1. 阶段配置快照

每次请求发起前读取一次 `Settings.load()`，根据 `kind` 选择 `variablePresets.normal` 或 `variablePresets.endday`，建立不可变快照：

```js
{
  kind: 'normal' | 'endday',
  mode: 'none' | 'current' | 'fixed',
  presetName: string,
  context: Record<string, boolean>,
  blockDepthEntries: boolean,
  temperature: number,
  guide: string
}
```

后续提示词构建、预设选择和生成只能使用该快照，不能重新读取另一阶段设置。这从结构上保证日常使用日常预设、归寝使用归寝预设。

## 2. 固定预设短事务

### 2.1 范围

事务只覆盖本地同步/短异步步骤：

```text
保存现场 → 切换目标 → 调用 generate 获得 Promise → 恢复现场 → 释放锁
```

网络响应等待不在锁内。事务释放后才 `await responsePromise`。

### 2.2 现场保存

固定预设请求开始时保存：

- `getLoadedPresetName()`：当前预设来源名；
- 深拷贝 `getPreset('in_use')`：当前现场内容，包括尚未保存回来源预设的编辑。

保存现场是必要的，因为仅按名称切回会加载磁盘中的已保存版本，可能丢失玩家对 `in_use` 的未保存编辑。

### 2.3 发起与恢复

伪代码：

```js
let responsePromise;
await withPresetLaunchLock(async () => {
  const originalName = getLoadedPresetName();
  const originalLive = clone(getPreset('in_use'));
  try {
    if (!loadPreset(stage.presetName)) throw new Error('切换目标预设失败');
    responsePromise = Promise.resolve(generate(config));
  } finally {
    if (!loadPreset(originalName)) throw new Error('恢复原预设失败');
    await replacePreset('in_use', originalLive, { render: 'none' });
  }
});
return await responsePromise;
```

`generate(config)` 的调用发生在目标预设处于 `in_use` 时；随后立即恢复，不等待 API 回复。

### 2.4 短锁

短锁只防止两个请求在“切换 → 发起 → 恢复”窗口内交叉。锁不覆盖网络等待，不会让普通与归寝请求长期串行。

锁可用 Promise 链实现：每个事务等待前一个本地事务恢复完成，然后立即执行并释放。即使生成请求需要 30 秒，锁通常只占本地几步所需时间。

### 2.5 异常

- 缺少 `getLoadedPresetName/getPreset/loadPreset/replacePreset/generate`：明确报兼容错误；
- 目标预设不存在或切换失败：不发送请求；
- `generate` 同步抛错：仍恢复原现场；
- 恢复名称失败或恢复现场失败：记录严重错误并提示玩家检查当前预设；
- API Promise 后续拒绝：原预设已经恢复，不影响酒馆界面。

## 3. 三种生成路径

### none

使用 `generateRaw()`：

- `ordered_prompts` 按上下文勾选生成；
- 末尾只放一个 `user_input` 占位符；
- `user_input` 存放任务文本；
- 不传 `injects`。

### current

直接调用：

```js
generate({
  user_input: taskPrompt,
  should_stream: false,
  should_silence: true,
  custom_api
})
```

不传 `preset_name`，不传 `injects`，不切换预设。任务只出现一次。

### fixed

通过短事务切换目标阶段预设，然后调用与 current 相同的 `generate({ user_input })`。不传 `preset_name`，因为目标已经真实加载为 `in_use`。

## 4. 归寝阶段控制

每个阶段返回：

```js
{
  stage: 'normal' | 'deterministic' | 'endday' | 'enforce',
  stageId: string,
  ok: boolean,
  source: 'main-story' | 'main-api' | 'second-api' | 'script',
  error: Error | null
}
```

阶段标识：

```text
endday:<messageId>:normal
endday:<messageId>:deterministic
endday:<messageId>:endday
endday:<messageId>:enforce
```

### 多 API

1. 冻结 normal 快照，固定模式短切日常预设并发起第二 API 日常请求，立即恢复；
2. 写回日常结果并读取最新 MVU；
3. 执行确定性扣费、作物、每日标记、引力与有限等待写回；
4. 冻结 endday 快照，固定模式短切归寝预设并发起第二 API 归寝请求，立即恢复；
5. 最终事实锁定与写回。

### 单 API

1. 主剧情楼层自带 MVU 作为 normal 阶段结果；
2. 执行同一套确定性结算；
3. 冻结 endday 快照，固定模式短切归寝预设并发起当前主 API 归寝请求，立即恢复；
4. 最终事实锁定与写回。

重试只重试失败的变量阶段，不重新执行确定性结算。

## 5. 设置与界面

保留两阶段各自的：

- `mode`；
- `presetName`；
- `context`；
- `temperature`；
- 深度内容屏蔽设置。

移除 `assembly` 选择。旧缓存中的 `assembly` 字段迁移时删除，不要求玩家清缓存。

设置页说明三种模式的真实行为，并显示最近请求的安全诊断：阶段、模式、目标预设、传输方式、任务数量、任务指纹、切换与恢复结果。

## 6. 安全诊断

每个请求发起时记录：

```text
[Pastoral][VariableRequest]
stage=normal|endday
mode=none|current|fixed
targetPreset=<name|in_use|none>
transport=generateRaw|generate-current|generate-switched
taskCount=1
taskFingerprint=<hash>
switched=true|false
restored=true|false
tavernHelperVersion=<version|unknown>
tavernVersion=<version|unknown>
```

不记录 API Key、完整提示词或完整 MVU 快照。

## 7. 测试

### 重复与缺失

- Windows 模拟器同时消费 `user_input` 和 `injects`：因为生产配置没有 `injects`，任务只有一份；
- Termux 模拟器忽略 `injects`：任务仍通过唯一 `user_input` 进入；
- `none` 模式继续使用 `generateRaw + user_input`，任务只有一份。

### 固定预设短事务

- 调用顺序严格为：保存名称 → 保存现场 → 切目标 → 调用 generate → 切回名称 → 恢复现场；
- `generate` 返回的 Promise 未解决时，恢复已经完成且短锁已释放；
- 两个并发请求的切换窗口不交叉，但网络等待可以并发；
- 同步抛错仍恢复；
- 原 `in_use` 未保存编辑被精确恢复。

### 阶段隔离

日常固定 A、归寝固定 B：

```text
多 API：switch(A) → launch normal → restore → deterministic → switch(B) → launch endday → restore → enforce
单 API：main-story-as-normal → deterministic → switch(B) → launch endday → restore → enforce
```

### 失败路径

- 日常失败后继续并标为部分完成；
- 归寝提示带“日常失败，不得补算”；
- 归寝失败保留日常和确定性结果；
- 最终写回失败不报成功；
- 重试不重复扣费或推进作物。

## 8. 验收标准

- Windows 不再出现两份任务；
- Termux 固定模式真实切换到目标阶段预设发起请求，并立即恢复；
- 网络等待不占用预设切换锁；
- 玩家当前预设名称和未保存现场内容均恢复；
- 日常和归寝严格使用各自预设；
- 归寝流程符合单/多 API 的已确认语义；
- 全量测试、语法检查、构建一致性和差异检查全部通过。
