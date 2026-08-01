# Title, Prologue, and Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 山谷暮光 title experience, force the complete decorated prologue when the latest SillyTavern floor is 0, comprehensively refresh the existing double-page UI without changing behavior, and share player-selected icons across all displays of the same resource.

**Architecture:** Add a focused `Intro` module that owns only title/prologue display and floor-based entry decisions, plus a focused `ResourceIcon` module that owns resource-name normalization and decorated material rendering. Existing `Host`, `Chat`, `MVU`, `Render`, and `App` behavior stays intact; templates and CSS provide progressive visual enhancement around the same IDs, data attributes, events, and data sources.

**Tech Stack:** Self-contained HTML, plain JavaScript, CSS custom properties and inline SVG, JSDOM test suite, Node.js build script, SillyTavern/TavernHelper browser APIs, existing IndexedDB `Assets` and `IconPicker` modules.

## Global Constraints

- Preserve the 0-floor unique host and nonzero-floor self-destruction behavior.
- Preserve main-story sending, second API, fixed-preset short transactions, MVU reads/writes/settlement, tab order, panel semantics, mobile immersive switching, staff expansion, chat edit/copy/delete, theme, settings, and fullscreen behavior.
- The complete user-provided opening text must be displayed without summary, deletion, or rewriting when `getLastMessageId()` returns `0`.
- Never use floor-0 message text as the prologue source; a floor containing only Markdown fences must not suppress the built-in opening.
- The prologue is display-only: no chat write, generation, slash command, or MVU write.
- The Discord card-floor link is exactly `https://discord.com/channels/1380075940285124724/1480878747291881654` and opens with `target="_blank" rel="noopener noreferrer"`.
- The final page remains dependency-free and self-contained; do not add CDN or image-network dependencies.
- All resource-icon preferences remain local in the existing IndexedDB assets store and never enter MVU or chat.
- All interactive targets are at least 44×44px on touch layouts, remain keyboard-operable, and expose visible focus styles.
- All continuous/decorative motion is disabled or reduced under `prefers-reduced-motion: reduce`.
- Do not stage or alter the user's unrelated existing workspace changes, including deleted reference files, MVU reference text, planning files, split type references, `.playwright-mcp/`, or `.superpowers/`.

---

## File Structure

### New production files

- `js/intro.js` — exact opening text, deterministic chapter model, latest-floor entry decision, title interaction, semantic prologue rendering, focus handoff.
- `js/resource-icon.js` — exact resource-name normalization, shared resource keys, known-resource collection, fallback selection, and safe recipe-material tokenization/rendering.

### Modified production files

- `src/template.html` — title scene, title metadata/link/button, prologue mount, main-experience state, decorative but semantic structure.
- `build.js` — load `intro` before `app` and `resource-icon` before `render`.
- `js/app.js` — initialize `Intro` once, keep existing application initialization and event wiring unchanged.
- `js/render.js` — replace inventory/seed/crop/material icon markup with `ResourceIcon` helpers and decorate affected dynamic regions.
- `js/icon-picker.js` — accept the `资源` preset group and allow a resource target to enforce its shared binding key.
- `css/tokens.css` — expanded project-specific surface, atmosphere, typography, depth, and motion tokens.
- `css/base.css` — polished global typography, focus, selection, scrollbar, reduced-motion, and content defaults.
- `css/layout.css` — title/prologue composition and refreshed responsive book/page/HUD/journal layout while retaining existing breakpoints and selectors.
- `css/components.css` — refreshed controls/cards/panels/dialogs/toasts and resource-token styles.
- `css/animations.css` — title, prologue, ink, light, and feedback keyframes guarded by motion preferences.
- `package.json` — add focused intro and resource-icon tests to the existing `npm test` chain.
- `index.html`, `public/index.html` — generated only by `node build.js`.

### New/modified tests

- `test/intro.js` — title content, entry decisions, built-in opening, semantic prologue, no-write boundary, accessibility/focus.
- `test/resource-icons.js` — normalization, shared keys, known-resource collection, longest-match material tokenization, safe rendering.
- `test/icons.js` — picker contract for the resource group and forced shared scope.
- `test/smoke.js` — start-title integration for floor 0, resume integration for saved chats, and existing behavior after entry.
- `test/layout.js` — structural CSS assertions for title/prologue, max reading measure, touch targets, motion guard, and preserved page rules.
- `test/assets.js` — only if a regression is exposed; no data-store schema change is expected.

---

### Task 1: Add the title entry decision and accessible shell

**Files:**
- Create: `js/intro.js`
- Create: `test/intro.js`
- Modify: `src/template.html:9-142`
- Modify: `build.js:10-14`
- Modify: `js/app.js:591-674`
- Modify: `package.json:6-10`
- Generate: `index.html`
- Generate: `public/index.html`

