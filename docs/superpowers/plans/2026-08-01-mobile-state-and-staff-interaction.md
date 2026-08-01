# Mobile State and Staff Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make depth-entry blocking opt-in, preserve the latest valid MVU state while a new floor is uninitialized, provide a ledger-first one-page mobile immersive view, and make staff details expandable on every device.

**Architecture:** Keep each concern in its existing module: settings owns versioned persistence, MVU owns full-data fallback and caching, app/template/layout own mobile page navigation, and render/components own staff disclosure state. Use TDD per concern, then perform one guarded build only after recording the pre-existing output state so the task does not accidentally absorb unrelated working-tree changes.

**Tech Stack:** Vanilla JavaScript, HTML, CSS, TavernHelper globals, MVU globals, jsdom 29.1.1, Node.js test scripts, Git.

## Global Constraints

- `blockDepthEntries` defaults to `false`; only strict boolean `true` blocks depth entries and author notes.
- Existing settings are migrated once with `variablePresetSettingsVersion: 2`; unknown fields remain intact.
- A missing/empty latest-floor `stat_data` must display the nearest previous valid complete `MvuData`, never write that old state into the new floor, and only use `SAMPLE_STATE` when no valid live floor exists.
- Mobile one-page mode applies only when immersive and viewport width is below 900px; it defaults to the ledger page on every immersive entry.
- Desktop immersive mode remains a two-page 50/50 layout.
- Staff cards are expandable on all devices, use native buttons and ARIA, and preserve each employee's expanded state across MVU-driven rerenders.
- No new runtime dependencies.
- Do not stage or commit the user's pre-existing deletions, reference slices, MVU source document changes, `.playwright-mcp/`, planning files, migration reference folder, or any unrelated untracked files.
- `index.html` is already deleted in the working tree before implementation. Record its status before building; the final build intentionally regenerates it as this project's required tracked bundle, but only after all source tests pass and only if the user still wants a runnable bundle.
- Never commit API keys or complete prompt/MVU snapshots.

---

## File Structure

### Files modified

- `js/settings.js` — version-2 settings migration, strict false-by-default depth blocking.
- `js/api.js` — separate ordinary chat-history clearing from depth-entry/author-note blocking.
- `js/app.js` — preset checkbox copy, mobile page state and navigation.
- `js/mvu.js` — valid complete-MVU detection, cache, backward floor lookup, cache refresh after writes.
- `src/template.html` — accessible mobile immersive page switcher.
- `css/layout.css` — mobile immersive one-page viewport and safe-area layout.
- `css/components.css` — staff disclosure visuals and transitions.
- `js/render.js` — all-device staff summary/detail disclosure and stable expanded-state set.
- `test/settings.js` — migration and strict boolean tests.
- `test/api.js` — override behavior tests.
- `test/smoke.js` — settings UI default/persistence and live MVU fallback integration.
- `test/layout.js` — desktop two-page and mobile one-page CSS assertions.
- `test/iframe.js` — mobile immersive switcher behavior.
- `test/assets.js` — staff disclosure/static interaction assertions, unless a focused test is added.
- `package.json` — only if adding `test/mvu.js` or `test/staff.js` to the suite.
- `index.html`, `public/index.html` — generated once in the final task, never hand-edited.

### Files created

- `test/mvu.js` — focused MVU fallback/cache tests.
- `test/staff.js` — focused staff disclosure behavior tests using the built page or a minimal render harness.

### Stable interfaces introduced

```javascript
Settings.SETTINGS_VERSION === 2
Settings.load(): normalized-and-migrated config

MVU.isValidData(data): boolean
MVU.rememberValid(data, messageId): cloned MvuData
MVU.getDataSnapshot(): cloned MvuData
MVU.lastValidSnapshot: MvuData | null
MVU.lastValidMessageId: number | string | null

App-internal mobilePage: 'ledger' | 'story'
setMobilePage(name): void
syncMobileImmersiveState(resetOnEnter): void

Render.expandedStaff: Set<string>
Render.toggleStaff(name, expanded): void
```

---

### Task 1: Versioned Depth-Entry Default and Request Overrides

**Files:**
- Modify: `test/settings.js:13-114`
- Modify: `test/api.js:273-329`
- Modify: `test/smoke.js:107-144`
- Modify: `js/settings.js:15-105`
- Modify: `js/api.js:227-323`
- Modify: `js/app.js:275-358`

**Interfaces:**
- Consumes: existing `Settings.load/save/normalize`, `ApiEngine.buildOverrides`, preset settings form.
- Produces: `Settings.SETTINGS_VERSION`, persisted `variablePresetSettingsVersion: 2`, strict `blockDepthEntries`, and an override object that independently represents `prompts: []` versus depth blocking.

