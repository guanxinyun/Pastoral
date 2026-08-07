# 酒馆 iframe 能力迁移手册

> 本文是一份可独立使用的实现蓝图。迁移时不需要 Pastoral 的 JavaScript、CSS、HTML、测试或历史设计稿；只需本文、目标项目自己的 MVU Schema/initvar，以及下列 TavernHelper 类型与命令切片。

## 0. 需要附带的接口切片

- `_types_split/04-chat-message.txt`：读取、修改、删除真实消息。
- `_types_split/06-generate.txt`：`generate`、`generateRaw`、`custom_api`、`getModelList`、`stopGenerationById`。
- `_types_split/09-preset.txt`：当前预设、载入与替换。
- `_types_split/11-script-regex.txt`：`formatAsTavernRegexedString` 显示正则。
- `_types_split/14-events.txt`：生成与消息生命周期事件，以及 `eventOn`/`eventEmit`/`eventRemoveListener` 事件 API（文生图依赖）。
- `_types_split/15-ejs-mvu.txt`：完整 `MvuData` 读写与解析、`waitGlobalInitialized`。
- `_types_split/16-sillytavern.txt`：`executeSlashCommands` / `executeSlashCommandsWithOptions` 斜杠命令执行。
- `slash_command_split/INDEX.txt` 与包含 `/send`、`/trigger`、`/setinput` 的对应分片。

所有 TavernHelper 函数都是 iframe 中的全局函数，而不是 `window.TavernHelper.method()`。

---

## 1. 宿主接口

先把宿主全局收敛成适配器，让业务代码只依赖这一层：

```javascript
const Host = {
  currentMessageId: () => getCurrentMessageId(),
  lastMessageId: () => getLastMessageId(),
  messages: (range) => getChatMessages(range),
  setMessages: (updates) => setChatMessages(updates, { refresh: 'none' }),
  deleteMessages: (ids) => deleteChatMessages(ids),
  regexDisplay: (text, depth = 0) =>
    formatAsTavernRegexedString(text, 'ai_output', 'display', { depth }),
  generate: (config) => generate(config),
  generateRaw: (config) => generateRaw(config),
  loadedPreset: () => getLoadedPresetName(),
  preset: (name) => getPreset(name),
  loadPreset: (name) => loadPreset(name),
  replacePreset: (name, value) => replacePreset(name, value, { render: 'none' }),
};
```

启动时逐项探测消息、显示正则、生成、预设和 MVU 能力。某项缺失只禁用对应功能；不要用一个总开关让整个界面失效。

三个消息 ID 必须区分：

| 坐标 | 含义 | 用途 |
|---|---|---|
| `getCurrentMessageId()` | iframe 所在楼 | 判断唯一 0 楼宿主 |
| `getLastMessageId()` | 当前最新真实楼 | 最新显示状态 |
| 流程捕获的 `messageId` | 本次新 AI 楼 | 异步结果精确写回 |

驱动宿主用斜杠命令。`runSlash(cmd)` 优先调用 `executeSlashCommandsWithOptions(cmd)`，降级到 `executeSlashCommands(cmd)`（两者都是 TavernHelper 全局函数）。三条核心命令：`/setinput 文本` 填入原生输入框（`intend(text)` 即 `runSlash('/setinput ' + text)`）、`/send 文本` 写入玩家行动、`/trigger await=true` 触发生成。架构原则：前端**不本地改游戏状态**，所有玩家动作经 `/setinput` -> `/send` -> `/trigger` 交给 AI，状态只由 MVU 回写。

---

## 2. 正文提取

机器数据必须从原文提取，显示文本才经过酒馆正则：