**Interfaces:**
- Consumes: `Host.isHost`, optional global `getLastMessageId()`, existing global `toast(type, title, message)` after application initialization.
- Produces: `window.Intro` with:
  - `Intro.OPENING_TEXT: string`
  - `Intro.chapters(): Array<{ id: string, title: string, paragraphs: string[] }>`
  - `Intro.detectEntry(): Promise<{ mode: 'prologue' | 'resume', reason: 'floor-zero' | 'saved-chat' | 'standalone' | 'api-error', floor: number | null }>`
  - `Intro.init(): void`
  - `Intro.start(): Promise<'prologue' | 'resume'>`
  - `Intro.revealExperience(): void`
- `App.init()` calls `Intro.init()` after static icons render, but it continues to initialize Assets/MVU/Chat/Render exactly once so the loaded interface is ready behind the title layer.

- [ ] **Step 1: Write failing title and entry-decision tests**

Create `test/intro.js` with JSDOM helpers that evaluate `js/intro.js` against a minimal DOM containing `#titleScreen`, `#titleStart`, `#titleStatus`, `#prologue`, and `#book`. Include these concrete assertions:

```js
ok(Intro.OPENING_TEXT.startsWith('【第一年，春季第1天，周一，晴天。7:00】'), 'opening begins with exact timestamp');
ok(Intro.OPENING_TEXT.includes('——你的远房叔公，霍根·星摇'), 'opening contains exact signature');
ok(Intro.OPENING_TEXT.endsWith('（报酬：声望+3）'), 'opening ends with exact quest reward');
ok(Intro.OPENING_TEXT.length > 6000, 'opening is complete rather than a summary');

win.getLastMessageId = () => 0;
let decision = await win.Intro.detectEntry();
ok(decision.mode === 'prologue' && decision.reason === 'floor-zero' && decision.floor === 0,
  'floor zero selects forced prologue');

win.getLastMessageId = () => 9;
decision = await win.Intro.detectEntry();
ok(decision.mode === 'resume' && decision.reason === 'saved-chat' && decision.floor === 9,
  'saved chat skips repeated prologue');

delete win.getLastMessageId;
decision = await win.Intro.detectEntry();
ok(decision.mode === 'prologue' && decision.reason === 'standalone',
  'standalone preview selects built-in prologue');

win.getLastMessageId = () => { throw new Error('host unavailable'); };
decision = await win.Intro.detectEntry();
ok(decision.mode === 'prologue' && decision.reason === 'api-error',
  'API failure degrades to built-in prologue');
```

Also load the built page as text and assert the exact game title, author, publication copy, Discord URL, `target="_blank"`, `rel="noopener noreferrer"`, an initially present title layer, and an initially noninteractive `#book` using `inert` plus `aria-hidden="true"`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node test/intro.js`

Expected: FAIL because `js/intro.js`, `window.Intro`, and title DOM nodes do not exist.

- [ ] **Step 3: Add the semantic title shell and exact entry API**

In `src/template.html`, insert before `#book`:

```html
<section class="title-screen" id="titleScreen" aria-labelledby="gameTitle">
  <div class="title-screen__scene" aria-hidden="true">
    <span class="title-screen__sky"></span>
    <span class="title-screen__mountains title-screen__mountains--far"></span>
    <span class="title-screen__mountains title-screen__mountains--near"></span>
    <span class="title-screen__lake"></span>
    <span class="title-screen__mist title-screen__mist--one"></span>
    <span class="title-screen__mist title-screen__mist--two"></span>
    <span class="title-screen__inn"><i></i><i></i><i></i></span>
    <span class="title-screen__tree"></span>
    <span class="title-screen__fireflies"></span>
  </div>
  <div class="title-screen__content">
    <p class="title-screen__eyebrow">A tale of hearth &amp; inheritance</p>
    <h1 id="gameTitle">我们的家族<br>又没落了？</h1>
    <p class="title-screen__author">作者 · 观心</p>
    <button class="title-screen__start" id="titleStart" type="button">
      <span>开始游戏</span><span class="title-screen__start-glow" aria-hidden="true"></span>
    </button>
    <p class="title-screen__credit">
      <a href="https://discord.com/channels/1380075940285124724/1480878747291881654"
         target="_blank" rel="noopener noreferrer">卡免费发布 · 类脑 / 旅程</a>
    </p>
    <p class="title-screen__status" id="titleStatus" role="status" aria-live="polite"></p>
  </div>
</section>
<section class="prologue" id="prologue" aria-labelledby="prologueTitle" hidden></section>
```

Add `inert aria-hidden="true"` to `<main class="book" id="book">`. Add `intro` to the build list after `render` and before `app` for this task; Task 3 will add `resource-icon` before `render`.

Implement `detectEntry()` exactly:

```js
async function detectEntry() {
  if (typeof getLastMessageId !== 'function') {
    return { mode: 'prologue', reason: 'standalone', floor: null };
  }
  try {
    const floor = Number(await getLastMessageId());
    if (!Number.isFinite(floor) || floor < 0) throw new Error('最新楼层无效');
    return floor === 0
      ? { mode: 'prologue', reason: 'floor-zero', floor }
      : { mode: 'resume', reason: 'saved-chat', floor };
  } catch (error) {
    return { mode: 'prologue', reason: 'api-error', floor: null };
  }
}
```