- [ ] **Step 1: Add failing settings migration tests**

Extend `test/settings.js` with separate legacy and version-2 stores. Use actual `load()` for the migration case, not only `normalize()`:

```javascript
const legacyDom = new JSDOM('<!doctype html>', { runScripts: 'dangerously', url: 'http://localhost/' });
legacyDom.window.localStorage.setItem('mrfz_settings', JSON.stringify({
  legacy: 7,
  variablePresets: {
    normal: { blockDepthEntries: true },
    endday: { blockDepthEntries: true }
  }
}));
legacyDom.window.eval(fs.readFileSync(sourcePath, 'utf8'));
const migrated = legacyDom.window.Settings.load();
ok(migrated.variablePresetSettingsVersion === 2, '旧设置迁移到版本 2');
ok(migrated.variablePresets.normal.blockDepthEntries === false
  && migrated.variablePresets.endday.blockDepthEntries === false,
  '旧设置首次迁移统一改为默认放行深度注入');
ok(JSON.parse(legacyDom.window.localStorage.getItem('mrfz_settings')).legacy === 7,
  '迁移持久化时保留未知字段');

const v2 = S.normalize({
  variablePresetSettingsVersion: 2,
  variablePresets: {
    normal: { blockDepthEntries: true },
    endday: { blockDepthEntries: 'yes' }
  }
});
ok(v2.variablePresets.normal.blockDepthEntries === true, '版本 2 显式 true 保留');
ok(v2.variablePresets.endday.blockDepthEntries === false, '版本 2 非布尔值回退 false');
```

Update existing expectations from default `true` to `false`, including the untouched endday stage after a partial save.

- [ ] **Step 2: Run the settings test and confirm RED**

Run:

```bash
node test/settings.js
```

Expected: failures report missing version 2 and existing default/normalization still produce `true`.

- [ ] **Step 3: Implement settings version 2 and strict booleans**

In `js/settings.js`:

```javascript
const SETTINGS_VERSION = 2;

const variablePresetDefaults = () => ({
  mode: 'none',
  presetName: '',
  blockDepthEntries: false,
  temperature: 0,
  context: Object.assign({}, VARIABLE_CONTEXT_DEFAULTS)
});
```

Normalize strictly:

```javascript
preset.blockDepthEntries = preset.blockDepthEntries === true;
```

Separate raw migration from normalization:

```javascript
function migrate(value) {
  const source = merge({}, object(value));
  if (Number(source.variablePresetSettingsVersion) >= SETTINGS_VERSION) return source;
  const presets = object(source.variablePresets);
  source.variablePresets = merge(presets, {
    normal: merge(object(presets.normal), { blockDepthEntries: false }),
    endday: merge(object(presets.endday), { blockDepthEntries: false })
  });
  source.variablePresetSettingsVersion = SETTINGS_VERSION;
  return source;
}
```

`load()` must persist only when migration changed an older config, while preserving unknown fields:

```javascript
function load() {
  const source = raw();
  const migrated = migrate(source);
  const next = normalize(migrated);
  if (Number(source.variablePresetSettingsVersion) < SETTINGS_VERSION) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch (e) { console.warn('[Pastoral][Settings]', '迁移设置写回失败', e); }
  }
  return next;
}
```

`save()` merges against `migrate(raw())`, and the public return object includes `SETTINGS_VERSION`.

- [ ] **Step 4: Run the settings test and confirm GREEN**

Run:

```bash
node test/settings.js
```

Expected: all settings checks pass; no old assertion expects default blocking.

- [ ] **Step 5: Add failing API override tests**

In `test/api.js`, replace the old blanket-block expectations with three explicit cases:

```javascript
settingsState.variablePresets.normal = {
  mode: 'none', presetName: '', blockDepthEntries: false,
  context: Object.assign({}, noContext)
};
// call normal
ok(rawConfigs[0].overrides.chat_history.prompts.length === 0,
  '未选普通聊天历史时仍清空 prompts');
ok(rawConfigs[0].overrides.chat_history.with_depth_entries === undefined
  && rawConfigs[0].overrides.chat_history.author_note === undefined,
  '默认放行深度条目与作者注释');

settingsState.variablePresets.normal.blockDepthEntries = true;
// call normal again
ok(rawConfigs[0].overrides.chat_history.with_depth_entries === false
  && rawConfigs[0].overrides.chat_history.author_note === '',
  '显式勾选时才屏蔽深度条目与作者注释');
```

Also make `createStageSnapshot()` preserve only strict `true`.

- [ ] **Step 6: Run API test and confirm RED**

