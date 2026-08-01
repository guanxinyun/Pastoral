# Pastoral 酒馆集成技术迁移指南

> 适用范围：把 Pastoral 已验证的正文处理、MVU、第二 API、固定预设短事务和“伪零层/伪同层”能力迁移到其他 SillyTavern 前端卡或 iframe 项目。
>
> 基准日期：2026-08-01。本文以当前源码和测试为准；历史设计稿只作背景参考。

## 1. 最终方案速览

Pastoral 当前由五条相互配合但可以独立迁移的链路组成：

```text
SillyTavern 真实消息楼层
        │
        ├─ 原始正文 ──> 酒馆显示正则 ──> DOM 清壳 ──> 自定义气泡
        │
        ├─ 最新楼层 ──> 完整 MvuData 快照 ──> UI 读取 stat_data
        │
        ├─ 主模型完成 ──> 第二 API 计算 JSON Patch
        │                         │
        │                         └─> 校验 ─> MVU 命令 ─> 写回消息和变量
        │
        ├─ 固定预设请求 ──> 临时切换主预设 ──> 延时捕获 ──> 恢复现场
        │
        └─ 0 楼 iframe ──> 隐藏原生其他楼层 ──> 聚合并重绘全部真实消息
```

最重要的边界是：

1. **显示层可以固定在 0 楼，但数据与操作必须始终使用真实 `message_id`。**
2. **MVU 读取和写回应处理完整 `MvuData`，业务 UI 才只取其中的 `stat_data`。**
3. **模型只输出声明式 JSON Patch，不能让任意模型文本直接作为 lodash/MVU 命令执行。**
4. **固定预设模式依赖一次真实的全局主预设切换；必须保存、串行、延时并恢复。**
5. **第二 API 不需要自行 `fetch`：TavernHelper 的 `custom_api` 已能把 `generate/generateRaw` 路由到另一个 OpenAI 兼容端点。**

---

## 2. 当前源码地图

| 能力 | 当前实现 | 关键入口 | 主要测试 |
|---|---|---|---|
| 正文、选项、变量标签处理 | `js/extract.js` | `getRawText`、`extractOptions`、`extractCleanContent`、`normalizeUpdateVariable`、`patchToMvuCommands` | `test/api.js`、`test/smoke.js` |
| MVU 读写与确定性结算 | `js/mvu.js` | `init`、`getDataSnapshot`、`writeData`、`writeWithTimeout`、`settleDay`、`enforceSettlementFacts` | `test/api.js`、`test/smoke.js` |
| 第二 API 和预设策略 | `js/api.js` | `createStageSnapshot`、`generateVariable`、`callSecondApiForVariable`、`applyUpdate`、`launchWithFixedPreset` | `test/api.js` |
| 主回复生命周期与阶段编排 | `js/chat.js` | `handleUnifiedRequest`、`waitForMainReply` | `test/api.js`、`test/smoke.js` |
| 伪零层宿主 | `js/host.js` | `messageId`、`isHost`、`selfDestruct`、`injectTakeover` | `test/smoke.js`、`test/iframe.js` |
| 配置持久化 | `js/settings.js` | `normalize`、`load`、`save`、`promptFor` | `test/settings.js`、`test/smoke.js` |
| MVU Schema 与初始值参考 | `本项目mvu文件.txt` | `registerMvuSchema(Schema)`、`initvar.yaml` | 角色卡/MVU 运行时 |
| TavernHelper 类型参考 | `_types_split/` | `04-chat-message.txt`、`06-generate.txt`、`09-preset.txt`、`15-ejs-mvu.txt` | 类型契约 |

迁移时不要复制打包后的 `index.html` 反向维护。当前项目通过 `build.js` 将 `src/template.html + css/* + js/*` 打成自包含页面；应迁移源模块并重新建立自己的构建顺序。

---

## 3. 宿主依赖与能力探测

### 3.1 必需扩展

- SillyTavern。
- TavernHelper/酒馆助手，向 iframe 全局暴露消息、生成、预设等函数。
- MVU 变量框架，向全局暴露 `Mvu`。
- 如果采用当前 Schema 方案，还需要能运行 `registerMvuSchema` 的角色卡脚本环境。

### 3.2 建议的最小宿主适配器

不要让业务组件到处直接访问全局函数。新项目可先收敛成：

```javascript
const TavernHost = {
  currentMessageId: () => getCurrentMessageId(),
  lastMessageId: () => getLastMessageId(),
  getMessages: (range) => getChatMessages(range),
  setMessages: (updates, options) => setChatMessages(updates, options),

  regexDisplay: (text, depth = 0) =>
    formatAsTavernRegexedString(text, 'ai_output', 'display', { depth }),

  generate: (config) => generate(config),
  generateRaw: (config) => generateRaw(config),
  stopGeneration: (id) => stopGenerationById(id),

  presetNames: () => getPresetNames(),
  loadedPresetName: () => getLoadedPresetName(),
  getPreset: (name) => getPreset(name),
  loadPreset: (name) => loadPreset(name),
  replacePreset: (name, preset, options) => replacePreset(name, preset, options),
};
```

初始化时应分别探测能力，按功能降级，而不是用一个总开关：

```javascript
const capabilities = {
  messages: typeof getChatMessages === 'function'
    && typeof getLastMessageId === 'function',
  regex: typeof formatAsTavernRegexedString === 'function',
  generation: typeof generate === 'function',
  rawGeneration: typeof generateRaw === 'function',
  presets: typeof getLoadedPresetName === 'function'
    && typeof getPreset === 'function'
    && typeof loadPreset === 'function'
    && typeof replacePreset === 'function',
};
```

TavernHelper 的函数是**直接暴露的全局函数**。当前接口不是 `window.TavernHelper.generate()` 或 `TavernHelper.getChatMessages()`。

---

# 第一部分：酒馆正文提取与处理

## 4. 在指导文件中选择了哪一种方法

