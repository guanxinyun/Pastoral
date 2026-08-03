# 手机滚动、强制第二 API 与只读零层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让手机内嵌和全屏状态下所有操作均可滑动到达，强制变量阶段使用第二 API，并保证第 0 层开局期间完全只读。

**Architecture:** 移动布局只设置一个触摸滚动所有者：普通内嵌由整本 `.book` 承载，全屏由当前可见 `.page` 承载；桌面保持现有内部面板/消息滚动。请求入口在执行 `/send` 前调用统一第二 API 配置校验，后续普通与归寝变量阶段只保留第二 API。Intro 直接渲染内置文本，不再跨越视图边界写宿主消息。

**Tech Stack:** 自包含 HTML、原生 CSS/JavaScript、SillyTavern/TavernHelper 全局 API、MVU、Node.js、JSDOM、Playwright MCP。

## Global Constraints

- 主剧情仍使用酒馆当前主 API；强制第二 API仅用于普通与归寝变量更新。
- 第二 API URL、Key、Model 缺失时必须在 `/send` 前阻止请求并保留输入。
- 第 0 层原消息不得被开局流程修改、删除或替换。
- 变量预设模式仅允许 `current` 和 `fixed`；旧 `none` 迁移为 `current`。
- 不提交现有无关删除项、MVU 文档、类型切片、规划日志、截图或 Playwright 临时文件。
- 每项生产改动必须先有失败测试，并实际观察 RED 与 GREEN。

---

### Task 1: 第 0 层只读开局

**Files:**
- Modify: `js/intro.js:228-365`
- Modify: `test/intro.js:12-160`
- Modify: `test/smoke.js:243-261`

**Interfaces:**
- Consumes: `Intro.detectEntry(): Promise<{mode,reason,floor}>`、`Intro.renderPrologue(decision)`。
- Produces: `Intro.start()` 在 floor 0 直接渲染序章；公开接口不再导出 `persistFloorZeroOpening`。

- [ ] **Step 1: 把开局测试改为只读契约**

在 `test/intro.js` 中删除延迟写回辅助，改为保留初始零层文本并断言：

```js
const originalFloorZero = '零层保留内容：供其他脚本使用';
const scene = load({ lastId: () => 0, inTavern: true, floorZero: originalFloorZero });
scene.win.Intro.init();
await scene.win.Intro.start();
const calls = scene.calls();
ok(calls.writeCalls === 0 && calls.deleteCalls === 0 && calls.slashCalls === 0 && calls.mvuWriteCalls === 0,
  '酒馆零层开局只渲染卡内序章，不写任何宿主数据');
ok(scene.floorZero() === originalFloorZero, '开局前后第 0 层原文逐字不变');
ok(!('persistFloorZeroOpening' in scene.win.Intro), '不再暴露零层覆盖接口');
```

在 `test/smoke.js` 的只有零楼场景将断言改为：