```javascript
function rawMessage(messageId) {
  return getChatMessages(messageId)?.[0]?.message || '';
}

function extractOptions(raw) {
  const blocks = [...String(raw).matchAll(/<(options|choices|select)>([\s\S]*?)<\/\1>/gi)];
  if (blocks.length) return blocks.at(-1)[2].split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return [...String(raw).matchAll(/<(option|choice)>([\s\S]*?)<\/\1>/gi)]
    .map(match => match[2].trim()).filter(Boolean);
}

function stripMachinePayload(raw) {
  return String(raw || '')
    .replace(/<(options|choices|select)>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(option|choice)>[\s\S]*?<\/\1>/gi, '')
    .replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/gi, '');
}

function displayHtml(raw) {
  const formatted = formatAsTavernRegexedString(
    stripMachinePayload(raw), 'ai_output', 'display', { depth: 0 }
  );
  const root = document.createElement('div');
  root.innerHTML = formatted;
  root.querySelectorAll('script,style,link,iframe,object,embed,form').forEach(node => node.remove());
  // 生产项目应在这里使用成熟 HTML Sanitizer 清除事件属性、危险 URL 与 SVG 风险。
  return root.innerHTML.trim();
}
```

不要用正则代替 HTML Sanitizer。清壳时只解包明确的布局容器；带颜色、发光、字体或语义文本的元素应保留。

---

## 3. MVU 完整快照

MVU 事务对象是完整 `MvuData`，UI 才只消费 `stat_data`：

```javascript
let mvuApi;
let lastValid = null;

const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

const valid = data => data && typeof data === 'object'
  && !Array.isArray(data)
  && data.stat_data && typeof data.stat_data === 'object'
  && Object.keys(data.stat_data).length > 0;

async function initMvu() {
  const initialized = await waitGlobalInitialized('Mvu');
  mvuApi = globalThis.Mvu || initialized;
  if (!mvuApi || typeof mvuApi.getMvuData !== 'function'
      || typeof mvuApi.replaceMvuData !== 'function') {
    throw new Error('MVU 未暴露完整读写接口');
  }
}

function latestMvuSnapshot() {
  const latest = getLastMessageId();
  const current = mvuApi.getMvuData({ type: 'message', message_id: latest });
  if (valid(current)) lastValid = clone(current);
  if (lastValid) return clone(lastValid);
  for (let id = latest - 1; id >= 0; id--) {
    try {
      const older = mvuApi.getMvuData({ type: 'message', message_id: id });
      if (valid(older)) return clone(lastValid = clone(older));
    } catch (_) { /* 继续更早楼层 */ }
  }
  return { stat_data: {} };
}
```

回退只用于显示，不能把旧快照写入新楼。异步流程开始时捕获目标 `messageId`，结束后仍写该 ID，不重新取 latest。

---

## 4. 补丁验证

模型只输出声明式补丁，绝不能直接执行模型生成的 lodash/JavaScript。推荐协议：

```html
<UpdateVariable>
  <Analysis>简短说明</Analysis>
  <JSONPatch>[{"op":"delta","path":"/资金","value":-30}]</JSONPatch>
</UpdateVariable>
```

最小验证器：

```javascript
const OPS = new Set(['replace', 'delta', 'insert', 'remove', 'move']);
function pointerParts(pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) throw new Error('非法 JSON Pointer');
  return pointer.slice(1).split('/').map(part => {
    if (/~(?![01])/u.test(part)) throw new Error('非法 Pointer 转义');
    const value = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (value.startsWith('_')) throw new Error('禁止写内部字段');
    return value;
  });
}
function validatePatch(list) {
  if (!Array.isArray(list)) throw new Error('JSONPatch 必须是数组');
  return list.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !OPS.has(item.op)) throw new Error('未知补丁操作');
    pointerParts(item.path);
    if (item.op === 'move') pointerParts(item.from);
    if (item.op === 'delta' && !Number.isFinite(item.value)) throw new Error('delta 必须是有限数字');
    if (item.op === 'remove' && 'value' in item) throw new Error('remove 不接受 value');
    return item;
  });
}
```

将 Pointer 段安全编码成 MVU 命令路径，再交给 `Mvu.parseMessage(commands, baseline)`。包含点号、括号、引号或反斜杠的键必须使用 bracket + JSON 字符串，不能简单替换 `/` 为 `.`。