用户指定的 `酒馆正文提取与处理指导文件 (1).txt` 给出四类入口：

| 方法 | 酒馆正则 | 宏替换 | HTML 转换 | 适用情况 |
|---|---:|---:|---:|---|
| `getChatMessages().message` | 否 | 否 | 否 | 要原文、提取选项或变量标签 |
| `formatAsTavernRegexedString()` | 是 | 否 | 只保留正则产生的 HTML | 自己做前端，但继承酒馆正则效果 |
| `formatAsDisplayedMessage()` | 是 | 是 | 是 | 完全复用酒馆完整渲染字符串 |
| `retrieveDisplayedMessage()` | 是 | 是 | 已渲染 DOM | 直接搬运酒馆现有 DOM |

Pastoral 最终选择的是指导文件中的 **模式 A：保留内联美化**：

```text
getChatMessages 取原文
  ├─ 正则之前提取选项、UpdateVariable 等机器标签
  └─ formatAsTavernRegexedString(..., 'ai_output', 'display', {depth: 0})
       └─ 临时 DOM 清理结构外壳
            └─ innerHTML 放入自己的正文容器
```

这里所谓“选择的方法”是**处理模式选择**，不是浏览器 `<input type="file">`、`FileReader` 或 `showOpenFilePicker()`。当前正文链路完全不读取本地文本文件。

### 为什么不直接选另外三种

- 只取原文：角色卡正则负责的思维链截断、上下截断和美化替换不会生效。
- 完整 `formatAsDisplayedMessage`：容易把原角色卡的页面容器、折叠布局和自己的前端壳一起带进来。
- `retrieveDisplayedMessage`：与酒馆当前 DOM、jQuery 对象和渲染时点耦合更强，不适合统一重绘全部历史消息。
- 纯文本或严格白名单：稳定但会丢失卡作者的颜色、发光、强调等内联效果。

## 5. 原文与机器标签应先分流

### 5.1 取消息原文

单楼读取：

```javascript
function getRawMessage(messageId) {
  const list = getChatMessages(messageId);
  return list?.[0]?.message || '';
}
```

当前 iframe 所在楼层：

```javascript
const raw = getRawMessage(getCurrentMessageId());
```

伪零层项目通常不应长期使用 `getCurrentMessageId()` 取业务数据，因为它恒为 0；应对每个真实气泡使用其 `message_id`，最新状态使用 `getLastMessageId()`。

### 5.2 选项必须在显示正则之前提取

当前兼容两种结构：

```text
块式：<options>A\nB</options>、<choices>...</choices>、<select>...</select>
单式：<option>A</option><option>B</option>、<choice>...</choice>
```

规则：

1. 块式优先。
2. 多个块取最后一个。
3. 块式按行拆；单式每个标签是一项。
4. 在 `formatAsTavernRegexedString()` 之前处理，因为正则可能删除或改写标签。

### 5.3 变量标签也从原文独立处理

当前取最后一个完整：

```html
<UpdateVariable>
  <Analysis>...</Analysis>
  <JSONPatch>[...]</JSONPatch>
</UpdateVariable>
```

正文渲染、选项提取和变量更新是三条不同通道，不应让“显示清洗”结果反过来成为机器数据源。

## 6. 正文清理算法

当前核心步骤：

```javascript
function extractCleanContent(rawText) {
  if (!rawText) return '';

  let text = rawText;
  text = formatAsTavernRegexedString(
    text,
    'ai_output',
    'display',
    { depth: 0 },
  );

  const temp = document.createElement('div');
  temp.innerHTML = text;

  temp.querySelectorAll('script, style, link').forEach((node) => node.remove());

  for (const tag of ['html', 'head', 'body', 'header', 'footer', 'nav']) {
    temp.querySelectorAll(tag).forEach((node) => node.replaceWith(...node.childNodes));
  }

  unwrapStructuralContainers(temp);
  return temp.innerHTML.trim();
}
```

纯布局容器的判定顺序：

1. 有直接文本节点：保留。
2. 内联样式包含内容美化属性，如 `color`、`text-shadow`、字体、动画、滤镜、透明度、阴影、字距、变换：保留。
3. class 像 `glow/highlight/gradient/dialogue/quote`：保留。
4. id/class 像 `wrapper/container/layout/main-text/message-body/frame`：解包。
5. 只有一个子元素且本身无文本：通常解包。
6. 不确定：保留。宁可留一个壳，不要误删内容效果。

容器应按 DOM 深度从深到浅处理，否则外层先被替换后，原节点列表的层级关系会变得难以预测。

## 7. 迁移时必须补强的安全点

当前实现只删除 `script/style/link`，但 `innerHTML` 仍可能包含：

- `onerror`、`onclick` 等事件属性；
- `javascript:` URL；
- `iframe/object/embed`；
- SVG 中可执行或外链内容；
- 表单和自动加载资源。

如果模型输出、角色卡正则或世界书不完全可信，应在 DOM 解包前增加成熟的 HTML Sanitizer，或建立严格标签/属性白名单。不要用简单正则代替 HTML Sanitizer。

另一个当前实现细节：`extractCleanContent()` 只移除了选项**标签名**，未必移除选项文字。迁移项目如果要完全分离正文与选项，建议先删除完整选项块：

```javascript
function stripOptionPayload(text) {
  return String(text || '')
    .replace(/<options>[\s\S]*?<\/options>/gi, '')
    .replace(/<choices>[\s\S]*?<\/choices>/gi, '')
    .replace(/<select>[\s\S]*?<\/select>/gi, '')
    .replace(/<option>[\s\S]*?<\/option>/gi, '')
    .replace(/<choice>[\s\S]*?<\/choice>/gi, '');
}
```

---

# 第二部分：MVU 读取、操作与写回

## 8. MVU 文件组合

当前项目选定的 MVU 配置由两类文件组成，记录在 `本项目mvu文件.txt`：