```js
ok(calls.set.length === 0, '强制序章不覆盖第 0 楼');
ok(chat[0].message === originalMessage, '第 0 楼原消息保持不变');
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `node test/intro.js && node test/smoke.js`

Expected: FAIL，旧实现仍调用 `setChatMessages` 且仍导出 `persistFloorZeroOpening`。

- [ ] **Step 3: 删除零层写回并直接渲染**

在 `js/intro.js` 删除 `persistFloorZeroOpening()`，将 `start()` 分支改为：

```js
if (decision.mode === 'prologue') renderPrologue(decision);
else { revealExperience(); ready = true; }
```

返回对象改为：

```js
return { OPENING_TEXT, OPENING_MESSAGE, chapters, detectEntry, init, start, renderPrologue, revealExperience, enterGame };
```

`OPENING_MESSAGE` 可继续作为兼容导出，但不能再传给宿主写入接口。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `node build.js && node test/intro.js && node test/smoke.js`

Expected: PASS，开局仍完整、零层写调用为 0。

- [ ] **Step 5: 提交并推送**

```bash
git add js/intro.js test/intro.js test/smoke.js index.html public/index.html
git commit -m "fix: keep floor zero opening read-only" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin HEAD:main
git push origin HEAD:feat/data-backend-engine
```

---

### Task 2: 强制第二 API 设置与预设迁移

**Files:**
- Modify: `js/settings.js:8-155`
- Modify: `js/app.js:146-241,310-426`
- Modify: `test/settings.js`
- Modify: `test/smoke.js:108-182`

**Interfaces:**
- Consumes: `Settings.load/save/normalize`。
- Produces: 不含 `apiMode` 的设置对象；`variablePresets[kind].mode` 仅为 `current | fixed`；`Settings.secondApiIssues(config): string[]`。

- [ ] **Step 1: 写设置迁移与 UI 失败测试**

在 `test/settings.js` 固化：

```js
const cfg = win.Settings.normalize({
  apiMode: 'single',
  variablePresets: { normal: { mode: 'none', context: { chatHistory: true } } }
});
ok(!Object.prototype.hasOwnProperty.call(cfg, 'apiMode'), '旧 API 模式字段迁移后删除');
ok(cfg.variablePresets.normal.mode === 'current', '旧 none 预设迁移为当前预设');
ok(!Object.prototype.hasOwnProperty.call(cfg.variablePresets.normal, 'context'), '删除无预设专属上下文缓存');
ok(win.Settings.secondApiIssues(cfg).length === 3, '空第二 API 明确报告 URL、Key、模型三项缺失');
```

在 `test/smoke.js` 设置 UI 断言：

```js
ok(!doc.querySelector('[name="apiMode"]'), '设置不再显示 API 模式');
ok(doc.querySelector('[name="secondApiUrl"]'), '接口页直接显示第二 API 参数');
ok(Array.from(normalMode.options).map(o => o.value).join(',') === 'current,fixed', '预设只保留当前与指定预设');
ok(!doc.querySelector('[data-preset-context]'), '不再显示无预设上下文开关');
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `node build.js && node test/settings.js && node test/smoke.js`

Expected: FAIL，仍存在 `apiMode`、`none` 和上下文 UI。

- [ ] **Step 3: 实现设置规范化与校验接口**

在 `js/settings.js`：

```js
const variablePresetDefaults = () => ({
  mode: 'current',
  presetName: '',
  blockDepthEntries: false,
  temperature: 0
});
```

`normalizeVariablePreset()`：

```js
preset.mode = preset.mode === 'fixed' ? 'fixed' : 'current';
delete preset.assembly;
delete preset.context;
```

`normalize()` 删除：

```js
delete cfg.apiMode;
```

新增：

```js
function secondApiIssues(config) {
  const api = object(config && config.secondApi);
  const issues = [];
  if (!String(api.url || '').trim()) issues.push('URL');
  if (!String(api.key || '').trim()) issues.push('API Key');
  if (!String(api.model || '').trim()) issues.push('模型');
  return issues;
}
```

`isSecondApiComplete()` 改为 `return secondApiIssues(config).length === 0` 并导出该函数。

- [ ] **Step 4: 精简设置 UI**

在 `js/app.js` 删除 `apiMode` select、`syncMode()` 与条件隐藏；接口页直接渲染 `apiBox`。保存仅写：

```js
Settings.save({ secondApi: { url, key, model, timeout, maxRetries } });
```

预设下拉只创建：

```js
h('option', { value: 'current' }, '沿用酒馆当前预设'),
h('option', { value: 'fixed' }, '指定自定义预设')
```

删除 `preset-context` 及八项 checkbox 的创建、同步和保存。保留固定预设、深度屏蔽、温度和阶段独立设置。

- [ ] **Step 5: 运行测试确认 GREEN**

Run: `node build.js && node test/settings.js && node test/smoke.js`

Expected: PASS。

- [ ] **Step 6: 提交并推送**

```bash
git add js/settings.js js/app.js test/settings.js test/smoke.js index.html public/index.html
git commit -m "refactor: require second API settings" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin HEAD:main
git push origin HEAD:feat/data-backend-engine
```

---

### Task 3: 发送前置校验与强制第二 API 流水线