应用结果时双写同一真实楼：先替换该楼原文中的 `UpdateVariable` 标签，再 `replaceMvuData(nextData, {type:'message', message_id:targetId})`。

---

## 5. 第二 API

不需要 iframe 自行 `fetch`。通过 TavernHelper 的 `custom_api` 路由 OpenAI 兼容端点：

```javascript
async function requestVariable({ id, prompt, api }) {
  return generateRaw({
    generation_id: id,
    user_input: prompt,
    should_stream: false,
    should_silence: true,
    max_chat_history: 0,
    ordered_prompts: ['user_input'],
    custom_api: { apiurl: api.url, key: api.key, model: api.model, source: 'openai' },
  });
}
```

提示词应明确：阶段（日常或归寝）、本阶段指导、最近正文、主生成前完整 baseline 的 `stat_data`、脚本已确定事实、唯一输出格式。日常阶段使用主生成前 baseline，避免把主模型变化累计两次。

每次网络尝试最多做一次格式纠正；`maxRetries=N` 表示总网络尝试最多 `N+1` 次。超时按唯一 `generation_id` 尝试 `stopGenerationById`，但停止失败仍按超时处理。API Key 不进入提示词、日志或状态事件。

`generate` / `generateRaw` 的返回可能是 `string`，也可能是 `{ content, tool_calls }`。变量任务需要纯文本：`typeof result === 'string'` 直接用；`result.content` 为字符串则取它；只有 `tool_calls` 而没有正文时明确抛错（"目标模型返回了 tool_calls 而不是文本"），不要把 tool_calls 当正文或退化成"空响应"这类无用错误。连接测试用辅助接口 `getModelList({ apiurl, key })`，返回模型名字符串数组；当前酒馆版本不提供该函数时抛错，Key 同样不进日志。

---

## 6. 固定预设

固定模式必须真实短切主预设，并同时保存当前名称和玩家尚未保存的 `in_use` 现场：

```javascript
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let presetTail = Promise.resolve();

function launchWithFixedPreset(targetName, generateConfig) {
  let network;
  const transaction = async () => {
    const originalName = getLoadedPresetName();
    const originalLive = structuredClone(getPreset('in_use'));
    let switched = false;
    try {
      if (!loadPreset(targetName)) throw new Error('目标预设不存在');
      switched = true;
      await delay(1000);
      network = Promise.resolve(generate(generateConfig));
      await delay(2000);
    } finally {
      if (switched) {
        if (!loadPreset(originalName)) throw new Error('恢复原预设名称失败');
        await replacePreset('in_use', originalLive, { render: 'none' });
      }
    }
  };
  const launched = presetTail.then(transaction, transaction);
  presetTail = launched.catch(() => {});
  return launched.then(() => network);
}
```

锁只覆盖约 3 秒的全局预设切换/捕获窗口；网络 Promise 必须在锁外等待。任务只通过 `user_input` 发送一次，不同时使用 `injects`。

### 深度注入与作者注释

迁移推荐默认 `blockDepthEntries: false`，即设置页默认**不勾选**"屏蔽世界书按深度注入条目与作者注释"。只有显式 `true` 才生成覆盖：

```javascript
// 仅 blockDepthEntries === true 时发送
{ chat_history: { with_depth_entries: false, author_note: '' } }
```

`chatHistory`（none 模式 `ordered_prompts` 是否加入 `chat_history`）与 `blockDepthEntries`（是否强制关闭深度世界书条目和作者注释）是两个独立开关，不要混用。跨宿主实测表明不勾选时深度条目和作者注释更可能按预期注入；只有确认污染变量任务后才允许玩家主动勾选屏蔽。最终行为必须在目标设备上用真实请求内容核验。旧设置首次加载迁移到版本 2 并采用 `false` 默认。

---

## 7. 伪零层

伪零层是显示虚拟化，不是把数据真的塞进 0 楼：