Run:

```bash
node test/api.js
```

Expected: the default-false override case fails because `buildOverrides()` currently always injects blocking fields.

- [ ] **Step 7: Split chat history and depth overrides**

In `js/api.js`:

```javascript
blockDepthEntries: selected.blockDepthEntries === true,
```

Build `chatHistoryOverride` incrementally:

```javascript
const chatHistory = {};
if (preset && preset.blockDepthEntries === true) {
  chatHistory.with_depth_entries = false;
  chatHistory.author_note = '';
}
if (!usingPreset && selected.chatHistory !== true) {
  chatHistory.prompts = [];
}
if (Object.keys(chatHistory).length) overrides.chat_history = chatHistory;
```

Do not seed `{with_depth_entries:false, author_note:''}` when only clearing prompts.

- [ ] **Step 8: Run API test and confirm GREEN**

Run:

```bash
node test/api.js
```

Expected: none/current/fixed tests pass, including both default pass-through and explicit blocking.

- [ ] **Step 9: Add failing settings UI tests**

In `test/smoke.js`, change the fresh checkbox assertion:

```javascript
ok(!!blockDepth && !blockDepth.checked,
  '深度注入屏蔽默认不勾选');
ok(/沿用酒馆深度注入与作者注释/.test(effective.textContent),
  '默认摘要说明沿用酒馆注入');
```

Then check the positive path:

```javascript
blockDepth.checked = true;
blockDepth.dispatchEvent(new win.Event('change', { bubbles: true }));
doc.getElementById('presetSettingsForm').dispatchEvent(...);
ok(JSON.parse(win.localStorage.getItem('mrfz_settings'))
  .variablePresets.normal.blockDepthEntries === true,
  '主动勾选可保存');
```

- [ ] **Step 10: Run smoke test and confirm RED**

Run:

```bash
node build.js && node test/smoke.js
```

Expected: checkbox/default copy assertions fail. This command regenerates `index.html`; immediately restore the pre-task deletion after observing RED:

```bash
git rm --cached --ignore-unmatch index.html >/dev/null 2>&1 || true
git restore --staged index.html 2>/dev/null || true
rm -f index.html
```

Do not remove `public/index.html` because it was tracked and not pre-deleted; do not stage it until final guarded build.

- [ ] **Step 11: Update settings UI behavior and copy**

In `js/app.js`:

```javascript
blockDepth.checked = setting.blockDepthEntries === true;
```

Change help/effective copy to:

```text
默认沿用酒馆对深度世界书条目与作者注释的处理；勾选后才强制关闭。此项与普通聊天历史开关相互独立。
```

```javascript
parts.push(blockDepth.checked
  ? '已屏蔽深度注入与作者注释'
  : '沿用酒馆深度注入与作者注释');
```

- [ ] **Step 12: Run focused settings/API tests**

Run:

```bash
node test/settings.js && node test/api.js
```

Expected: both pass. Defer smoke until the final guarded build to avoid repeatedly recreating the user's deleted root output.

- [ ] **Step 13: Commit Task 1 source and focused tests**

Before staging, verify scope:

```bash
git status --short
```

Stage only:

```bash
git add js/settings.js js/api.js js/app.js test/settings.js test/api.js test/smoke.js
```

Commit:

```bash
git commit -m "fix: make depth blocking opt in

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin HEAD:feat/data-backend-engine
```

---

### Task 2: Preserve the Nearest Valid MVU Snapshot

**Files:**
- Create: `test/mvu.js`
- Modify: `js/mvu.js:91-130,166-173`
- Modify: `package.json:6-10`
- Modify: `test/smoke.js:20-188`

**Interfaces:**
- Consumes: `getLastMessageId()`, `Mvu.getMvuData({type:'message', message_id})`, complete `MvuData`.
- Produces: `MVU.isValidData(data)`, `MVU.rememberValid(data, id)`, `MVU.lastValidSnapshot`, `MVU.lastValidMessageId`, fallback-aware `getDataSnapshot()`.

- [ ] **Step 1: Create focused failing MVU tests**

Create `test/mvu.js` with a helper that evaluates only `js/mvu.js` in jsdom and sets `MVU.ready/api` directly. Cover these exact cases:

```javascript
const floors = {
  4: { stat_data: { 旅店: { 资金: 400 } }, marker: 'old' },
  5: { stat_data: null, marker: 'new-empty' }
};
win.getLastMessageId = () => 5;
win.MVU.ready = true;
win.MVU.api = {
  getMvuData: ({ message_id }) => floors[message_id],
  replaceMvuData: async () => {}
};
const snapshot = win.MVU.getDataSnapshot();
ok(snapshot.marker === 'old' && snapshot.stat_data.旅店.资金 === 400,
  '冷启动从最新空楼回溯到上一有效楼');
```