**Files:**
- Modify: `js/chat.js:370-503`
- Modify: `js/api.js:450-663`
- Modify: `js/app.js:109-438`（设置页定位接口）
- Modify: `test/api.js`

**Interfaces:**
- Consumes: `Settings.secondApiIssues(config)`、`ApiEngine.processAfterMain(context)`、`ApiEngine.processEndday(context)`。
- Produces: `window.dispatchEvent(new CustomEvent('pastoral:open-settings', {detail:{page:'api',focus:'secondApiUrl|secondApiKey|secondApiModel'}}))`；所有变量阶段固定第二 API。

- [ ] **Step 1: 写发送前置校验与单次提交失败测试**

在 `test/api.js` 的 Chat 场景增加：

```js
win.Settings.load = () => ({ secondApi: { url: '', key: '', model: '' } });
input.value = '保留这段行动';
await win.Chat.handleUnifiedRequest(input.value);
ok(slashCalls.length === 0, '第二 API 配置缺失时不发送主剧情');
ok(input.value === '保留这段行动', '前置校验失败保留输入');
ok(openSettingsDetail.focus === 'secondApiUrl', '自动打开设置并聚焦首个缺失项');
```

完整配置下分别触发 click 和 Enter，使用两次独立场景断言每次均恰好：

```js
ok(commands.filter(c => c.startsWith('/send ')).length === 1, '只发送一次玩家行动');
ok(commands.filter(c => c === '/trigger await=true').length === 1, '只触发一次主模型');
```

Shift+Enter 断言 slash 调用为 0。

- [ ] **Step 2: 写强制第二 API 与无回退失败测试**

删除/改写单 API 测试，固定：

```js
ok(normalCalls === 1, '普通主回复后必调第二 API');
ok(enddayStages.join(',') === 'normal,settle,endday,enforce', '归寝固定走双阶段第二 API');
ok(rawCalls === 0, '变量阶段不存在主 API generateRaw 回退');
ok(!/callMainApiForDaily/.test(apiSource), '生产代码删除主 API 静默日结');
```

- [ ] **Step 3: 运行测试确认 RED**

Run: `node build.js && node test/api.js`

Expected: FAIL，缺配置仍可 `/send`，且单 API分支仍存在。

- [ ] **Step 4: 实现发送前置校验**

在 `js/chat.js#handleUnifiedRequest` 的 `busy`/宿主检查后、修改 `composedKind` 与 `setBusy(true)` 前加入：

```js
const config = Settings.load();
const issues = Settings.secondApiIssues(config);
if (issues.length) {
  const focus = !config.secondApi.url ? 'secondApiUrl' : (!config.secondApi.key ? 'secondApiKey' : 'secondApiModel');
  setRequestStatus('第二 API 未配置', '请先补全：' + issues.join('、'), false);
  toast('error', '无法发送', '必须先配置第二 API：' + issues.join('、'));
  window.dispatchEvent(new CustomEvent('pastoral:open-settings', { detail: { page: 'api', focus } }));
  return false;
}
```

`app.js` 监听事件，调用可复用的 `openSettings({page,focus})`；若设置已打开则切换到接口页，随后聚焦 `[name="..."]`。

- [ ] **Step 5: 删除 Chat 单 API 分支**

`mode` 变量删除。归寝总是先 `processAfterMain(... purpose:'normal')`，普通总是 `processAfterMain()`，归寝总是 `processEndday()`。状态文案固定“第二 API”。每日总结 `apiMode` 字段删除。

- [ ] **Step 6: 删除 ApiEngine 主 API 变量回退**

`callSecondApiForVariable()` 删除 `cfg.apiMode` 检查，只校验第二 API 参数。删除 `callMainApiForDaily()`、`appendDailyUpdate()` 和 `processEndday()` 的单 API分支；`processEndday()` 仅保留现有第二 API try/catch。

`generateVariable()` 删除 `none` 分支；`resolvePreset()` 将非 fixed 统一为 current；不再生产调用 `generateRaw`。

- [ ] **Step 7: 运行测试确认 GREEN**