1. **角色卡脚本 `schema.ts`**：用 Zod 描述类型、默认值、数值强制转换和范围钳制，最后调用 `registerMvuSchema(Schema)`。
2. **世界书变量条目 `initvar.yaml`**：提供新聊天首次初始化时的实际初始数据。

两者职责不同：

- Schema 是长期约束和缺省修复。
- initvar 是初次实例化的数据种子。
- 前端不能假设 initvar 永远完整，读取时仍要做空对象和类型保护。

迁移到新项目时，先定义自己的业务 Schema，再让 UI 映射 `stat_data`；不要照抄 Pastoral 的旅店字段后再硬改。

## 9. 初始化与就绪判断

类型参考明确要求先等待：

```javascript
async function initMvu() {
  const initialized = await waitGlobalInitialized('Mvu');
  const api = globalThis.Mvu || initialized;

  if (!api
      || typeof api.getMvuData !== 'function'
      || typeof api.replaceMvuData !== 'function') {
    throw new Error('MVU 未暴露完整读写接口');
  }

  return api;
}
```

如果还要应用 AI 产生的命令，额外要求 `Mvu.parseMessage`。

不要因为 `waitGlobalInitialized()` 已 resolve 就假设所有方法都存在；应做结构检查并记录初始化错误，供后续写回报错使用。

## 10. 为什么读取完整 MvuData

MVU 类型定义：

```typescript
type MvuData = {
  initialized_lorebooks: Record<string, any[]>;
  stat_data: Record<string, any>;
  [key: string]: any;
};
```

因此正确边界是：

```javascript
const fullData = Mvu.getMvuData({
  type: 'message',
  message_id: getLastMessageId(),
});

const snapshot = structuredClone(fullData);
const stateForUi = snapshot.stat_data;
```

错误做法是只保存 `stat_data`，然后把它传给 `replaceMvuData()`。这可能丢失初始化世界书和其他 MVU 元数据。

生成期间最新楼可能暂时返回 `stat_data: null` 或空对象。当前实现缓存最近一份有效的完整 `MvuData`；若页面冷启动尚无缓存，则从最新楼向前回溯，命中最近有效楼后立即停止。该回退只用于读取显示，不会把旧楼状态写进新楼；明确写回成功后才更新缓存。

### 为什么立即深拷贝

`getMvuData()` 返回的是宿主管理的数据对象。直接持有并修改它会产生两个问题：

1. baseline 不再代表“主生成前”的旧状态。
2. 业务代码可能在显式写回前污染共享引用。

优先 `structuredClone`，不支持时可用 JSON 克隆，但 JSON 克隆只适合纯 JSON 数据。

## 11. 伪零层下的楼层定位

当前 UI iframe 永远位于 0 楼，但 MVU 必须读最新真实消息：

```javascript
function latestMessageData() {
  return Mvu.getMvuData({
    type: 'message',
    message_id: getLastMessageId(),
  });
}
```

三个 ID 不要混淆：

| ID | 含义 | 用途 |
|---|---|---|
| `getCurrentMessageId()` | 当前 iframe 所在楼层 | 判断是否为唯一 0 楼宿主 |
| `getLastMessageId()` | 当前聊天最新真实楼层 | 最新 UI 状态、主回复后的默认目标 |
| 流程捕获的 `messageId` | 本次确认到的新 AI 楼层 | 精确写回本次第二 API 结果 |

写回时优先使用流程捕获的明确 `messageId`，不要在异步请求结束后重新取 latest；否则并发期间新增消息会把结果写错楼。

## 12. 安全的 AI 更新协议

### 12.1 模型输出

模型只能输出：

```html
<UpdateVariable>
  <Analysis>简短说明</Analysis>
  <JSONPatch>
    [
      {"op":"delta","path":"/旅店/资金","value":-300},
      {"op":"replace","path":"/世界/时间/当前时间","value":"08:30"}
    ]
  </JSONPatch>
</UpdateVariable>
```

允许操作：

- `replace`
- `delta`
- `insert`
- `remove`
- `move`

### 12.2 客户端验证

至少验证：

1. 标签完整且有 `Analysis`。
2. `JSONPatch` 能解析为数组。
3. 每项是普通对象，`op` 在允许集合。
4. `path/from/to` 是合法 JSON Pointer。
5. `~` 只允许 `~0` 和 `~1` 转义。
6. 任一路径段以 `_` 开头则拒绝，保护 MVU/项目内部字段。
7. `delta.value` 必须是有限数字。
8. `remove` 不带 `value`；其他写操作必须按契约带值。

格式救援只能做结构修复，例如：

- 去 Markdown 围栏；
- 从文本中找第一段完整 JSON 数组；
- 缺 `Analysis` 时补一段“模型未提供 Analysis”的占位说明。

不得猜测、补写或改变补丁内容。

### 12.3 JSON Pointer 转 MVU 命令

映射关系：

| JSON Patch | MVU 命令 |
|---|---|
| `replace /a/b value` | `_.set("a.b", value)` |
| `delta /a/b number` | `_.add("a.b", number)` |
| `insert /a/b value` | `_.insert("a", "b", value)` |
| `insert /a/- value` | `_.insert("a", value)` |
| `remove /a/b` | `_.delete("a", "b")` |
| `move from /a to /b` | `_.move("a", "b")` |

数字路径段变成数组下标；包含点号、方括号、引号或反斜杠的键使用 bracket + JSON 字符串形式，不能简单 `path.replaceAll('/', '.')`。

然后让 MVU 自己解析：

```javascript
const commands = patchToMvuCommands(updateTag);
const nextData = await Mvu.parseMessage(commands, baselineSnapshot);
if (!nextData) throw new Error('MVU 未解析出有效变量更新');
```

## 13. 消息文本与消息变量的双写

当前第二 API 更新成功后执行：

```javascript
const mergedMessage = replaceUpdateVariable(originalMessage, generatedTag);

await setChatMessages(
  [{ message_id: targetMessageId, message: mergedMessage }],
  { refresh: 'none' },
);

await Mvu.replaceMvuData(nextData, {
  type: 'message',
  message_id: targetMessageId,
});
```