`init()` binds one click listener, initializes `aria-busy="false"`, and does not call `start()` automatically. `start()` disables the button, sets `aria-busy="true"`, updates `#titleStatus` to `正在循着灯火辨认归途……`, awaits `detectEntry()`, dispatches `pastoral:intro-start` with the decision, and calls either `renderPrologue(decision)` or `revealExperience()`. It must reset the busy state if rendering throws.

`revealExperience()` removes `inert` and `aria-hidden` from `#book`, adds `.is-leaving` to `#titleScreen`, removes the title node after the CSS transition duration, and focuses `#book` after temporarily assigning `tabindex="-1"`.

In `js/app.js`, call `Intro.init()` after `Icon.render(document)`. Do not move or duplicate `MVU.init()`, `Chat.init()`, event registration, tab registration, or interval creation.

- [ ] **Step 4: Insert the exact built-in opening source**

Set `Intro.OPENING_TEXT` to the complete user-provided source beginning with:

```text
【第一年，春季第1天，周一，晴天。7:00】
信是三天前到的。
准确地说，是一只浑身湿漉漉的灰色信鸽……
```

It must include, unchanged:

- the full letter from `“吾之后辈，见字如晤。` through the plum-wine postscript;
- the complete journey from 白帆城 through 格林镇 to 翠玉摇篮;
- the complete inn inspection and every 艾莉 line;
- the entire following-morning scene;
- every proposed first action and `又或者，你有自己的想法。`;
- the exact final task block:

```text
 * 委托任务：
   「初来乍到」：旅店积了不少灰尘，是时候彻底打扫一下了。一个干净的环境是良好开端的第一步。（报酬：声望+3）
```

Use a JavaScript template literal and escape only syntax-significant backticks or `${` sequences; do not insert HTML into the source string.

- [ ] **Step 5: Build and run the focused test for GREEN**

Run: `node build.js && node test/intro.js`

Expected: all Intro assertions pass; the build reports both generated HTML files.

- [ ] **Step 6: Run existing host smoke tests**

Run: `node test/smoke.js && node test/iframe.js`

Expected initially: existing tests may fail because they attempt to interact with inert content before clicking start. Record the exact failures, then minimally update their setup in Task 5 rather than weakening the title tests. They must not fail from runtime exceptions, duplicate initialization, or nonzero-floor self-destruction.

- [ ] **Step 7: Commit the title shell and decision API**

```bash
git add js/intro.js test/intro.js src/template.html build.js js/app.js package.json index.html public/index.html
git commit -m "feat: add valley title entry"
```

Do not stage unrelated files.

---

### Task 2: Render the complete decorated prologue without side effects

**Files:**
- Modify: `js/intro.js`
- Modify: `test/intro.js`
- Modify: `css/layout.css`
- Modify: `css/components.css`
- Modify: `css/animations.css`
- Generate: `index.html`
- Generate: `public/index.html`

**Interfaces:**
- Consumes: `Intro.OPENING_TEXT`, the template `#prologue`, and `#book`.
- Produces:
  - `Intro.chapters()` with IDs `time`, `pigeon`, `letter`, `journey`, `ellie`, `morning`, `quest`.
  - `Intro.renderPrologue(decision): HTMLElement`
  - A `pastoral:intro-ready` `CustomEvent` whose detail is `{ mode: 'prologue', reason, floor }`.
- Does not consume or call `setChatMessages`, `deleteChatMessages`, `triggerSlash`, `Mvu.replaceMvuData`, or `MVU.replaceMvuData`.

- [ ] **Step 1: Extend `test/intro.js` with semantic and side-effect RED tests**

Add spies that throw on all write/generation APIs, then call `await Intro.start()` with floor 0. Assert:

```js
ok(doc.querySelector('[data-prologue-chapter="time"] time').textContent.includes('7:00'), 'time plaque is semantic');
ok(doc.querySelector('[data-prologue-chapter="letter"] blockquote'), 'uncle letter uses a dedicated quotation surface');
ok(doc.querySelector('[data-prologue-route] [data-stop="白帆城"]'), 'route contains 白帆城');
ok(doc.querySelector('[data-prologue-route] [data-stop="格林镇"]'), 'route contains 格林镇');
ok(doc.querySelector('[data-prologue-route] [data-stop="翠玉摇篮"]'), 'route contains 翠玉摇篮');
ok(doc.querySelector('[data-prologue-speaker="艾莉"]'), 'Ellie dialogue has semantic accent');
ok(doc.querySelector('[data-prologue-chapter="quest"] .prologue-quest__reward').textContent.includes('声望+3'), 'quest reward preserved');
ok(doc.getElementById('prologue').textContent.includes('地下室有一扇上了锁的铁门'), 'middle letter content is present');
ok(doc.getElementById('prologue').textContent.includes('又或者，你有自己的想法。'), 'final choice prompt is present');
ok(writeCalls === 0 && slashCalls === 0 && mvuWriteCalls === 0, 'prologue is display-only');
ok(!doc.getElementById('book').hasAttribute('inert'), 'book becomes available after prologue is rendered in normal flow');
```