```javascript
const floor = (() => { try { return getCurrentMessageId(); } catch (_) { return null; } })();
const isHost = floor === null || floor === 0;
if (!isHost) {
  document.body.replaceChildren();
  document.body.style.display = 'none';
  throw new Error('NON_HOST_STOP'); // 实际打包时应在最外层函数 return
}

function allMessages() {
  const last = getLastMessageId();
  return getChatMessages(`0-${last}`) || [];
}
```

同源时父页只隐藏非 0 楼视觉；原始聊天记录仍存在。聚合气泡保留 `data-message-id`，编辑/删除始终使用真实 ID，0 楼禁止编辑删除。跨源访问父文档失败时只放弃视觉接管，不影响卡内 UI。

主剧情推荐 `/send 文本` 后 `/trigger await=true`，结合消息事件与短轮询确认 `id > beforeId` 的新 AI 楼；不能只依赖单一“生成结束”事件。

重绘去重用轻量哈希：`hashOf(list) = 消息数 + '_' + 最后一楼字符数 + '_' + (生成中 ? 1 : 0)`，与上次相同就跳过 DOM 重绘。注意它比较的是末楼**字符数**而非内容，所以同长度编辑不会触发刷新——编辑、发送、触发等动作必须显式把 `lastHash` 置 `null` 来强制下次重绘。新楼确认一律用 `id > beforeId`，不要用消息数或长度比较。

---

## 8. 移动视口

软键盘出现后 `100vh` 往往仍代表布局视口。使用 VisualViewport 驱动 CSS 变量，并保持输入框在正常 flex/grid 流中：

```javascript
let frame = 0;
function syncViewport() {
  frame = 0;
  const vv = visualViewport;
  const height = vv?.height || innerHeight;
  document.documentElement.style.setProperty('--mobile-viewport-height', `${Math.round(height)}px`);
  const focused = document.activeElement?.matches('textarea,input');
  const keyboard = focused && innerHeight - height > Math.max(120, innerHeight * 0.18);
  document.body.classList.toggle('is-mobile-keyboard-open', keyboard);
}
function queueSync() {
  if (!frame) frame = requestAnimationFrame(syncViewport);
}
visualViewport?.addEventListener('resize', queueSync);
visualViewport?.addEventListener('scroll', queueSync);
addEventListener('resize', queueSync);
```

```css
.mobile-immersive {
  height: 100vh;
  height: 100dvh;
  height: var(--mobile-viewport-height, 100dvh);
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-bottom: env(safe-area-inset-bottom);
}
.story { flex: 1; min-height: 0; overflow: auto; }
.composer { flex: 0 0 auto; position: static; }
.is-mobile-keyboard-open .status-and-actions { display: none; }
```

HUD、正文、输入框、状态栏和快捷按钮必须是明确的行；不要让 dock 任意换行，也不要用 fixed/absolute 追踪键盘。键盘展开时隐藏状态/快捷栏，只保留紧凑 HUD、正文、输入框和发送按钮。

---

## 9. 本地图片

图片 Blob 与目标绑定都放 IndexedDB；MVU 只保存游戏数据。SVG 作为 Blob URL 传给 `<img>`，不把上传源码注入 DOM：

```javascript
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
function validIcon(file) {
  return file && ALLOWED.has(file.type) && file.size <= 2 * 1024 * 1024;
}
async function renderCustomIcon(blob, container, fallbackHtml) {
  container.innerHTML = fallbackHtml;
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const img = document.createElement('img');
  img.alt = '';
  img.src = url;
  img.style.cssText = 'width:100%;height:100%;object-fit:contain';
  img.onerror = () => { URL.revokeObjectURL(url); container.innerHTML = fallbackHtml; };
  container.replaceChildren(img);
}
```

推荐绑定优先级：

```text
地图：map:x,y > map-name:名称 > 类型预设
农田：farm:normal|magic:x,y > crop:作物名 > 状态/农田类型预设
种子：crop:种子/作物名（与同名已种作物共享）
畜牧：livestock:条目名
```