双写的目的：

- 消息原文保留这次更新的可审计依据。
- 消息变量存真正供后续楼层继承的数据。
- 旧 `UpdateVariable` 被替换而不是无限追加，避免同一楼层出现多份冲突结果。

如果业务只需要脚本本地修改，可以直接克隆完整数据、修改 `stat_data` 并 `replaceMvuData`；但 AI 更新链路建议保留消息标签以便排查。

## 14. 确定性结算与 AI 结算的分层

Pastoral 把绝对可计算事实留给脚本，例如：

- 员工日薪总和；
- 建筑维护费总和；
- 资金扣除；
- 作物剩余天数减一；
- 每日浇水/养护标记重置；
- 设施引力求和。

AI 只负责需要理解剧情和语境的跨日变化。

推荐归寝时序：

```text
日常变量阶段（多 API 时）
  ↓
内存执行确定性结算，写 settlementId 防重复
  ↓
首次 MVU 写回，最多等待 3000ms
  ├─ 成功：继续
  └─ 超时/失败：记录，但继续归寝 AI
  ↓
归寝变量 API
  ↓
从最新快照重新锁定资金、农田等确定性事实
  ↓
最终 MVU 写回
```

首次写回不能无限阻塞第二 API。当前用 `Promise.race` 返回 `{ok, timedOut, error, pending}`；如果超时 Promise 后来完成，再补做一次事实锁定，以防迟到写覆盖最终结果。

`settlementId`（当前形如 `endday-message-${messageId}`）写入 MVU 元数据，用于防止同一日结按钮或重试重复扣费。

---

# 第三部分：第二 API

## 15. 配置模型

当前配置位于 localStorage 键 `mrfz_settings`：

```javascript
{
  apiMode: 'single' | 'multi',
  secondApi: {
    url: '',
    key: '',
    model: '',
    timeout: 30000,
    maxRetries: 3,
  },
  prompts: {
    normal: '',
    endday: '',
  },
  variablePresets: {
    normal: { /* 独立预设策略 */ },
    endday: { /* 独立预设策略 */ },
  },
}
```

规范化要求：

- URL trim，并只移除末尾多余 `/`。
- 用户填写到服务根或 `/v1`；若已写到 `/chat/completions`，给出明确提示。
- URL、Key、model 三项齐全才允许发第二 API。
- timeout 最低 1000ms。
- maxRetries 为非负整数。
- API Key 使用密码输入框，日志、事件、错误摘要中不得出现。

## 16. 第二 API 如何被调用

核心不是自行发送 HTTP，而是：

```javascript
await generateRaw({
  generation_id: 'project-second-1',
  user_input: prompt,
  should_stream: false,
  should_silence: true,
  max_chat_history: 0,
  custom_api: {
    apiurl: secondApi.url,
    key: secondApi.key,
    model: secondApi.model,
    source: 'openai',
  },
  ordered_prompts: ['user_input'],
});
```

或在需要酒馆当前/固定预设时把同一 `custom_api` 传给 `generate()`。

这带来的好处：

- 复用 TavernHelper 的端点兼容、生成 ID、事件和停止能力。
- 避免 iframe 自己处理不同服务的 `/chat/completions` 路径和跨域细节。
- `getModelList({apiurl, key})` 可直接做模型列表探测。

`source: 'openai'` 表示使用 OpenAI 兼容协议，不等于只能调用 OpenAI 官方服务。

## 17. 提示词组装

当前变量任务包含以下区块：

1. 身份与职责：变量计算引擎，不续写剧情。
2. 当前阶段：日常或归寝，明确互斥职责。
3. 本阶段更新指导：玩家自定义优先，留空使用内置规则。
4. 输出格式。
5. 最近三层正文；先剥离旧 `UpdateVariable`。
6. 主生成前的 `baseline.stat_data`。
7. 脚本已确定事实：不得重算。
8. 阶段执行事实：例如日常变量阶段失败，归寝不得猜测补算。
9. 可扩展附加上下文。
10. 唯一输出约束。

示意：

```javascript
function buildVariablePrompt({ kind, guide, history, baseline, calculated, stageFacts }) {
  return [
    '你是变量计算引擎，不续写剧情。',
    `【当前阶段：${kind === 'endday' ? '归寝日结' : '日常更新'}】`,
    `【本阶段变量更新指导】\n${guide}`,
    `【最近三层正文】\n${history || '（无）'}`,
    `【主生成前当前变量数据】\n${JSON.stringify(baseline.stat_data || {})}`,
    calculated ? `【脚本已确定事实（不得重算）】\n${JSON.stringify(calculated)}` : '',
    stageFacts ? `【阶段执行事实】\n${stageFacts}` : '',
    '【输出要求】只输出一个完整 UpdateVariable 标签。',
  ].filter(Boolean).join('\n\n');
}
```

### 为什么用主生成前 baseline

日常第二 API 的职责是替代或重算本轮主模型产生的变量变化。若以主模型更新后的最新状态为 baseline，再应用第二 API 补丁，可能把同一变化累计两次。当前普通阶段从发主请求前就捕获 baseline。

归寝阶段因前面已有确定性结算和可能的日常阶段，会按编排点重新取合适快照，并通过“脚本已确定事实”约束避免覆盖。

## 18. 重试与格式纠正

当前有两层循环：

```text
网络/服务重试：0..maxRetries
  └─ 每次尝试内部：
       第 1 次正常任务
       第 2 次仅纠正格式（不计入 maxRetries）
```

格式纠正提示应：

- 附上模型自己的上一次输出（限制长度）；
- 只解释格式，不重新发明业务规则；
- 仍从唯一 `user_input` 通道发送；
- 再次经过同一严格校验。

超时实现：

```javascript
Promise.race([
  Promise.resolve().then(requestFactory),
  timeoutPromise,
]);
```