Add a floor-0 chat fixture whose message is exactly `` ``` ``` `` and assert the prologue still contains the opening signature and quest reward. The test must never call `getChatMessages()` from Intro.

- [ ] **Step 2: Run tests and verify RED**

Run: `node test/intro.js`

Expected: FAIL because chapter rendering and semantic elements are not implemented.

- [ ] **Step 3: Implement deterministic chapter extraction**

Create small internal helpers `lines()`, `paragraphsBetween(start, end)`, `letterBody()`, and `dialogueParagraphs()`. Use exact sentinel strings rather than broad regular expressions:

```js
const SENTINELS = {
  pigeon: '信是三天前到的。',
  letterIntro: '信的内容如下：',
  letterStart: '“吾之后辈，见字如晤。',
  letterEnd: '附言：旅店后面那棵老槐树下埋着一坛我三十年前酿的梅子酒。别挖。那是我留给自己的。如果哪天我回来了，我们一起喝。”',
  journey: '从白帆城出发，先是坐了两天的长途马车摇到了边城格林镇',
  ellie: '一个脑袋从矮门后面探了出来。',
  morning: '那是昨晚的事了。',
  quest: ' * 委托任务：'
};
```

`chapters()` validates that all sentinels occur in strictly increasing order and throws a descriptive error if the source was accidentally truncated. It returns paragraphs as plain strings, never HTML.

- [ ] **Step 4: Implement safe semantic DOM rendering**

Build every text node using `textContent`/`document.createTextNode`; do not pass opening text through `innerHTML` or Tavern regex processing. Render:

- a `<header class="prologue__hero">` with `h2#prologueTitle`, date `<time>`, and intro copy;
- `<article data-prologue-chapter="letter">` containing a decorated `<blockquote>` and separate `<footer>` for the signature;
- `<ol data-prologue-route>` with exactly three `<li data-stop>` nodes;
- ordinary `<p>` nodes for journey/morning narration;
- `<p data-prologue-speaker="艾莉">` for quoted 艾莉 speech while preserving the exact quote text;
- an `<aside class="prologue-quest">` with task name, description, and reward;
- a final visual divider followed by the existing `#book`, not a new “continue” action.

After rendering, unhide `#prologue`, remove `inert`/`aria-hidden` from `#book`, remove the title after its exit transition, focus `#prologueTitle` with temporary `tabindex="-1"`, and dispatch `pastoral:intro-ready`.

- [ ] **Step 5: Add prologue visual styles**

In `css/layout.css`, add normal-flow `.prologue` with `max-width: 920px`, generous block spacing, responsive padding, and `.prologue__measure { max-width: 72ch; margin-inline: auto; }`. The book follows below it, so scrolling naturally reaches the game.

In `css/components.css`, add the time plaque, letter parchment, watermarked crest, signature, route, Ellie accent, morning light treatment, and quest card. Use only design tokens or HSL values assigned to new tokens in Task 4; for this task, reference semantic token names that Task 4 will define (`--color-title-sky`, `--color-parchment-warm`, `--color-ellie`, `--shadow-letter`).

In `css/animations.css`, add guarded `prologueReveal`, `letterUnfold`, and `routeDraw` animations. Under reduced motion, the elements remain fully visible with no transform.

- [ ] **Step 6: Build and verify GREEN**

Run: `node build.js && node test/intro.js`

Expected: all title, decision, semantic chapter, fence fallback, no-write, and focus assertions pass.

- [ ] **Step 7: Commit the decorated forced prologue**

```bash
git add js/intro.js test/intro.js css/layout.css css/components.css css/animations.css index.html public/index.html
git commit -m "feat: render the opening prologue"
```

---

### Task 3: Add one shared resource-icon contract across inventory, seeds, crops, and recipes

**Files:**
- Create: `js/resource-icon.js`
- Create: `test/resource-icons.js`
- Modify: `build.js:10-14`
- Modify: `js/render.js:49-58, 375-431, 721-817`
- Modify: `js/icon-picker.js:146-149, 161-170, 235-245`
- Modify: `test/icons.js:9-42`
- Modify: `package.json:6-10`
- Modify: `css/components.css`
- Generate: `index.html`
- Generate: `public/index.html`

**Interfaces:**
- Consumes: state objects already passed to `Render`, `Icon.get(name)`, existing `replaceableIcon` markup convention, and `IconPicker.decorate(root)`.
- Produces `window.ResourceIcon`:
  - `normalizeName(value: unknown): string`
  - `baseCropName(value: unknown): string`
  - `key(value: unknown): string`
  - `fallback(value: unknown): string`
  - `knownNames(state: object): string[]`
  - `tokens(materials: string, state: object): Array<{ type: 'text', value: string } | { type: 'resource', value: string, key: string }>`
  - `markup(name: string, options?: { className?: string, label?: string, group?: string }): string`
  - `materialMarkup(materials: string, state: object): string`
