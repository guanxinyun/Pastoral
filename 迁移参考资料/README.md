# 酒馆 iframe 能力迁移手册

> 本文是一份可独立使用的实现蓝图。迁移时不需要 Pastoral 的 JavaScript、CSS、HTML、测试或历史设计稿；只需本文、目标项目自己的 MVU Schema/initvar，以及下列 TavernHelper 类型与命令切片。

## 0. 需要附带的接口切片

- `_types_split/04-chat-message.txt`：读取、修改、删除真实消息。
- `_types_split/06-generate.txt`：`generate`、`generateRaw`、`custom_api`。
- `_types_split/09-preset.txt`：当前预设、载入与替换。
- `_types_split/14-events.txt`：生成与消息生命周期事件。
- `_types_split/15-ejs-mvu.txt`：完整 `MvuData` 读写与解析。
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

## 10. 验收清单

### 消息与正文

- [ ] 原文、选项、变量标签先分流，显示正则只处理正文。
- [ ] 不可信 HTML 经过成熟 Sanitizer。
- [ ] 聚合气泡保留真实 `message_id`，0 楼不可编辑删除。

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

### 移动与本地资产

- [ ] VisualViewport 变化不会使输入框或快捷按钮漂移。
- [ ] 键盘打开隐藏状态/快捷栏，关闭后恢复。
- [ ] 上传格式、2 MiB、100 个上限和损坏图片均处理。
- [ ] 地图坐标、农田坐标、作物/种子共享和畜牧名称优先级正确。
- [ ] 清除站点数据会丢失个人图片的事实已告知玩家。

**迁移原则：把酒馆当宿主，把 0 楼当视图，把真实消息 ID 当数据坐标，把完整 MvuData 当事务对象，把模型文本当不可信补丁，把全局预设切换当需要保存与回滚的短事务。**