超时时按 `generation_id` 调用 `stopGenerationById()`。注意：停止接口可能不存在或返回失败，因此结果仍要按超时处理，不能假设远端一定取消。

## 19. 结果应用

第二 API 的完整路径：

```text
文本结果
  ↓ textResult：接受 string 或 result.content；tool_calls 则报错
salvageUpdateVariable
  ↓
normalizeUpdateVariable
  ↓
patchToMvuCommands
  ↓
Mvu.parseMessage(commands, baseline)
  ↓
替换目标楼层 UpdateVariable 标签
  ↓
Mvu.replaceMvuData(parsed, 同一 message_id)
  ↓
必要时重算脚本派生值
```

多 API 模式失败时，当前策略是保留主模型结果、显示错误并允许手动重试；归寝第二 API 失败不应伪装成完整成功。

---

# 第四部分：预设模式与固定预设短事务

## 20. 三种预设模式

日常和归寝各保存一套：

```javascript
{
  mode: 'none' | 'current' | 'fixed',
  presetName: '',
  // 迁移推荐默认 false：不勾选“屏蔽深度注入”，让宿主正常注入深度条目和作者注释。
  blockDepthEntries: false,
  temperature: 0,
  context: {
    worldInfoBefore: false,
    personaDescription: false,
    charDescription: false,
    charPersonality: false,
    scenario: false,
    worldInfoAfter: false,
    dialogueExamples: false,
    chatHistory: false,
  },
}
```

行为：

| 模式 | 生成函数 | 预设来源 | 任务通道 |
|---|---|---|---|
| `none` | `generateRaw` | 不使用酒馆预设 | 仅 `user_input`，并在 `ordered_prompts` 末位引用 |
| `current` | `generate` | 当前 `in_use` | 仅 `user_input` |
| `fixed` | 临时切换后 `generate` | 指定主预设 | 仅 `user_input` |

生产路径应删除 `injects` 和 `preset_name`，确保任务只出现一次。

### 为什么不用 `injects`

项目实测中，不同 Windows/Termux 宿主对 `user_input + injects` 的消费不一致：一端可能得到两份任务，另一端可能忽略 inject。唯一 `user_input` 通道跨端更稳定。

### 为什么固定模式不只传 `preset_name`

类型定义虽支持 `generate({preset_name})`，但项目实测中它与“酒馆 UI 真实切换当前主预设”并非完全等价，尤其涉及异步收集提示词和不同宿主版本。当前采用真实短切换方案。

## 21. none 模式的上下文控制

`generateRaw` 的 `ordered_prompts` 只列勾选项，最后必须有 `user_input`：

```javascript
[
  'world_info_before',
  'char_description',
  'chat_history',
  'user_input',
]
```

未勾选的普通占位符可在 `overrides` 中清空，避免宿主带入没有选择的角色描述、场景等上下文。

### 深度注入与作者注释：默认沿用酒馆

当前 Pastoral 与迁移推荐均将 `blockDepthEntries` 默认设为 `false`。只有玩家主动勾选屏蔽后才会发送：

```javascript
overrides.chat_history = {
  with_depth_entries: false,
  author_note: '',
  prompts: [], // 未选择普通 chatHistory 时
};
```

跨宿主实测表明：**只有不勾选“屏蔽世界书按深度注入条目与作者注释”，相关内容才能按预期注入。** 默认配置为：

```javascript
const variablePresetDefaults = {
  blockDepthEntries: false,
};
```

即默认不生成 `with_depth_entries: false` 与 `author_note: ''` 这组覆盖，让 TavernHelper/酒馆按当前预设正常处理深度世界书条目和作者注释。只有当新项目已经通过请求检查确认这些内容会污染变量计算时，才由玩家主动勾选屏蔽。

注意区分两类开关：

1. `context.chatHistory` 控制普通聊天历史占位符是否参与 none 模式请求。
2. `blockDepthEntries` 控制深度注入条目和作者注释是否被强制关闭。

两者不是一回事；允许深度注入不等于必须发送普通聊天历史。不同 TavernHelper 版本对二者组合的实际组装可能不同，迁移后应以真实请求内容为准测试。

为保证变量计算可复现，当前还覆盖采样参数：

```javascript
{
  temperature: 0,
  frequency_penalty: 'unset',
  presence_penalty: 'unset',
  top_p: 'unset',
  top_k: 'unset',
}
```

## 22. 为什么必须同时保存“预设名称”和 `in_use` 现场

类型定义明确指出：

- `getLoadedPresetName()` 是 `in_use` 从哪个已保存预设加载而来。
- 玩家在 UI 中编辑预设后会立即改变 `in_use`，但未点击保存时，已保存预设内容不会同步改变。
- 如果只记住名称，切回时会丢失这些尚未保存的现场编辑。

因此固定事务开始时必须保存：

```javascript
const originalName = getLoadedPresetName();
const originalLive = structuredClone(getPreset('in_use'));
```

恢复时两步都做：

```javascript
loadPreset(originalName);
await replacePreset('in_use', originalLive, { render: 'none' });
```

`render: 'none'` 避免为了内部恢复额外刷新预设设置界面。

## 23. 固定预设的 1 秒 + 2 秒短事务

当前真实时序：

```text
进入本地事务锁
  ↓
读取 originalName
深拷贝 originalLive = getPreset('in_use')
  ↓
loadPreset(target)
  ↓ 等 1000ms（让酒馆提交预设切换）
generate({user_input, custom_api, ...})
  ↓ 保持 target 2000ms（让异步流水线捕获提示词）
loadPreset(originalName)
replacePreset('in_use', originalLive, {render:'none'})
  ↓
释放本地事务锁
  ↓
等待网络 Promise（锁外）
```

参考实现：