Then mutate `snapshot.stat_data.旅店.资金 = 1` and assert a second read remains 400. Add:

- latest floor valid caches ID 5;
- latest `{stat_data:{}}` returns an already cached previous snapshot without scanning;
- floor 4 throws, floor 3 valid still succeeds;
- all live floors invalid falls back to `SAMPLE_STATE`;
- `writeData(valid, 6)` updates cache to ID 6 only after `replaceMvuData` resolves.

- [ ] **Step 2: Add the focused test to the suite and verify RED**

In `package.json` insert `node test/mvu.js` after `node test/settings.js` and before `node test/api.js`.

Run:

```bash
node test/mvu.js
```

Expected: failures because `isValidData`, backward lookup, and cache fields do not exist.

- [ ] **Step 3: Implement valid-data helpers and cache**

In `js/mvu.js` add state:

```javascript
lastValidSnapshot: null,
lastValidMessageId: null,
lookupWarningShown: false,
```

Add:

```javascript
isValidData(data) {
  return !!data && typeof data === 'object' && !Array.isArray(data)
    && !!data.stat_data && typeof data.stat_data === 'object'
    && !Array.isArray(data.stat_data)
    && Object.keys(data.stat_data).length > 0;
},

rememberValid(data, messageId) {
  if (!this.isValidData(data)) return null;
  this.lastValidSnapshot = this.clone(data);
  this.lastValidMessageId = messageId;
  return this.clone(this.lastValidSnapshot);
},
```

- [ ] **Step 4: Implement latest-read, cache, and cold backward lookup**

Replace `getDataSnapshot()` with deterministic logic:

```javascript
getDataSnapshot() {
  if (this.ready && this.api) {
    const latest = Number(this.latestMessageId());
    try {
      const data = this.api.getMvuData({ type: 'message', message_id: latest });
      const remembered = this.rememberValid(data, latest);
      if (remembered) return remembered;
    } catch (e) { /* try cache/backward lookup */ }

    if (this.lastValidSnapshot) return this.clone(this.lastValidSnapshot);

    if (Number.isInteger(latest) && latest >= 0) {
      for (let id = latest - 1; id >= 0; id--) {
        try {
          const candidate = this.api.getMvuData({ type: 'message', message_id: id });
          const remembered = this.rememberValid(candidate, id);
          if (remembered) return remembered;
        } catch (e) { /* continue */ }
      }
    }
  }
  return { stat_data: this.clone(window.SAMPLE_STATE) };
},
```

Do not use `'latest'` arithmetic. If `latestMessageId()` is nonnumeric, try only that target and cache, then sample.

- [ ] **Step 5: Update cache only after successful writes**

In `writeData()` resolve the target once:

```javascript
const target = messageId == null ? this.latestMessageId() : messageId;
await this.api.replaceMvuData(data, { type: 'message', message_id: target });
this.rememberValid(data, target);
return true;
```

A rejected write must leave the previous cache untouched.

- [ ] **Step 6: Run focused MVU test and confirm GREEN**

Run:

```bash
node test/mvu.js
```

Expected: all fallback/cache/clone/write cases pass.

- [ ] **Step 7: Extend smoke coverage for a live latest empty floor**

Change `test/smoke.js` test harness so `getMvuData` can return floor-specific data from `opts.mvuFloors`. Add a case where last ID 3 has `stat_data:null`, floor 2 has live funds/marker, and assert HUD/state uses floor 2 rather than `SAMPLE_STATE`.

Concrete assertion:

```javascript
const { win } = load(0, {
  chat: [...makeChat(), { message_id: 3, role: 'user', message: '新行动' }],
  mvuFloors: {
    2: { stat_data: { 旅店: { 资金: 23456 } }, marker: 'previous-valid' },
    3: { stat_data: null }
  }
});
await wait(600);
ok(win.MVU.getDataSnapshot().marker === 'previous-valid',
  '等待主模型时保持上一楼有效 MVU');
```

- [ ] **Step 8: Run non-build focused tests**

Run:

```bash
node test/mvu.js && node test/settings.js && node test/api.js
```

Expected: all pass.

- [ ] **Step 9: Commit Task 2**

```bash
git add js/mvu.js test/mvu.js test/smoke.js package.json
git commit -m "fix: preserve the last valid mvu state

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin HEAD:feat/data-backend-engine
```

---

### Task 3: Ledger-First Mobile Immersive Page Switching