右键或 550ms 长按打开选择器；移动超过 12px、滚动或 pointer cancel 时取消。删除图片时先统计并删除所有引用，再让目标回退下一优先级。IndexedDB 不可用时继续提供系统预设。

---

## 10. 图标系统

全站图标是 `icons.js` 里的 `ICONS` 字典，不是外部图片文件。每项是 SVG 路径片段（`viewBox="0 0 24 24"`、`stroke=currentColor`、手绘线稿风格），通过 `Icon.render` 扫描注入：

```javascript
const Icon = {
  get(name) {
    const m = ICONS[name] || ICONS.sparkle; // 未知名称回退 sparkle
    return `<svg viewBox="0 0 24 24" class="icon-fill" aria-hidden="true" focusable="false">${m}</svg>`;
  },
  render(root = document) {
    root.querySelectorAll('[data-i]').forEach((el) => {
      el.innerHTML = Icon.get(el.dataset.i);
    });
  },
  set(el, name) { el.dataset.i = name; el.innerHTML = Icon.get(name); },
};
```

HTML 里只写占位 `<span class="ic" data-i="paintbrush"></span>`，初始化和每次动态插入 DOM 后都要调用 `Icon.render(container)`。`stroke=currentColor` 让颜色继承 CSS；`.icon-fill` 在父级 `:hover` 时触发墨水填充。运行时新建的按钮（文生图占位、LLM 生图按钮等）必须在挂载后补一次 `Icon.render`，否则占位空白。迁移时要么照搬 `ICONS` 字典与扫描器，要么换用自己的图标体系但保留 `data-i` 契约，否则按钮旁的图标会整片丢失。

---

## 11. 沉浸模式

`Host.setImmersive(on)` 是宿主显示模式开关，影响 iframe、父文档和原生全屏三层：

```javascript
function setImmersive(on) {
  immersive = !!on;
  const frame = selfFrame();      // iframe 自身
  const d = parentDoc();           // 同源父文档，跨源为 null
  if (frame) frame.classList.toggle('pastoral-immersive', immersive);
  if (d && d.body) d.body.classList.toggle('pastoral-immersive-lock', immersive);
  document.documentElement.classList.toggle('is-immersive', immersive);
  document.body.classList.toggle('is-immersive', immersive);
  immersive ? requestNativeFullscreen() : exitNativeFullscreen();
  window.dispatchEvent(new CustomEvent('pastoral:immersive', { detail: { on: immersive } }));
  return immersive;
}
```

要点：

- 原生全屏只请求 iframe 自身（`frame.requestFullscreen()`），不让父页面根节点进全屏，避免楼层边框一起放大。
- 全屏需要用户手势且 iframe 需 `allowfullscreen`；失败时 `position:fixed` 钉满仍作为降级，不能让 UI 卡死。
- 父文档 `pastoral-immersive-lock` 锁住父滚动条，需要同源访问；跨源时 `parentDoc()` 返回 null，只降级到卡内样式。
- 外部 Esc 退出原生全屏时，`fullscreenchange` 监听同步收起钉满状态，避免状态错位。
- `pastoral:immersive` 事件供其他模块联动：文生图楼层伪装触发 st-chatu8 面板前临时退出沉浸，面板关闭后再恢复原状态。

移动端默认经营页、可切经营/剧情；桌面端沉浸仍双页等分。沉浸不是数据状态，重绘后不自动恢复，需由调用方或持久化决定。

---

## 12. 文生图

文生图依赖酒馆"前端助手"扩展的事件系统（`eventOn` / `eventEmit` / `eventRemoveListener` 全局函数），**不是** TavernHelper。三套互补入口共享同一事件契约：

```javascript
// 请求（emit）
eventEmit('generate-image-request', { id: requestId, prompt, width: null, height: null });
// 响应（listen，按 id 匹配后立即移除）
eventOn('generate-image-response', handler);
// handler 收到 { id, success, imageData, error }
```