```javascript
let presetLaunchTail = Promise.resolve();
const PRESET_SETTLE_MS = 1000;
const PROMPT_CAPTURE_MS = 2000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchWithFixedPreset(targetPreset, generateConfig) {
  let responsePromise;

  const launch = async () => {
    const originalName = String(getLoadedPresetName() || '').trim();
    if (!originalName) throw new Error('无法确定当前加载预设');

    const originalLive = structuredClone(getPreset('in_use'));
    let switched = false;
    let launchError;

    try {
      if (!loadPreset(targetPreset)) {
        throw new Error(`切换目标预设“${targetPreset}”失败`);
      }
      switched = true;

      await delay(PRESET_SETTLE_MS);
      responsePromise = Promise.resolve(generate(generateConfig));
      await delay(PROMPT_CAPTURE_MS);
    } catch (error) {
      launchError = error;
    } finally {
      if (switched) {
        if (!loadPreset(originalName)) {
          throw new Error(`恢复原预设“${originalName}”失败`);
        }
        await replacePreset('in_use', originalLive, { render: 'none' });
      }
    }

    if (launchError) throw launchError;
  };

  const transaction = presetLaunchTail.then(launch, launch);
  presetLaunchTail = transaction.catch(() => {});

  return transaction
    .then(() => responsePromise)
    .then((networkResult) => networkResult);
}
```

### 为什么网络等待必须在锁外

如果把完整 API Promise 放在锁内：

- 一次 30 秒生成会阻塞之后所有变量请求；
- 超时模型会把预设锁长时间占住；
- 用户主剧情更容易在错误预设下启动。

当前锁只保护会修改全局预设的约 3 秒窗口。一旦提示词被捕获并恢复现场，多个网络请求可以并发等待。

### 为什么失败后要吞进 tail

```javascript
presetLaunchTail = transaction.catch(() => {});
```

调用者仍会收到本次失败，但串行链本身恢复为 fulfilled。否则第一次失败后，之后每个 `.then(launch)` 都可能沿用拒绝状态，形成永久死锁。

## 24. 固定预设迁移时的进一步加固

当前逻辑已经覆盖同步 `generate()` 异常时恢复，但通用版本建议把恢复拆得更强健：

```javascript
async function bestEffortRestore(originalName, originalLive) {
  const errors = [];

  try {
    if (!loadPreset(originalName)) errors.push(new Error('恢复预设名称失败'));
  } catch (error) {
    errors.push(error);
  }

  try {
    await replacePreset('in_use', originalLive, { render: 'none' });
  } catch (error) {
    errors.push(error);
  }

  if (errors.length) throw new AggregateError(errors, '预设现场未完全恢复');
}
```

还应：

- 切换前确认目标预设仍存在；不存在则降级 `none`。
- 把 1000/2000ms 做成可配置值并设置合理上下限。
- 在真实 Windows、Android/Termux、不同 TavernHelper 版本上跑契约测试。
- 事务期间避免其他脚本主动切换主预设；单个 Promise tail 只能协调本项目内部请求。
- 页面卸载/刷新无法保证异步 finally 完成，因此必要时在下一次初始化检测并提醒玩家检查当前预设。

## 25. 安全诊断

建议只发：

```javascript
{
  stage: 'normal' | 'endday',
  mode: 'none' | 'current' | 'fixed',
  targetPreset: '...',
  transport: 'generateRaw' | 'generate-current' | 'generate-switched',
  taskCount: 1,
  taskFingerprint: '8位哈希',
  switched: true,
  restored: true,
  tavernHelperVersion: '...',
  tavernVersion: '...',
}
```

不要记录：

- API Key；
- 完整提示词；
- 完整 MVU 快照；
- 角色卡私密上下文。

指纹用于判断两次请求任务是否相同，不用于安全签名。

---

# 第五部分：伪零层/伪同层

## 26. 概念

“伪零层”在当前源码中称 **伪同层**：

- 第 0 楼是唯一长期存活的 UI 宿主。
- 酒馆真实聊天仍正常增加第 1、2、3……楼。
- 父页面把原生非 0 楼视觉隐藏。
- 0 楼 iframe 自己读取 `0-last` 的全部真实消息并重绘成统一气泡流。
- 所有数据读写仍指向真实消息楼层，而不是把所有消息真的写进 0 楼。

所以它是**显示层虚拟化**，不是聊天记录扁平化，也不是 MVU 零层存储。

## 27. 唯一宿主判定

```javascript
function currentFloor() {
  try {
    return typeof getCurrentMessageId === 'function'
      ? getCurrentMessageId()
      : null;
  } catch {
    return null;
  }
}

const floor = currentFloor();
const inTavern = floor !== null;
const isHost = !inTavern || floor === 0;
```

- `floor === 0`：真实酒馆唯一宿主。
- `floor > 0`：本楼 iframe 自毁。
- `floor === null`：独立浏览器预览，保留 UI 并使用样例数据。

非宿主必须在其他模块初始化前停止：

```javascript
if (!isHost) {
  document.body.innerHTML = '';
  document.body.style.display = 'none';
  return;
}
```

因此构建顺序中 `host.js` 必须最先执行，`app.js` 初始化还应再次检查 `Host.isHost`，避免后续轮询器已经启动。

## 28. 父页面视觉接管

在同源父文档注入：

```css
#chat > .mes:not([mesid="0"]),
#chat > .mes:not([messageid="0"]):not([mesid]) {
  display: none !important;
}
```

当前版本特意保留：

- 0 楼消息外框；
- 0 楼名字条；
- 酒馆原生输入区；
- 原始聊天记录本身。

不要依据旧 `plan.md` 误以为当前仍隐藏原生输入区或完全“去壳”；测试以“保留原生输入区和 0 楼名字条”为准。

安全获取父文档：

```javascript
function parentDocumentOrNull() {
  try {
    if (window.parent === window) return null;
    const doc = window.parent.document;
    return doc?.body ? doc : null;
  } catch {
    return null;
  }
}
```

跨源或 sandbox iframe 下会降级：卡内 UI 仍能工作，但不能隐藏父页面其他楼层，也不能直接给当前 iframe 加沉浸样式。

## 29. 聚合真实对话