- Resource targets set both `data-icon-target` and `data-icon-shared` to the same `resource:<normalized-name>` key and add `data-icon-force-shared="true"` so the picker cannot create conflicting local overrides.

- [ ] **Step 1: Write exact resource normalization and tokenization tests**

Create `test/resource-icons.js`, evaluate `js/icons.js` and `js/resource-icon.js`, and test:

```js
ok(ResourceIcon.normalizeName('  晨露   麦粉 ') === '晨露 麦粉', 'whitespace is normalized');
ok(ResourceIcon.baseCropName(' 春小麦种子 ') === '春小麦', 'seed suffix maps to base crop');
ok(ResourceIcon.baseCropName('晨露麦粉') === '晨露麦粉', 'non-seed name is not fuzzily shortened');
ok(ResourceIcon.key('春小麦种子') === 'resource:春小麦', 'seed and crop share one key');
ok(ResourceIcon.key('晨露麦粉') !== ResourceIcon.key('晨露麦'), 'similar names remain distinct');
```

Use a state with inventory `晨露麦粉` and `野山蜜`, seed catalog `春小麦种子`, normal crop `春小麦`, and magic crop `温感薄荷`. Assert `knownNames()` returns a deduplicated longest-first array containing all five display identities and base names.

For `materials = '晨露麦粉、野山蜜、未知香料'`, assert tokens preserve the exact concatenated source and identify only the two known names. Add overlapping names `麦` and `晨露麦粉` and assert longest match wins.

Assert generated resource markup is escaped and includes:

```text
data-icon-target="resource:晨露麦粉"
data-icon-shared="resource:晨露麦粉"
data-icon-force-shared="true"
data-icon-preset-group="资源"
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node test/resource-icons.js`

Expected: FAIL because `js/resource-icon.js` and `ResourceIcon` do not exist.

- [ ] **Step 3: Implement safe, exact resource helpers**

Implement `normalizeName()` with `String(value ?? '').trim().replace(/\s+/g, ' ')`. Implement `baseCropName()` by stripping only a terminal `种子` suffix and trimming again. Return an empty key for an empty normalized name.

`knownNames(state)` collects:

- `Object.keys(state.旅店.库存 || {})`;
- each `Object.keys(state.农牧.种子图鉴 || {})` plus its `baseCropName()`;
- `作物` from every record in `农田网格` and `魔法农田网格`.

Deduplicate exact normalized names and sort by descending string length, then locale order for stable ties.

`tokens()` scans left-to-right. At each position choose the first known name whose exact codepoint sequence starts there. Emit text tokens for unmatched spans and resource tokens with `key(value)`. Merge adjacent text tokens. Verify `tokens.map(t => t.value).join('') === materials` before returning; otherwise return one text token containing the original string.

Use an internal `escapeHtml()` for every attribute/text interpolation. `markup()` returns a semantic `<button type="button" class="resource-icon ...">` containing a `[data-icon-slot]`; it does not bind its own click handler because the existing picker uses context menu, long press, and keyboard context-menu access. Add visible helper copy via `title="右键、长按或按菜单键更换同名资源图标"`.

`materialMarkup()` emits a `<span class="recipe-materials">`; resource tokens become `<span class="recipe-material">${markup(...)}<span>name</span></span>`, and text tokens remain escaped text.

- [ ] **Step 4: Update picker to enforce one shared resource binding**

Update `presetGroupsFor()` to accept `资源` and return `['作物', '农牧', '通用']` for that scope unless an explicit `资源` icon catalog is added. Do not require a new icon catalog group.

When `data-icon-force-shared="true"` and `data-icon-shared` exists:

- render one checked radio with value `shared` and copy `所有同名资源“<name>”`;
- never render a target-only radio;
- save and restore only `data-icon-shared`.

Keep existing map/farm target-vs-shared behavior unchanged.

- [ ] **Step 5: Integrate resource markup into Render**

Replace inventory icon markup in `renderInventory()` with:

```js
ResourceIcon.markup(name, {
  className: 'item-row__icon',
  label: `库存物品 ${name}`,
  group: '资源'
})
```

Call `decorateIcons(container)` after `Icon.render(container)`.

For seed cards, use `ResourceIcon.markup(name, ...)`; `key('春小麦种子')` maps to `resource:春小麦`, so the matching crop automatically shares it. Replace the current `crop:` shared key in normal/magic farm cells and farm details with `ResourceIcon.markup(crop, ...)` while retaining coordinate-specific wrapper behavior only where it is needed for the whole plot. The resource icon itself must always carry the shared resource key.

Replace the plain `${r.材料}` recipe material output with `ResourceIcon.materialMarkup(r.材料 || '随性发挥', Render.state)`. This changes display only; preserve click-to-compose and all recipe data/price/facility behavior.

Add `resource-icon` to `build.js` after `icons` and before `render`.