`imageData` 可能是裸 base64、data URI 或 http/blob URL，统一用 `toDataUri` 嗅探前缀：`/9j/`→jpeg、`UklGR`→webp、`R0lGO`→gif、其余→png。每次请求唯一 `id`（`pastoral-img-<ts>-<n>` 或 `pastoral-auto-<ts>-<n>`），响应按 `id` 匹配；超时必须移除监听并清 loading。

### 手动绘图（ImageGen）

dock 按钮，从最新一条 AI 楼提取 prompt：优先 `<image>...</image>` 标签内容，否则取清洗后正文的纯文本，截断到 500 字。60 秒超时。结果注入对应气泡 body 并挂灯箱。图片按 `message_id` 存内存缓存，`pastoral:chat` 重绘后重新注入。主模型生成中（`Chat.generating || Chat.busy`）禁止绘图。

### 自动占位绘图（ImageAutoGen）

正文提取阶段调用 `extractAndReplace(raw, messageId)`：找出全部 `<image>...</image>`，每个替换为 `<span data-imgslot="slotId">` 占位并注册 prompt。`slotId = fnv32(messageId + '#' + idx + '#' + prompt)`，FNV-1a 哈希保证重绘后稳定。占位处默认显示"生成图片"按钮，点击先查 IndexedDB 缓存（store 名 `ImageCache`，上限 200 条 LRU 清理），未命中再发请求。90 秒超时，失败显示错误 + 重试。图片只存缓存，不写回消息原文或 MVU。

```javascript
function extractAndReplace(rawText, messageId) {
  const RE = /<image>([\s\S]*?)<\/image>/gi;
  // 从后往前替换 <image> 标签为 <span data-imgslot> 占位，避免偏移错位
  // slotId = fnv32(messageId + '#' + idx + '#' + prompt)，注册到 promptRegistry 等玩家点击
}
```

### LLM 生图（楼层伪装触发 st-chatu8）

每条 AI 气泡底部内联"LLM生图"按钮（在 `chat.js` 渲染气泡时直接挂载，不依赖后续注入）。点击 `triggerFloorLLMImageGen(messageId)`：

1. 在父文档找 `div.mes[mesid="messageId"] .mes_text`（Host CSS 隐藏了非 0 楼，但 DOM 仍在）。
2. 临时取消隐藏并定位到视口中央：`display:block; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); opacity:0; pointer-events:none; z-index:-1; max-height:1px; overflow:hidden`，让 `getBoundingClientRect` 返回有效坐标。
3. 桌面端派发 `dblclick`；移动端派发 3 次 `touchstart`+`touchend`、间隔 50ms（st-chatu8 要求 `0 < timeSinceLastTap < 350ms`）。坐标无效时回退到视口中央。
4. 轮询 `.st-chatu8-click-trigger-bubble`（最多 2 秒），出现后 `Host.setImmersive(false)` 退出沉浸让面板可见；不自动点击，交给玩家操作。
5. 面板关闭后再轮询（最多 30 秒），恢复沉浸模式并 2 秒后清除临时样式。

约束：

- 三套入口都只在 `hasEventApi()` 为真（酒馆环境）时显示；LLM 生图还要求父文档可访问。
- 图片是纯显示资产，清除站点数据会丢失；IndexedDB 不可用时自动占位退化为每次重生成，不阻断。
- 不要把 prompt、imageData 写进 MVU、消息原文或日志。
- 反馈统一走 `toast(type, title, msg)`（type 为 info/success/warn/error），不用 `alert`。

---

## 13. 构建产物

部署产物是单个自包含 `index.html`：所有 `js/*.js` 与 CSS 内联，无 CDN 或运行时外部文件依赖。`test/build.js` 校验：

- 根目录 `index.html` 与 Vercel 输出目录 `public/index.html` 都已生成；
- 两者逐字节相同。