```javascript
function fetchAllMessages() {
  const last = getLastMessageId();
  const list = getChatMessages(`0-${last}`);
  return Array.isArray(list) ? list : [];
}
```

每个气泡保留：

```html
<article class="bubble" data-message-id="12">...</article>
```

编辑：

```javascript
await setChatMessages(
  [{ message_id: 12, message: newRawText }],
  { refresh: 'none' },
);
```

删除：

```javascript
await deleteChatMessages([12]);
```

0 楼必须禁止编辑和删除，否则会破坏承载整个应用的自包含卡片。

## 30. 主剧情发送与新 AI 楼确认

当前输入流程：

```text
/send 玩家文本
  ↓
/trigger await=true
  ↓
确认新 AI message_id
  ↓
第二 API/MVU 后处理
```

不能只相信单一生成结束事件。当前组合：

- `GENERATION_STARTED/ENDED/STOPPED` 维护生成状态；
- `MESSAGE_RECEIVED` 记录候选 ID；
- `/trigger await=true` 等待主调用；
- 结束后短轮询 `completedMessageId` 与 `getLastMessageId()`；
- 只接受 `id > beforeId` 且角色不是 user 的消息。

这能规避事件缺失、事件先后差异和结束事件不带消息 ID。

## 31. 轮询与重绘

当前对话每 400ms 轮询，Hash 为：

```text
消息数_最后一楼字符数_是否生成中
```

优点是便宜；缺点是同长度原地编辑可能不触发重绘。更通用的迁移实现建议：

```javascript
hash = `${count}_${lastId}_${hashText(lastMessage)}_${generating ? 1 : 0}`;
```

如果宿主提供可靠的消息新增/修改/删除事件，应以事件驱动为主、低频轮询为兜底。

0 楼自包含源码通常很长。当前单楼超过 60000 字符就显示折叠占位，避免把前端源码作为叙事正文塞入气泡。

## 32. 沉浸模式

当前只放大当前 iframe，不让整个父页面根节点进入全屏：

1. 找到 `contentWindow === window` 的 iframe。
2. 给该 iframe 加 `position: fixed; inset: 0; width/height: 100vw/100vh`。
3. 锁父页面 body 滚动。
4. 尝试对 iframe 调用 Fullscreen API。
5. 监听父文档 `fullscreenchange`，Esc 后同步移除类。

这与伪零层本身可分离迁移。

---

# 第六部分：推荐迁移步骤

## 33. 分阶段迁移

### 阶段 A：建立数据契约

- [ ] 定义新项目 `Schema`。
- [ ] 建立匹配的 `initvar.yaml`。
- [ ] 明确脚本确定性字段与 AI 语义字段。
- [ ] 定义 `UpdateVariable + JSONPatch` 允许操作和只读路径。

### 阶段 B：接入宿主适配层

- [ ] 探测消息、正则、MVU、生成、预设 API。
- [ ] 区分独立预览与酒馆运行。
- [ ] 为缺失能力提供明确错误或样例回退。

### 阶段 C：正文与对话

- [ ] 原文分离选项、变量标签和正文。
- [ ] 应用酒馆显示正则。
- [ ] 使用 Sanitizer + DOM 清壳。
- [ ] 按真实 `message_id` 渲染和操作。

### 阶段 D：MVU

- [ ] 等待 `Mvu` 初始化。
- [ ] 读取完整数据并深拷贝。
- [ ] UI 只消费 `stat_data`。
- [ ] 建立 JSON Patch 验证与 MVU 命令桥。
- [ ] 同楼双写消息标签和完整 MvuData。

### 阶段 E：第二 API

- [ ] 保存 URL/Key/model/timeout/retries。
- [ ] 使用 `custom_api` 路由。
- [ ] 冻结 normal/endday 阶段快照。
- [ ] 组装 baseline、历史、规则和确定事实。
- [ ] 实现超时、停止、重试和单次格式纠正。

### 阶段 F：预设

- [ ] 先实现 `none`，验证最小请求。
- [ ] 再实现 `current`。
- [ ] 最后实现 `fixed` 的保存/切换/延时/恢复/短锁。
- [ ] 在真实目标平台校准 1 秒 + 2 秒窗口。

### 阶段 G：伪零层

- [ ] 保证 0 楼唯一宿主最先执行。
- [ ] 非 0 楼不启动任何轮询或事件绑定。
- [ ] 同源时才接管父页面视觉。
- [ ] 所有写操作继续使用真实消息 ID。
- [ ] 保护 0 楼不可编辑删除。

---

## 34. 推荐模块边界

```text
host-adapter.js        全局 TavernHelper/MVU 能力包装
host-floor.js          0 楼宿主、父页面视觉、沉浸模式
message-store.js       消息读取、事件、轮询、真实 ID
content-extractor.js   原文分流、酒馆正则、HTML 清洗
mvu-store.js           完整快照、写回、超时、派生值
patch-codec.js         UpdateVariable/JSONPatch 校验与命令转换
variable-prompt.js     阶段规则与提示词组装
preset-transaction.js  none/current/fixed 与短事务锁
variable-engine.js     第二 API、重试、格式纠正、结果应用
settings.js            规范化与持久化
```

让 `variable-engine` 依赖接口而不是直接依赖 DOM，测试会容易很多。

---

# 第七部分：验证清单

## 35. 正文处理

- [ ] 无正文标签的纯文本可显示。
- [ ] `maintext/maintxt/content/story` 等不会被硬编码依赖。
- [ ] 酒馆正则能切除思维链和执行上下截断。
- [ ] 颜色/发光等内联美化保留。
- [ ] 布局 wrapper 被解包。
- [ ] 选项在正则前提取，且不会混入正文。
- [ ] 恶意事件属性和危险 URL 被 Sanitizer 移除。
- [ ] 超长 0 楼源码不会作为正文渲染。

## 36. MVU