Run: `node build.js && node test/api.js && node test/settings.js && node test/smoke.js`

Expected: PASS。

- [ ] **Step 8: 提交并推送**

```bash
git add js/chat.js js/api.js js/app.js test/api.js test/settings.js test/smoke.js index.html public/index.html
git commit -m "refactor: enforce second API variable updates" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin HEAD:main
git push origin HEAD:feat/data-backend-engine
```

---

### Task 4: 手机内嵌与全屏单一滚动所有者

**Files:**
- Modify: `css/layout.css:6-273,378-402,470-497`
- Modify: `js/app.js:15-80`
- Modify: `test/layout.js`
- Modify: `test/iframe.js`

**Interfaces:**
- Consumes: `Host.immersive`、body 的 `mobile-page--ledger|story`。
- Produces: 普通手机 `.book` 单一滚动；全屏手机当前 `.page` 单一滚动；`mobileScrollPositions = {ledger:number,story:number}`。

- [ ] **Step 1: 写移动滚动 CSS 契约失败测试**

在 `test/layout.js` 添加：

```js
ok(/body\.in-tavern\.in-tavern--dynamic\.is-game:not\(\.is-immersive\)\s+\.book\s*\{[^}]*height:\s*var\(--mobile-viewport-height[^}]*overflow-y:\s*auto[^}]*touch-action:\s*pan-y/.test(CSS),
  '手机普通内嵌由有界书本统一纵向滑动');
ok(/body\.in-tavern\.in-tavern--dynamic\.is-game:not\(\.is-immersive\)\s+\.panels[^}]*overflow:\s*visible/.test(CSS),
  '普通内嵌面板不抢触摸滚动');
ok(/body\.is-immersive\.mobile-page--(?:ledger|story)\s+\.page[^}]*overflow-y:\s*auto[^}]*touch-action:\s*pan-y/.test(CSS),
  '手机全屏由当前页面统一纵向滑动');
ok(/body\.is-immersive.*\.journal__stream[^}]*overflow:\s*visible/.test(CSS),
  '手机全屏消息流不形成嵌套滚动');
```

- [ ] **Step 2: 写切页滚动位置失败测试**

在 `test/iframe.js` 全屏场景：

```js
embeddedLeft.scrollTop = 120;
storyTab.click();
embeddedRight.scrollTop = 240;
ledgerTab.click();
ok(embeddedLeft.scrollTop === 120, '经营页切回后恢复滚动位置');
storyTab.click();
ok(embeddedRight.scrollTop === 240, '剧情页切回后恢复滚动位置');
```

同时断言普通内嵌书本可滚：通过模拟 `scrollHeight=1800/clientHeight=760` 并确认 `.book` 是唯一 `overflow-y:auto` 元素。

- [ ] **Step 3: 运行测试确认 RED**

Run: `node build.js && node test/layout.js && node test/iframe.js`

Expected: FAIL，普通内嵌为自然超长 book，当前页面仍 `overflow:hidden`。

- [ ] **Step 4: 实现普通内嵌整书滚动**

在移动动态非沉浸规则中：

```css
body.in-tavern.in-tavern--dynamic.is-game:not(.is-immersive) {
  height: var(--mobile-viewport-height, 100dvh);
  min-height: 0;
  overflow: hidden;
}
body.in-tavern.in-tavern--dynamic.is-game:not(.is-immersive) .book {
  height: var(--mobile-viewport-height, 100dvh);
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}
```

两张 `.page` 保持自然高度；该模式下 `.panels`、`.journal`、`.journal__stream` 使用 `overflow:visible; max-height:none`，确保全内容进入书本滚动高度。

- [ ] **Step 5: 实现全屏活动页滚动**

手机媒体查询内将活动 `.page` 设置为：

```css
body.is-immersive.mobile-page--ledger .page--left,
body.is-immersive.mobile-page--story .page--right {
  display: flex;
  flex: 1 1 auto;
  height: auto;
  min-height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}
```

全屏手机 `.panels`、`.journal`、`.journal__stream` 改为自然高度/`overflow:visible`。桌面规则不变。