```javascript
ok(fs.existsSync(rootOutput), '根目录 index.html 已生成');
ok(fs.existsSync(publicOutput), 'Vercel 输出目录 public/index.html 已生成');
ok(publicHtml === rootHtml, '根目录与 Vercel 构建产物完全一致');
```

迁移时保留单文件内联打包方式：不要为卡片引入运行时外部 JS/CSS 依赖；发布前跑构建测试，确认根目录与 `public/` 产物一致后再部署。

---

## 14. 验收清单

### 消息与正文

- [ ] 原文、选项、变量标签先分流，显示正则只处理正文。
- [ ] 不可信 HTML 经过成熟 Sanitizer。
- [ ] 聚合气泡保留真实 `message_id`，0 楼不可编辑删除。
- [ ] 重绘哈希比较末楼字符数，编辑/发送/触发显式置 `lastHash=null` 强制刷新；新楼用 `id > beforeId` 确认。

### MVU 与补丁

- [ ] 初始化后才读写，读写完整 `MvuData` 并深拷贝。
- [ ] 最新楼未初始化时只做显示回退，不写旧状态到新楼。
- [ ] 补丁操作、Pointer、内部字段和数值均严格验证。
- [ ] 消息原文与 MVU 写到同一流程捕获 ID。

### 生成与预设

- [ ] 第二 API 只通过 `custom_api`，Key 不进入日志。
- [ ] 主生成前 baseline 不被异步修改。
- [ ] 固定预设等待 1 秒、捕获 2 秒，并恢复名称和 `in_use`。
- [ ] 网络等待不占预设事务锁，任务只发送一次。
- [ ] `generate`/`generateRaw` 返回 `tool_calls`-only 时判失败；`getModelList` 不可用时抛错。
- [ ] `blockDepthEntries` 默认 `false`，与 `chatHistory` 独立；只有 `true` 才发深度覆盖。
- [ ] 斜杠命令经 `executeSlashCommandsWithOptions`/`executeSlashCommands` 执行；玩家动作走 `/setinput`->`/send`->`/trigger`，前端不本地改状态。

### 移动与本地资产

- [ ] VisualViewport 变化不会使输入框或快捷按钮漂移。
- [ ] 键盘打开隐藏状态/快捷栏，关闭后恢复。
- [ ] 上传格式、2 MiB、100 个上限和损坏图片均处理。
- [ ] 地图坐标、农田坐标、作物/种子共享和畜牧名称优先级正确。
- [ ] 清除站点数据会丢失个人图片的事实已告知玩家。

### 图标与沉浸

- [ ] `Icon.render` 在初始化和每次动态插入 DOM 后都调用，无空白 `data-i` 占位。
- [ ] 沉浸模式只全屏 iframe 自身，失败时降级 `position:fixed` 不卡死。
- [ ] 跨源父文档访问失败时沉浸只降级到卡内样式，不报错。
- [ ] 外部 Esc 退出全屏能同步收起沉浸状态。
- [ ] 临时退出沉浸（如 LLM 生图）在面板关闭后恢复原状态。

### 文生图

- [ ] 仅酒馆环境且事件 API 可用时显示入口；LLM 生图额外要求父文档可访问。
- [ ] 主模型生成中禁止手动绘图。
- [ ] 请求 `id` 唯一，响应按 `id` 匹配后立即移除监听；超时清 loading。
- [ ] `<image>` 占位 slotId 跨重绘稳定，IndexedDB 缓存命中不重复生成。
- [ ] 楼层伪装临时样式在面板关闭后清除，沉浸状态恢复。
- [ ] 图片、prompt 不写回消息原文、MVU 或日志；缓存丢失有降级。

### 构建产物

- [ ] 单文件内联 `index.html`，无运行时外部依赖。
- [ ] 根目录与 `public/` 产物逐字节一致后才部署。

**迁移原则：把酒馆当宿主，把 0 楼当视图，把真实消息 ID 当数据坐标，把完整 MvuData 当事务对象，把模型文本当不可信补丁，把全局预设切换当需要保存与回滚的短事务。**