- [ ] 初始化前不会读写。
- [ ] 读取的是最新真实楼，不是宿主 0 楼。
- [ ] baseline 是独立深拷贝。
- [ ] 写回完整 MvuData。
- [ ] 非法 JSON、未知操作、非法 Pointer、只读 `_` 路径均拒绝。
- [ ] 数组下标和包含特殊字符的键正确转换。
- [ ] 消息标签与消息变量写到同一 message_id。
- [ ] settlementId 能阻止重复确定性结算。
- [ ] 首次写回悬挂时归寝 API 仍会继续。
- [ ] 最终写回失败不会报告完整成功。

## 37. 第二 API

- [ ] URL/Key/model 不完整时不发送。
- [ ] Key 不进入提示词、日志或状态事件。
- [ ] `generation_id` 每次唯一。
- [ ] 超时会尝试停止对应请求。
- [ ] `maxRetries=2` 总计最多 3 次网络尝试。
- [ ] 每次网络尝试最多附带一次格式纠正。
- [ ] `tool_calls` 无正文时明确报错。
- [ ] 日常与归寝指导不串台。
- [ ] 主生成前 baseline 不被异步修改。

## 38. 固定预设

- [ ] 切换后 1 秒内不调用 generate。
- [ ] generate 发起后 2 秒内仍保持目标预设。
- [ ] 约 3 秒后恢复原预设名称。
- [ ] 未保存的 `in_use` 编辑也恢复。
- [ ] 同步 generate 异常时仍恢复。
- [ ] 第一个网络请求未完成时，第二个短事务仍可在前者恢复后启动。
- [ ] 两个网络 Promise 可在锁外并发等待。
- [ ] 目标预设被删除时降级 none。
- [ ] 请求中没有 `injects` 或重复任务。

## 39. 伪零层

- [ ] 0 楼保留并只初始化一次。
- [ ] 非 0 楼 iframe 清空且不启动轮询。
- [ ] 父页面只隐藏非 0 楼消息。
- [ ] 原生输入区是否保留符合新项目设计。
- [ ] 聚合流 message_id 与真实记录一致。
- [ ] 0 楼不能编辑删除。
- [ ] 跨源父文档访问失败时正常降级。
- [ ] 同长度消息编辑仍能刷新（若采用增强 Hash）。

---

# 第八部分：常见误区

## 40. 不要迁移的旧方案

以下内容在当前仓库可能仍以历史注释、导出函数或设计记录存在，但不是生产主路径：

1. **内部空白预设** `【Pastoral 内部】空白变量更新`：当前仅用于从预设列表过滤遗留项；none 模式直接走 `generateRaw`，不再创建该预设。
2. **`compilePreset()` 编译路径**：函数仍导出，但当前 `generateVariable()` 不调用它。
3. **compile/inject UI 选择**：已删除，旧缓存字段 `assembly` 在设置规范化时移除。
4. **`injects` 传任务**：因跨宿主不一致已弃用。
5. **只传 `preset_name` 实现固定预设**：当前改为真实短切主预设。
6. **旧 plan 中隐藏酒馆原生输入区、完全去掉 0 楼外壳**：当前代码和测试明确保留原生输入区及名字条。

## 41. 易错点汇总

- 把 `getCurrentMessageId()` 当 latest：伪零层下永远读到 0。
- 只克隆 `stat_data`：写回时丢 MVU 元数据。
- 直接执行模型给的 lodash：远程文本变成代码执行面。
- 网络 Promise 放进预设锁：所有后续请求排队几十秒。
- 只恢复预设名称：玩家未保存编辑丢失。
- 同时使用 `user_input` 和 `injects`：可能重复或丢任务。
- 把世界书深度注入等同于普通聊天历史：二者是独立通道；迁移项目默认不勾选屏蔽，并以真实请求检查确认注入是否正确。
- 用 `innerHTML` 但只删 `<script>`：仍存在多种 XSS 路径。
- 用 latest 写回异步结果：可能落到后来新增的错误楼层。
- 只依赖生成结束事件：不同宿主事件可能缺失或不带消息 ID。

---

## 42. 当前移动端与员工交互

- 手机进入沉浸/全屏且视口小于 900px 时，一次只显示经营页或剧情页，默认经营页；顶部页签可切换并退出全屏。
- 桌面沉浸保持左右双页，不受手机规则影响。
- 所有设备的员工卡都以摘要按钮呈现，点击展开五维、日薪、技能、心之宝石、描述和头像操作；展开状态按员工名保存并在 MVU 重绘后恢复。
- 页签和员工摘要使用原生按钮、ARIA 状态、44px 触控目标和可见焦点环。

## 43. 参考文件

### 当前实现

- `js/extract.js`
- `js/mvu.js`
- `js/api.js`
- `js/chat.js`
- `js/host.js`
- `js/settings.js`
- `js/rules.js`
- `本项目mvu文件.txt`
- `酒馆正文提取与处理指导文件 (1).txt`

### 类型契约

- `_types_split/04-chat-message.txt`
- `_types_split/06-generate.txt`
- `_types_split/09-preset.txt`
- `_types_split/14-events.txt`
- `_types_split/15-ejs-mvu.txt`

### 回归测试

- `test/api.js`
- `test/settings.js`
- `test/mvu.js`
- `test/staff.js`
- `test/smoke.js`
- `test/iframe.js`
- `test/layout.js`
- `test/rules.js`

### 设计背景（需与当前源码对照）

- `docs/specs/2026-08-01-model-lifecycle-and-preset-design.md`
- `docs/specs/2026-08-01-variable-request-assembly-design.md`
- `docs/superpowers/specs/2026-08-01-cross-platform-variable-settlement-design.md`
- `docs/superpowers/plans/2026-08-01-cross-platform-variable-settlement.md`

---

## 44. 一句话迁移原则

**把酒馆当宿主，把 0 楼当视图，把真实 message_id 当数据坐标，把完整 MvuData 当事务对象，把模型输出当不可信补丁，把固定预设切换当需要保存与回滚的短事务。**