**Files:**
- Modify: `src/template.html:14-55`
- Modify: `css/layout.css:19-111,167-181,244-269`
- Modify: `js/app.js:16-31,389-412,534-590`
- Modify: `test/layout.js:54-80`
- Modify: `test/iframe.js:31-124`

**Interfaces:**
- Consumes: `Host.immersive`, `Host.setImmersive(on)`, `pastoral:immersive`, `openTab(name)`.
- Produces: DOM `[data-mobile-page]`, app-local `mobilePage`, `setMobilePage(name)`, `syncMobileImmersiveState(resetOnEnter)`.

- [ ] **Step 1: Add failing layout assertions**

In `test/layout.js`, keep desktop assertions and add mobile requirements against built CSS source patterns:

```javascript
ok(/\.mobile-page-switcher/.test(CSS), '提供手机沉浸页签样式');
ok(/@media\s*\(max-width:\s*899px\)[\s\S]*body\.is-immersive[\s\S]*100dvh/.test(CSS),
  '手机沉浸使用动态视口高度');
ok(/body\.is-immersive\.mobile-page--ledger\s+\.page--right[\s\S]*display:\s*none/.test(CSS),
  '经营页状态隐藏剧情页');
ok(/body\.is-immersive\.mobile-page--story\s+\.page--left[\s\S]*display:\s*none/.test(CSS),
  '剧情页状态隐藏经营页');
ok(!/body\.is-immersive\s+\.book\s*\{[^}]*flex-wrap:\s*wrap[^}]*height:\s*auto/.test(CSS),
  '手机沉浸不再上下堆叠双页');
```

- [ ] **Step 2: Add failing iframe interaction assertions**

In `test/iframe.js`, make `cwin.innerWidth` configurable as 390 and make `matchMedia('(max-width: 899px)')` return true. After entering fullscreen, assert:

```javascript
const switcher = cdoc.querySelector('[data-mobile-page-switcher]');
const ledgerTab = cdoc.querySelector('[data-mobile-page="ledger"]');
const storyTab = cdoc.querySelector('[data-mobile-page="story"]');
ok(!switcher.hidden && cdoc.body.classList.contains('mobile-page--ledger'),
  '手机全屏默认经营页');
ok(ledgerTab.getAttribute('aria-selected') === 'true'
  && storyTab.getAttribute('aria-selected') === 'false',
  '经营页 ARIA 状态正确');
storyTab.click();
ok(cdoc.body.classList.contains('mobile-page--story')
  && storyTab.getAttribute('aria-selected') === 'true',
  '可切换到剧情页');
```

Click a new exit button `[data-mobile-exit]` and assert immersive and mobile page classes are removed. Add a second 1024px harness assertion that switcher stays hidden and both pages remain present.

- [ ] **Step 3: Run the mobile tests and confirm RED**

Because these tests read the bundle, run one temporary build:

```bash
node build.js && node test/layout.js && node test/iframe.js
```

Expected: new switcher and one-page assertions fail. Restore root output to its pre-task deleted state immediately:

```bash
rm -f index.html
```

Leave the tracked `public/index.html` modification unstaged until final build.

- [ ] **Step 4: Add accessible mobile page switcher markup**

In `src/template.html`, immediately inside `<main class="book">` and before the spine, add:

```html
<nav class="mobile-page-switcher" data-mobile-page-switcher hidden
  role="tablist" aria-label="手机全屏页面">
  <button class="mobile-page-switcher__tab is-active" type="button"
    role="tab" aria-selected="true" aria-controls="pageLeft"
    data-mobile-page="ledger">经营页</button>
  <button class="mobile-page-switcher__tab" type="button"
    role="tab" aria-selected="false" aria-controls="pageRight"
    data-mobile-page="story">剧情页</button>
  <button class="mobile-page-switcher__exit" type="button"
    data-mobile-exit aria-label="退出全屏">退出</button>
</nav>
```

Also remove the duplicate viewport meta line while touching the template.

- [ ] **Step 5: Implement mobile viewport and one-page CSS**

Replace the old narrow immersive wrap rule. Keep desktop `body.is-immersive .page {width:50%}` but override below 900px with body state classes:

```css
.mobile-page-switcher { display: none; }

@media (max-width: 899px) {
  body.is-immersive .book {
    height: 100vh;
    height: 100dvh;
    min-height: 0;
    padding: max(8px, env(safe-area-inset-top))
      max(8px, env(safe-area-inset-right))
      max(8px, env(safe-area-inset-bottom))
      max(8px, env(safe-area-inset-left));
    flex-direction: column;
    flex-wrap: nowrap;
  }
  body.is-immersive .mobile-page-switcher {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    flex: 0 0 auto;
  }
  body.is-immersive .page {
    width: 100%;
    height: auto;
    flex: 1 1 0;
    min-height: 0;
  }
  body.is-immersive.mobile-page--ledger .page--right,
  body.is-immersive.mobile-page--story .page--left { display: none; }
  body.is-immersive.mobile-page--ledger .page--left,
  body.is-immersive.mobile-page--story .page--right { display: flex; }
}
```