- [ ] **Step 6: 保存并恢复页滚动位置**

`js/app.js` 添加：

```js
const mobileScrollPositions = { ledger: 0, story: 0 };
```

`setMobilePage()` 在隐藏旧页前保存旧页 `scrollTop`，显示新页后在下一帧恢复目标页 `scrollTop`。退出全屏时不丢失普通 book 自身滚动。

- [ ] **Step 7: 运行测试确认 GREEN**

Run: `node build.js && node test/layout.js && node test/iframe.js`

Expected: PASS。

- [ ] **Step 8: 提交并推送**

```bash
git add css/layout.css js/app.js test/layout.js test/iframe.js index.html public/index.html
git commit -m "fix: enable mobile book and page scrolling" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin HEAD:main
git push origin HEAD:feat/data-backend-engine
```

---

### Task 5: 清理发送框横线并完成真实运行验证

**Files:**
- Modify: `css/layout.css:628-646`
- Modify: `test/layout.js`
- Modify: `index.html`（构建生成）
- Modify: `public/index.html`（构建生成）

**Interfaces:**
- Consumes: 现有设计令牌。
- Produces: 无重复横线的 `.composer__input`。

- [ ] **Step 1: 写输入框视觉失败测试**

在 `test/layout.js`：

```js
ok(!/\.composer__input\s*\{[^}]*repeating-linear-gradient/.test(CSS), '发送输入框不再绘制横格线');
ok(/\.composer__input\s*\{[^}]*background:\s*var\(--color-surface-raised\)/.test(CSS), '发送输入框使用纯净令牌背景');
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `node build.js && node test/layout.js`

Expected: FAIL，当前仍使用 `repeating-linear-gradient`。

- [ ] **Step 3: 替换输入框背景**

将 `.composer__input` 的背景改为：

```css
background: var(--color-surface-raised);
```

保留现有边框、阴影、焦点、禁用与 transition。

- [ ] **Step 4: 运行自动验证**

Run:

```bash
npm test
node --check js/intro.js
node --check js/settings.js
node --check js/api.js
node --check js/chat.js
node --check js/app.js
cmp -s index.html public/index.html
git diff --check
```

Expected: 全部 exit 0；所有测试文件输出“全部通过”。

- [ ] **Step 5: 真实 SillyTavern 浏览器验证**

使用 Playwright 打开 `http://127.0.0.1:8000/` 并定位 Pastoral iframe：

1. 手机 390×760 普通内嵌：向下滑动整本书，依次点击全屏、设置、发送框和归寝。
2. 手机真正全屏：经营页滑到底部；切剧情页滑到发送框与归寝；切回确认滚动位置恢复。
3. 清空第二 API 配置，输入测试行动并点击发送：网络/slash 记录中不得出现 `/send` 或 `/trigger`，输入保留，设置接口页打开。
4. 恢复完整配置后只做非破坏性验证：使用测试桩或现有自动测试确认单次 slash；不要向用户真实聊天发送测试消息。
5. 点击标题进入序章前后读取第 0 层原文，确认完全一致。
6. 截图检查输入框无横格线且底部控件可见。

- [ ] **Step 6: 检查提交边界**

Run:

```bash
git status --short
git diff --stat
git diff -- css/layout.css js/intro.js js/settings.js js/api.js js/chat.js js/app.js test/intro.js test/settings.js test/api.js test/smoke.js test/layout.js test/iframe.js index.html public/index.html
```

只暂存本计划相关生产、测试和构建文件；明确排除 `task_plan.md`、`progress.md`、`findings.md`、参考资料、截图、`.playwright-mcp/`、类型切片和现有删除项。

- [ ] **Step 7: 最终提交并推送**

```bash
git add css/layout.css js/intro.js js/settings.js js/api.js js/chat.js js/app.js test/intro.js test/settings.js test/api.js test/smoke.js test/layout.js test/iframe.js index.html public/index.html
git diff --cached --check
git commit -m "fix: finalize mobile and second API flow" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin HEAD:main
git push origin HEAD:feat/data-backend-engine
```