- [ ] **Step 6: Extend icon contract tests**

In `test/icons.js`, add assertions that `resource-icon.js` is in the build before `render`, `data-icon-force-shared` is handled by the picker, resource markup appears in inventory/seed/farm/recipe paths, and existing map/farm/livestock key assertions still pass.

- [ ] **Step 7: Add resource visual styles**

In `css/components.css`, make `.resource-icon` a 44×44px semantic button on touch-capable layouts, 34×34px in dense desktop inventory rows, with a token-backed surface, hover lift, focus ring, active press, and custom-image containment. Style `.recipe-materials` as inline flex-wrap and `.recipe-material` as a compact readable token without changing source punctuation.

- [ ] **Step 8: Build and run focused GREEN tests**

Run:

```bash
node build.js
node test/resource-icons.js
node test/icons.js
node test/farm.js
node test/assets.js
```

Expected: all tests pass; existing map/farm/asset behavior remains intact.

- [ ] **Step 9: Commit the shared resource icon system**

```bash
git add js/resource-icon.js js/render.js js/icon-picker.js test/resource-icons.js test/icons.js build.js package.json css/components.css index.html public/index.html
git commit -m "feat: share resource icon choices"
```

---

### Task 4: Apply the comprehensive visual-system refresh without changing behavior

**Files:**
- Modify: `css/tokens.css`
- Modify: `css/base.css`
- Modify: `css/layout.css`
- Modify: `css/components.css`
- Modify: `css/animations.css`
- Modify: `src/template.html` only for decorative noninteractive spans/classes if CSS alone cannot express the approved art direction
- Modify: `test/layout.js`
- Modify: `test/smoke.js` only for stable semantic/class assertions, not screenshot snapshots
- Generate: `index.html`
- Generate: `public/index.html`

**Interfaces:**
- Consumes: every existing class/ID/data attribute from the current template and renderer.
- Produces: visual-only CSS. No JavaScript interfaces, event names, IDs, DOM targets, panel order, or request-state semantics change.

- [ ] **Step 1: Add failing visual-contract tests**

Extend `test/layout.js` with assertions for:

```js
ok(/\.title-screen\s*\{[^}]*min-height:\s*(100svh|100dvh)/.test(CSS), 'title owns an immersive viewport');
ok(/\.prologue__measure\s*\{[^}]*max-width:\s*72ch/.test(CSS), 'prologue reading measure is capped');
ok(/\.bub__body\s*>\s*\*\s*\{[^}]*max-width:\s*(66ch|72ch)/.test(CSS), 'story reading measure is capped');
ok(/min-height:\s*44px/.test(CSS), 'touch controls expose 44px targets');
ok(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(CSS), 'reduced-motion override exists');
ok(/--color-title-sky:/.test(CSS) && /--color-parchment-warm:/.test(CSS), 'approved title and letter tokens exist');
```

Keep all existing layout assertions for 900px equal pages, immersive height, mobile single-page state, VisualViewport, keyboard mode, and scrollbars.

In `test/smoke.js`, assert stable semantics only: tabs remain eight and in the same data-tab order; HUD IDs, composer, dock actions, settings/fullscreen/theme controls, all panels, and request status remain present.

- [ ] **Step 2: Run visual contract tests and verify RED**

Run: `node build.js && node test/layout.js`

Expected: new token/title/prologue/measure/touch assertions fail while existing layout assertions still pass.

- [ ] **Step 3: Expand project-specific design tokens**

In `css/tokens.css`, retain all current token names and add semantic tokens instead of hardcoded component colors:

```css
--color-title-sky: hsl(211 42% 18%);
--color-title-horizon: hsl(35 58% 54%);
--color-title-forest: hsl(154 35% 12%);
--color-parchment-warm: hsl(42 58% 88%);
--color-parchment-highlight: hsl(43 68% 95%);
--color-ellie: hsl(198 38% 58%);
--color-ink-gold: hsl(39 60% 48%);
--surface-glass: hsl(43 60% 95% / 0.72);
--shadow-letter: 0 16px 38px hsl(28 35% 18% / 0.2), 0 3px 8px hsl(28 35% 18% / 0.12);
--shadow-book: 0 30px 80px hsl(28 36% 12% / 0.2), 0 8px 24px hsl(28 36% 12% / 0.12);
```

Define corresponding night values under `[data-theme="night"]`. Keep all current design-token consumers valid.

- [ ] **Step 4: Build the 山谷暮光 title artwork in CSS**

Use layered gradients and pseudo-elements for sky, horizon, mountains, lake, mist, inn, windows, tree, grass, fireflies, paper grain, and vignette. The title scene uses the full available viewport but keeps text in a centered max-width container. Do not load external images.

Create hover/focus/active states for the start button, link, and title controls. Ensure the link remains readable and does not resemble the primary CTA. At 375px, the title stacks vertically with `clamp()` typography and no horizontal overflow.

- [ ] **Step 5: Refresh the book, tabs, HUD, journal, composer, and dock**

Update existing selectors rather than introducing parallel components:

- `.book`, `.book__spine`, `.page`, `.page::before` — depth, paper thickness, stitching, page-edge lighting;
- `.tabs`, `.tab`, `.tab.is-active` — consistent icon weight, paper-tab lift, ink underline;
- `.hud*` — today plaque, centered inn identity, clearer funds/prestige hierarchy;
- `.journal__stream`, `.bub*`, `.choice*` — restrained journal pages, 66–72ch reading width, action-slip choices;
- `.composer*`, `.request-status*`, `.dock*` — journal-line input, animated focus edge, ink-dot loading, refined status/action controls.

Do not rename any selector consumed by JavaScript or tests. Preserve `.panel.is-active`, body immersive classes, and all responsive rules.

- [ ] **Step 6: Refresh all reusable cards and overlays**

Unify `.card`, `.building`, `.item-row`, `.recipe`, `.staff-card`, `.visitor-card`, `.quest-card`, farm/livestock cards, `.empty-state`, `.notice`, settings, icon picker, daily modal, context menu, and toast styles around the same surface/border/depth tokens. Preserve semantic success/warning/danger colors and AA contrast.

Every clickable surface gets hover, focus-visible, active, and disabled states. Async status uses the existing request status and typing nodes; add a paper/ink skeleton only where the app already waits, without inventing new async operations.

- [ ] **Step 7: Add guarded motion and reduced-motion overrides**

In `css/animations.css`, add `valleyReveal`, `mistDrift`, `windowKindle`, `fireflyFloat`, `titleInk`, `buttonShimmer`, and refined `inkBleed`. Place all animation assignments inside `@media (prefers-reduced-motion: no-preference)`. In the existing reduce block, set animation and transition durations to 1ms and remove transforms that could leave content offset.

- [ ] **Step 8: Build and run layout/smoke tests for GREEN**

Run:

```bash
node build.js
node test/layout.js
node test/smoke.js
node test/iframe.js
```

Expected: new visual-contract assertions and every preserved layout/behavior assertion pass.

- [ ] **Step 9: Commit the visual refresh**

```bash
git add css/tokens.css css/base.css css/layout.css css/components.css css/animations.css src/template.html test/layout.js test/smoke.js index.html public/index.html
git commit -m "feat: refresh the pastoral journal UI"
```

---

### Task 5: Integrate title entry into all existing smoke and interaction flows

**Files:**
- Modify: `test/smoke.js`
- Modify: `test/iframe.js`
- Modify: `test/staff.js` only if it loads the built page and now needs to enter first
- Modify: other page-loading tests only when a real title-gate failure is observed
- Modify: `js/intro.js` and `js/app.js` only for verified integration defects
- Generate: `index.html`
- Generate: `public/index.html`

**Interfaces:**
- Consumes: `#titleStart`, `pastoral:intro-ready`, and existing app APIs.
- Produces: reusable test helper `enterGame(win, doc)` in each standalone test file that needs it; do not create a shared test framework solely for this task.

- [ ] **Step 1: Update the floor-0 smoke fixture to test both new-game and saved-game branches**

In `test/smoke.js`, add:

```js
async function startTitle(win, doc) {
  const button = doc.getElementById('titleStart');
  ok(!!button, 'title start button exists');
  button.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(500);
}
```

Split the current floor-0 case:

- a new-game chat containing only floor 0 with message `` ``` ``` ``; start title, assert prologue content, then exercise the existing panels/composer after the book becomes available;
- the existing three-message saved chat; before start assert title visible and book inert, click start, assert no visible prologue and existing three bubbles/choices/MVU state remain exactly as before.

For every later fixture that exercises controls, call `startTitle()` before clicking those controls. The nonzero host-floor self-destruction case must not click start and must still end with an empty body.

- [ ] **Step 2: Update iframe integration to enter before testing fullscreen**

After loading the card in `test/iframe.js`, assert title metadata exists, click `#titleStart`, wait for the resume path because `getLastMessageId()` is 2, and only then test fullscreen/mobile page switching. Keep all parent-page host takeover assertions unchanged.

- [ ] **Step 3: Run the affected integration suite and diagnose real failures**

Run:

```bash
node build.js
node test/intro.js
node test/smoke.js
node test/iframe.js
node test/staff.js
node test/farm.js
```

Expected: all pass. If a test fails before entry, update only its test setup. If an existing action fails after entry, fix the smallest verified cause in `intro.js` or `app.js`; do not bypass the title gate or alter the action.

- [ ] **Step 4: Verify no duplicate listeners or timers**

Add counters in one smoke fixture, click Start twice rapidly, and assert:

- the second click is ignored while `aria-busy="true"`;
- `MVU.init()` and `Chat.init()` effects still occur once;
- only one `#prologue` tree exists;
- only one `pastoral:intro-ready` event fires;
- the existing chat poll does not create duplicate bubbles.

- [ ] **Step 5: Commit integration coverage**

```bash
git add test/smoke.js test/iframe.js test/staff.js js/intro.js js/app.js index.html public/index.html
git commit -m "test: cover title entry integration"
```