Style all three controls to min-height 44px, cursor pointer, transition, active, hover, active-press, and focus-visible. In reduced motion, disable the switch transition.

- [ ] **Step 6: Implement mobile page state in app.js**

Add:

```javascript
let mobilePage = 'ledger';
let wasImmersive = false;

function isMobileViewport() { return window.innerWidth < 900; }

function setMobilePage(name) {
  mobilePage = name === 'story' ? 'story' : 'ledger';
  document.body.classList.toggle('mobile-page--ledger', mobilePage === 'ledger');
  document.body.classList.toggle('mobile-page--story', mobilePage === 'story');
  $$('[data-mobile-page]').forEach((button) => {
    const on = button.dataset.mobilePage === mobilePage;
    button.classList.toggle('is-active', on);
    button.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

function syncMobileImmersiveState(resetOnEnter) {
  const active = Host.immersive && isMobileViewport();
  const switcher = $('[data-mobile-page-switcher]');
  if (switcher) switcher.hidden = !active;
  if (active) setMobilePage(resetOnEnter ? 'ledger' : mobilePage);
  else {
    document.body.classList.remove('mobile-page--ledger', 'mobile-page--story');
  }
  wasImmersive = Host.immersive;
}
```

On `pastoral:immersive`, calculate `entering = Host.immersive && !wasImmersive`, sync button, then call `syncMobileImmersiveState(entering)`. Bind mobile tab buttons and exit button. Add a debounced or direct `resize` listener calling `syncMobileImmersiveState(false)`.

Modify `openTab(name)`:

```javascript
if (Host.immersive && isMobileViewport()) setMobilePage('ledger');
```

- [ ] **Step 7: Run a temporary build and focused mobile tests**

Run:

```bash
node build.js && node test/layout.js && node test/iframe.js
```

Expected: all mobile and desktop assertions pass. Then return root output to pre-task deletion until final verification:

```bash
rm -f index.html
```

- [ ] **Step 8: Commit Task 3 source and tests only**

```bash
git add src/template.html css/layout.css js/app.js test/layout.js test/iframe.js
git commit -m "feat: add mobile immersive page switching

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin HEAD:feat/data-backend-engine
```

Do not stage `public/index.html` yet.

---

### Task 4: Expandable Staff Details on Every Device

**Files:**
- Create: `test/staff.js`
- Modify: `js/render.js:558-623,780-810`
- Modify: `css/components.css:168-187,249`
- Modify: `test/assets.js:24-27`
- Modify: `package.json:6-10`

**Interfaces:**
- Consumes: `Render.state`, `renderStaff(container, state)`, `Assets.avatarUrl/putStaffAvatar/removeStaffAvatar`, `Money.formatCopper`.
- Produces: `Render.expandedStaff: Set<string>`, stable staff disclosure markup, local `aria-expanded`/`hidden` synchronization.

- [ ] **Step 1: Create failing staff interaction test**

Create `test/staff.js`. Load the built page only in the final suite would recreate root output, so instead build a focused jsdom harness that evaluates `icons.js`, `data.js`, `money.js`, `render.js` with minimal global stubs and a `<section data-panel="staff"></section>`. Call:

```javascript
win.Render.state = {
  旅店: { 员工: {
    甲: {
      属性: { 技艺: 2, 悟性: 3, 体力: 4, 亲和: 5, 专注: 6 },
      状态: { 精力: 80, 士气: 70, 忠诚度: 60 },
      职业信息: { 职业: '厨师', 阶级: 'T1', 日薪: 123 },
      心之宝石: { 闪光圣岩: ['热忱'], 暗影原石: [] },
      技能: ['慢火'], 描述: '可靠'
    }
  } }
};
win.Render.panel('staff', win.Render.state, true);
```

Assert:

```javascript
const toggle = doc.querySelector('[data-staff-toggle="甲"]');
const detail = doc.querySelector('[data-staff-detail="甲"]');
ok(toggle.tagName === 'BUTTON' && toggle.getAttribute('aria-expanded') === 'false',
  '员工摘要使用原生收起按钮');
ok(detail.hidden, '员工详情默认隐藏');
toggle.click();
ok(toggle.getAttribute('aria-expanded') === 'true' && !detail.hidden,
  '点击展开员工详情');
win.Render.panel('staff', win.Render.state, true);
ok(doc.querySelector('[data-staff-toggle="甲"]').getAttribute('aria-expanded') === 'true',
  'MVU 重绘后保持展开状态');
```

Also assert a second employee expands independently and the salary text equals `Money.formatCopper(123)`, not `123 银`.

- [ ] **Step 2: Add staff test to package and verify RED**

Insert `node test/staff.js` after `node test/assets.js` in `package.json`.

Run:

```bash
node test/staff.js
```

Expected: no staff toggle/detail interface and salary formatting assertion fails.

- [ ] **Step 3: Add persistent expandedStaff state**

At `Render` object scope in `js/render.js`, create:

```javascript
const expandedStaff = new Set();
```

Before building cards, prune stale names:

```javascript
const names = new Set(staff.map(([name]) => name));
Array.from(expandedStaff).forEach((name) => {
  if (!names.has(name)) expandedStaff.delete(name);
});
```

Expose it from `Render` for testing/diagnostics:

```javascript
expandedStaff,
```

- [ ] **Step 4: Split staff summary and details markup**

Use a stable non-CSS-selector ID based on the loop index for `aria-controls`, while data attributes retain the employee name:

```javascript
const detailId = `staffDetail${i}`;
const expanded = expandedStaff.has(name);
```

Structure each card as siblings, never nesting avatar buttons inside the disclosure button:

```html
<div class="staff-card ..." data-staff-card="NAME">
  <div class="staff-card__summary-row">
    <div class="staff-avatar-wrap">...</div>
    <button class="staff-card__toggle" type="button"
      data-staff-toggle="NAME" aria-expanded="false"
      aria-controls="staffDetail0">...</button>
  </div>
  <div class="staff-card__quick-stats">精力 / 士气 / 忠诚</div>
  <div class="staff-card__detail" id="staffDetail0"
    data-staff-detail="NAME" hidden>...</div>
</div>
```

Put radar, five numeric axes, salary, skills, gems, description, upload and remove controls inside detail. Render salary with `Money.formatCopper(num(...))`.

- [ ] **Step 5: Bind local disclosure behavior without rerendering**

After markup:

```javascript
$$('[data-staff-toggle]', container).forEach((button) => {
  button.addEventListener('click', () => {
    const name = button.dataset.staffToggle;
    const detail = document.getElementById(button.getAttribute('aria-controls'));
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.classList.toggle('is-expanded', expanded);
    if (detail) detail.hidden = !expanded;
    if (expanded) expandedStaff.add(name); else expandedStaff.delete(name);
  });
});
```

Keep upload/remove handlers separate; add `event.stopPropagation()` only if the final DOM layout still allows bubbling into a summary handler.

Draw radar only when its SVG exists; hidden SVG may still receive its paths so opening does not require a redraw.

- [ ] **Step 6: Add staff disclosure CSS**

In `css/components.css` add:

```css
.staff-card__summary-row { display: grid; grid-template-columns: auto 1fr; gap: 10px; }
.staff-card__toggle { min-height: 44px; width: 100%; text-align: left; cursor: pointer; ... }
.staff-card__toggle:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.staff-card__chevron { transition: transform var(--transition-base); }
.staff-card__toggle[aria-expanded="true"] .staff-card__chevron { transform: rotate(180deg); }
.staff-card__detail { overflow: clip; opacity: 1; transition: opacity var(--transition-base); }
.staff-card__detail[hidden] { display: none; }
```

Do not attempt CSS transitions from `display:none` to auto height. Use the existing ink/fade animation on the detail when unhidden, and disable it under `prefers-reduced-motion: reduce`.

- [ ] **Step 7: Update static asset assertions**

In `test/assets.js` retain avatar assertions and add:

```javascript
ok(/data-staff-toggle/.test(render) && /aria-expanded/.test(render),
  '员工卡提供可访问的详情展开按钮');
ok(/data-staff-detail/.test(render) && /expandedStaff/.test(render),
  '员工详情与展开状态可跨重绘保持');
```

- [ ] **Step 8: Run focused staff/assets tests and confirm GREEN**

Run:

```bash
node test/staff.js && node test/assets.js
```

Expected: all staff disclosure, persistence, independent expansion, avatar, and currency assertions pass.

- [ ] **Step 9: Commit Task 4**

```bash
git add js/render.js css/components.css test/staff.js test/assets.js package.json
git commit -m "feat: add expandable staff details

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin HEAD:feat/data-backend-engine
```

---

### Task 5: Guarded Build, Full Regression, Documentation Sync, and Delivery