Stage only files that actually changed.

---

### Task 6: Perform full automated and browser verification, then deliver

**Files:**
- Modify only files needed to fix verified regressions.
- Generate: `index.html`
- Generate: `public/index.html`
- Do not modify or stage `.superpowers/`, `.playwright-mcp/`, planning logs, split references, or user-owned reference text.

**Interfaces:**
- Consumes the complete feature.
- Produces a verified self-contained build with no known functional regressions.

- [ ] **Step 1: Run script syntax checks**

Run:

```bash
node --check js/intro.js
node --check js/resource-icon.js
node --check js/render.js
node --check js/icon-picker.js
node --check js/app.js
```

Expected: every command exits 0 without output.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: build succeeds and every test script reports all checks passing, including intro, resource icons, money, rules, settings, MVU, API, assets, icons, staff, farm, smoke, iframe, and layout.

- [ ] **Step 3: Verify build reproducibility and generated-file parity**

Run:

```bash
node build.js
git diff --exit-code -- public/index.html index.html || true
node -e "const fs=require('fs'); const a=fs.readFileSync('index.html'); const b=fs.readFileSync('public/index.html'); if(!a.equals(b)) process.exit(1); console.log('generated pages match')"
```

Expected: `generated pages match`. The git diff may exist because generated files are intended outputs, but the two generated pages must be byte-identical.

- [ ] **Step 4: Check whitespace and protected workspace boundaries**

Run:

```bash
git diff --check
git status --short
git diff --name-only HEAD~5..HEAD
```

Expected: no whitespace errors. Review the file list manually and confirm no unrelated pre-existing deletion/reference/planning/temp path was staged or committed.

- [ ] **Step 5: Launch the app and verify real rendering at three widths**

Run the project with `npm run dev`, then use the configured browser tooling against the local URL.

At **375×812**:

- title fits without horizontal scrolling;
- Start, Discord link, and later mobile page controls are at least 44px;
- floor-0 start shows the opening from the timestamp through the quest reward;
- letter, route, Ellie accent, morning section, and quest card are readable;
- scrolling naturally reaches the book;
- mobile immersive mode still shows one page at a time and keyboard mode still hides the dock.

At **768×1024**:

- title hierarchy and valley composition remain balanced;
- prologue line length and side padding are comfortable;
- cards and resource material tokens wrap without overlap.

At **1440×1000**:

- book is capped at 1200px;
- pages remain equal width/height;
- story text stays within 66–72ch;
- title focal hierarchy is game title → Start → author/card link;
- HUD, cards, dialogs, icon picker, context menu, and toasts share the refreshed visual language.

- [ ] **Step 6: Verify interaction and accessibility in the browser**

Using keyboard only:

- Tab reaches Start and the card-floor link in logical order;
- Enter activates Start; Space activates buttons; visible focus is never lost;
- Shift+F10 or ContextMenu opens resource icon selection;
- Escape closes dialogs and existing context menus;
- title exit focuses the prologue heading on floor 0 and the book on a saved chat.

Emulate `prefers-reduced-motion: reduce` and verify mist, fireflies, route drawing, and title/parchment transforms do not continuously animate. Check browser console for errors and network requests; there must be no external artwork/font dependency.

- [ ] **Step 7: Fix only verified failures and rerun the relevant command plus `npm test`**

For each failure, first reproduce with the narrowest test or browser action, make the smallest change, rerun that focused check, then rerun `npm test`. Do not perform unrelated refactoring during verification.

- [ ] **Step 8: Final commit and push**

If verification produced additional changes:

```bash
git add <only-the-verified-feature-files>
git commit -m "fix: polish title and prologue integration"
```

Then inspect `git status --short`, preserve all unrelated user changes, and push the verified feature commits according to the repository's configured branch workflow. Do not force-push.

---

## Plan Self-Review

- **Spec coverage:** Tasks 1–2 cover title, exact floor decision, complete forced opening, semantic decoration, no-write behavior, focus, standalone/API-error fallback. Task 3 covers all same-name resource displays and local picker persistence. Task 4 covers the full visual refresh, responsive layout, accessibility, motion, and unchanged behavior. Tasks 5–6 cover integration, nonzero-floor host behavior, regression, real browser widths, and delivery boundaries.
- **Placeholder scan:** No TBD/TODO/“implement later” steps remain. Every implementation step names exact functions, selectors, data attributes, algorithms, assertions, and commands.
- **Interface consistency:** `Intro.detectEntry`, `Intro.init`, `Intro.start`, `Intro.renderPrologue`, `Intro.revealExperience`, and `ResourceIcon` method names are consistent across producers, consumers, tests, and integration steps. Resource bindings use exactly `resource:<normalized-name>` and forced shared scope throughout.
- **Scope:** The title/prologue, visual refresh, and resource-icon interaction form one integrated entry-and-interface release and share the same template/build/test boundary; they remain separately reviewable through Tasks 1–4.