**Files:**
- Modify: `迁移参考资料/README.md`
- Modify: `迁移参考资料/接口与时序速查.md`
- Modify: `迁移参考资料/迁移清单.md`
- Generated: `index.html`
- Generated: `public/index.html`
- Verify only: all source and test files from Tasks 1–4

**Interfaces:**
- Consumes: all completed task outputs and `build.js`.
- Produces: synchronized self-contained bundles and fresh verification evidence.

- [ ] **Step 1: Record and inspect the pre-build working tree**

Run:

```bash
git status --short
git diff --name-only
git ls-files --deleted
```

Expected before build: `index.html` appears as a pre-existing deletion; unrelated user files remain untouched. Save the command output in the session log, not in a source file.

- [ ] **Step 2: Update migration docs to match production behavior**

Remove wording that says current Pastoral still defaults `blockDepthEntries` to true. State that production and migration guidance now both default false, while explicit true remains supported. Add the nearest-valid-MVU fallback and mobile/staff behavior to the relevant guide/checklist sections.

Run a targeted contradiction search:

```bash
rg -n "当前 Pastoral.*默认.*true|默认屏蔽|blockDepthEntries:\s*true" '迁移参考资料'
```

Expected: no stale claim that production defaults to true; examples of explicit opt-in true may remain if clearly labeled.

- [ ] **Step 3: Run all non-build focused tests first**

Run:

```bash
node test/settings.js && node test/mvu.js && node test/api.js && node test/assets.js && node test/staff.js
```

Expected: zero failures. If any fail, do not build; fix the failing task and rerun this exact command.

- [ ] **Step 4: Run syntax checks on every modified JavaScript file**

Run:

```bash
node --check js/settings.js
node --check js/api.js
node --check js/app.js
node --check js/mvu.js
node --check js/render.js
node --check test/settings.js
node --check test/mvu.js
node --check test/api.js
node --check test/smoke.js
node --check test/iframe.js
node --check test/layout.js
node --check test/staff.js
```

Expected: every command exits 0 with no syntax error.

- [ ] **Step 5: Perform the intentional final build**

Run:

```bash
npm test
```

Expected:

- `build.js` regenerates `index.html` and `public/index.html`;
- build test confirms byte equality;
- all settings, MVU, API, assets, staff, farm, smoke, iframe, and layout tests pass;
- no runtime errors are reported.

This is the one point at which the pre-existing root `index.html` deletion is intentionally resolved because the user requested implementation and the application requires a runnable self-contained output. If the user explicitly asks to preserve deletion before this step, skip generation and report that build-dependent tests were not run.

- [ ] **Step 6: Verify generated bundle equality and source inclusion**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const a = fs.readFileSync('index.html', 'utf8');
const b = fs.readFileSync('public/index.html', 'utf8');
if (a !== b) process.exit(1);
for (const term of ['data-mobile-page-switcher', 'data-staff-toggle', 'lastValidSnapshot', 'variablePresetSettingsVersion']) {
  if (!a.includes(term)) { console.error('missing', term); process.exit(1); }
}
console.log('bundle verification passed');
NODE
```

Expected: `bundle verification passed`.

- [ ] **Step 7: Run whitespace and scope checks**

Run:

```bash
git diff --check
git status --short
```

Then verify no unrelated file is staged:

```bash
git diff --cached --name-only
```

Expected: nothing staged yet, or only files explicitly listed in the next step. Review every output line; do not use `git add .`.

- [ ] **Step 8: Stage only the final docs and generated bundles**

```bash
git add -- \
  '迁移参考资料/README.md' \
  '迁移参考资料/接口与时序速查.md' \
  '迁移参考资料/迁移清单.md' \
  index.html public/index.html
```

Check:

```bash
git diff --cached --name-only
```

Expected exactly those five paths. If any other path appears, unstage it before committing.

- [ ] **Step 9: Commit and push final generated outputs and docs**

```bash
git commit -m "docs: sync mobile state behavior

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin HEAD:feat/data-backend-engine
```

- [ ] **Step 10: Verify remote and final working-tree boundaries**

Run:

```bash
git status --short
git log -5 --oneline --decorate
git rev-parse HEAD
git rev-parse origin/feat/data-backend-engine
```

Expected:

- local HEAD equals remote branch HEAD;
- only the user's pre-existing unrelated changes/untracked references remain;
- no task source/test/generated file remains modified;
- all five task commits are visible.

- [ ] **Step 11: Report evidence, not assumptions**

Final report must include:

- exact commit hashes pushed;
- `npm test` pass/fail count or final success line;
- mobile default page and desktop unchanged behavior;
- MVU fallback behavior;
- depth blocking default and migration behavior;
- staff disclosure behavior;
- any unrelated working-tree changes intentionally left untouched.
