# Cross-Platform Variable Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Termux and Windows build identical single-copy variable requests, isolate normal/endday presets, and enforce the approved normal → deterministic → endday settlement semantics.

**Architecture:** Every variable request takes one immutable stage snapshot, compiles the selected preset and task into `generateRaw.ordered_prompts`, validates that the task appears exactly once at the end, and sends only that structure. The endday controller treats single API story MVU as its normal stage, explicitly runs the second API normal stage only in multi mode, then deterministic settlement, then the endday stage with its own independent snapshot.

**Tech Stack:** Browser JavaScript IIFEs, TavernHelper `generateRaw/getPreset/getPresetNames`, SillyTavern/MVU APIs, JSDOM tests, Node.js build/test scripts.

## Global Constraints

- Do not change main-story `/send` + `/trigger await=true` behavior.
- Do not call `generate()` or use `injects` for variable requests.
- Do not create, modify, load, or delete Tavern presets or worldbook entries.
- Do not require worldbook variable-rule or output-format entries.
- Do not log API keys, complete prompts, or complete MVU snapshots.
- Preserve unknown keys in `mrfz_settings`.
- Keep single API endday to one silent endday request: story MVU is its normal stage.
- Multi API normal-stage failure continues deterministic and endday stages, but the final result is partial.
- Preserve existing deterministic settlement idempotency and delayed-write relocking.
- Build output remains self-contained; `index.html` and `public/index.html` must match after `node build.js`.

---

### Task 1: Migrate variable-preset settings to deterministic assembly

**Files:**
- Modify: `test/settings.js`
- Modify: `js/settings.js:26-39,79-89`

**Interfaces:**
- Consumes: existing `Settings.normalize(value)`, `Settings.save(patch)`, `Settings.load()`.
- Produces: `variablePresets.normal/endday` without a runtime-selectable `assembly`; legacy values normalize to deterministic compile behavior without clearing other fields.

- [ ] **Step 1: Write failing settings tests**

Add assertions that legacy `assembly: 'inject'` no longer survives as an active strategy, normal/endday keep independent mode/preset/context/temperature values, and unknown fields remain intact:

```js
const migrated = S.normalize({
  旧字段: '保留',
  variablePresets: {
    normal: { mode: 'fixed', presetName: '日常A', assembly: 'inject', temperature: 0.2 },
    endday: { mode: 'fixed', presetName: '归寝B', assembly: 'compile', temperature: 0.4 }
  }
});
ok(!Object.prototype.hasOwnProperty.call(migrated.variablePresets.normal, 'assembly'),
  '旧 inject 组装设置迁移后不再参与运行');
ok(migrated.variablePresets.normal.presetName === '日常A'
  && migrated.variablePresets.endday.presetName === '归寝B', '迁移不混淆两阶段预设');
ok(migrated.旧字段 === '保留', '迁移保留未知字段');
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node test/settings.js`

Expected: FAIL because `normalizeVariablePreset()` currently preserves/normalizes `assembly`.

- [ ] **Step 3: Remove the runtime assembly setting**

In `variablePresetDefaults()`, remove `assembly`. In `normalizeVariablePreset()` explicitly remove legacy `assembly` from the normalized managed object while retaining all unrelated unknown keys:

```js
const preset = merge(variablePresetDefaults(), object(value));
delete preset.assembly;
preset.mode = ['none', 'current', 'fixed'].includes(preset.mode) ? preset.mode : 'none';
```

Do not remove `mode`, `presetName`, `blockDepthEntries`, `temperature`, or `context`.

- [ ] **Step 4: Run settings tests and confirm GREEN**

Run: `node test/settings.js`

Expected: all settings assertions pass.

- [ ] **Step 5: Commit the settings migration**

```bash
git add js/settings.js test/settings.js
git commit -m "refactor: migrate variable requests to deterministic assembly

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Build immutable stage snapshots and validate compiled requests

**Files:**
- Modify: `test/api.js`
- Modify: `js/api.js:102-160,181-374,604-626`

**Interfaces:**
- Consumes: `Settings.load()`, `Settings.promptFor(kind, config)`, `getPreset()`, `getPresetNames()`, `Rules.outputFormat()`.
- Produces:
  - `createStageSnapshot(kind, config): FrozenStageSnapshot`
  - `compileVariableRequest(snapshot, taskPrompt): { orderedPrompts, diagnostics }`
  - `diagnostics = { stage, mode, preset, transport, messages, taskCount, taskLast, taskFingerprint }`

`FrozenStageSnapshot` shape:

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

- [ ] **Step 1: Write failing snapshot-isolation tests**

In `test/api.js`, define distinct normal/endday settings and assert independent frozen snapshots:

```js
const splitSettings = {
  apiMode: 'multi',
  prompts: { normal: 'NORMAL_GUIDE_A', endday: 'ENDDAY_GUIDE_B' },
  variablePresets: {
    normal: { mode: 'fixed', presetName: '日常A', context: { chatHistory: true }, temperature: 0.1 },
    endday: { mode: 'fixed', presetName: '归寝B', context: { chatHistory: false }, temperature: 0.3 }
  },
  secondApi: settingsState.secondApi
};
const normalSnapshot = win.ApiEngine.createStageSnapshot('normal', splitSettings);
const enddaySnapshot = win.ApiEngine.createStageSnapshot('endday', splitSettings);
ok(Object.isFrozen(normalSnapshot) && Object.isFrozen(normalSnapshot.context), '阶段快照不可变');
ok(normalSnapshot.presetName === '日常A' && /NORMAL_GUIDE_A/.test(normalSnapshot.guide), '日常快照只读取日常设置');
ok(enddaySnapshot.presetName === '归寝B' && /ENDDAY_GUIDE_B/.test(enddaySnapshot.guide), '归寝快照只读取归寝设置');
```

- [ ] **Step 2: Write failing single-copy compiler tests**

Test `none`, current, and fixed modes. For fixed A/B presets, verify the final task exists exactly once, is last, disabled/unused entries remain excluded, and normal/endday preset names never cross:

```js
const compiled = win.ApiEngine.compileVariableRequest(normalSnapshot, 'UNIQUE_TASK_NORMAL');
const rolePrompts = compiled.orderedPrompts.filter((item) => item && typeof item === 'object');
ok(rolePrompts.filter((item) => item.content === 'UNIQUE_TASK_NORMAL').length === 1,
  '变量任务在编译结果中严格出现一次');
ok(rolePrompts[rolePrompts.length - 1].content === 'UNIQUE_TASK_NORMAL', '变量任务严格位于末位');
ok(compiled.diagnostics.taskCount === 1 && compiled.diagnostics.taskLast === true,
  '编译诊断确认唯一末位任务');
ok(compiled.diagnostics.preset === '日常A', '诊断记录日常阶段自己的预设');
```

Also test a deliberately malformed internal result by exposing/using `validateCompiledRequest()` or a test-only input path: zero task and duplicate task both throw before generation.

- [ ] **Step 3: Run API tests and confirm RED**

Run: `node test/api.js`

Expected: FAIL because snapshot/compiler/diagnostics APIs do not exist.

- [ ] **Step 4: Implement stage snapshots**

Add `createStageSnapshot(kind, config)` near `variablePresetConfig()`:

```js
function createStageSnapshot(kind, config) {
  const key = kind === 'endday' ? 'endday' : 'normal';
  const cfg = config || Settings.load();
  const selected = variablePresetConfig(key, cfg);
  const mode = ['none', 'current', 'fixed'].includes(selected.mode) ? selected.mode : 'none';
  const context = Object.freeze(Object.assign({}, selected.context || {}));
  return Object.freeze({
    kind: key,
    mode,
    presetName: mode === 'current' ? 'in_use' : String(selected.presetName || '').trim(),
    context,
    blockDepthEntries: selected.blockDepthEntries !== false,
    temperature: Number.isFinite(Number(selected.temperature)) ? Number(selected.temperature) : 0,
    guide: updateGuide(key, cfg)
  });
}
```

Resolve a missing fixed preset once while constructing/compiling the snapshot; retain existing warning and none fallback behavior.

- [ ] **Step 5: Implement one stable task fingerprint**

Use a deterministic non-cryptographic hash that does not expose task text:

```js
function fingerprint(text) {
  let hash = 2166136261;
  const value = String(text || '');
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
```

- [ ] **Step 6: Refactor `compilePreset` into `compileVariableRequest`**

The function accepts only a stage snapshot and task text. It resolves the preset from the snapshot, compiles enabled prompts in order, filters placeholders through `snapshot.context`, and appends exactly one task object:

```js
function compileVariableRequest(snapshot, taskPrompt) {
  const task = String(taskPrompt || '');
  if (!task.trim()) throw new Error('变量更新任务消息为空，拒绝发送');
  const orderedPrompts = snapshot.mode === 'none'
    ? orderedPromptsFromContext(snapshot.context)
    : compilePresetPrompts(snapshot);
  orderedPrompts.push({ role: 'user', content: task });
  const taskCount = orderedPrompts.filter((item) => item && typeof item === 'object' && item.content === task).length;
  const last = orderedPrompts[orderedPrompts.length - 1];
  const taskLast = !!last && typeof last === 'object' && last.content === task;
  if (taskCount !== 1 || !taskLast) throw new Error(`变量请求组装不变量失败：taskCount=${taskCount}, taskLast=${taskLast}`);
  return {
    orderedPrompts,
    diagnostics: {
      stage: snapshot.kind,
      mode: snapshot.mode,
      preset: snapshot.mode === 'none' ? 'none' : snapshot.presetName,
      transport: 'generateRaw',
      messages: orderedPrompts.length,
      taskCount,
      taskLast,
      taskFingerprint: fingerprint(task)
    }
  };
}
```

For none mode, do not append `'user_input'`; append the same literal role task object used by preset modes. This makes every mode share one delivery contract.

- [ ] **Step 7: Update `buildPrompt` to consume the snapshot guide**

Permit `context.snapshot`; when supplied, use `snapshot.kind` and `snapshot.guide` instead of re-reading settings:

```js
const snapshot = context.snapshot;
const kind = snapshot ? snapshot.kind : (context.purpose === 'endday' ? 'endday' : 'normal');
const guide = context.rules || (snapshot ? snapshot.guide : updateGuide(kind, config));
```

This prevents endday from seeing a later normal-setting read.

- [ ] **Step 8: Export the new pure helpers and run tests**

Export `createStageSnapshot`, `compileVariableRequest`, and `fingerprint` from `ApiEngine`. Retain `compilePreset` only if UI/tests still need it; otherwise remove it after Task 4 migrates preview.

Run: `node test/api.js`

Expected: snapshot and compiler tests pass; transport tests may still fail until Task 3.

- [ ] **Step 9: Commit snapshot/compiler work**

```bash
git add js/api.js test/api.js
git commit -m "refactor: isolate variable request stage compilation

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Replace `generate + injects` with one `generateRaw` transport

**Files:**
- Modify: `test/api.js`
- Modify: `js/api.js:335-433,475-501,568-597`

**Interfaces:**
- Consumes: `createStageSnapshot(kind, config)`, `compileVariableRequest(snapshot, taskPrompt)` from Task 2.
- Produces: `generateVariable(taskPrompt, snapshot, transportConfig): Promise<string | GenerateToolCallResult>`; every production variable request uses exactly one `generateRaw()` call input.

- [ ] **Step 1: Write the Windows/Termux regression test**

Model two host behaviors, but assert production sends neither `user_input` nor `injects` as task carriers:

```js
const sent = [];
win.generate = async () => { throw new Error('变量请求不得调用 generate'); };
win.generateRaw = async (config) => {
  sent.push(config);
  return okReply;
};
await win.ApiEngine.callSecondApiForVariable({ baseline, purpose: 'normal' });
ok(sent.length === 1, '变量请求只发送一次');
ok(!sent[0].injects, '变量请求不使用宿主差异化 injects');
ok(!sent[0].user_input, '任务不再通过 user_input 重复发送');
const taskEntries = sent[0].ordered_prompts.filter((x) => x && typeof x === 'object' && /NORMAL_GUIDE_A/.test(x.content));
ok(taskEntries.length === 1 && sent[0].ordered_prompts.at(-1) === taskEntries[0],
  'Termux/Windows 均只收到唯一末位任务');
```

- [ ] **Step 2: Write per-stage diagnostics tests**

Capture `console.info` or a new `pastoral:variable-request` event. Assert normal A and endday B report distinct preset names/fingerprints without prompt text or Key:

```js
ok(diags.some((d) => d.stage === 'normal' && d.preset === '日常A'), '诊断记录日常预设 A');
ok(diags.some((d) => d.stage === 'endday' && d.preset === '归寝B'), '诊断记录归寝预设 B');
ok(!/secret|NORMAL_GUIDE_A|ENDDAY_GUIDE_B/.test(JSON.stringify(diags)), '诊断不泄露密钥或提示词全文');
```

- [ ] **Step 3: Run API tests and confirm RED**

Run: `node test/api.js`

Expected: FAIL because inject mode still calls `generate` and duplicates task carriers.

- [ ] **Step 4: Replace `generateVariable` signature and body**

Remove mode/assembly branches. It must compile and call only `generateRaw`:

```js
async function generateVariable(taskPrompt, snapshot, config) {
  if (typeof generateRaw !== 'function') {
    throw new Error('当前环境缺少 generateRaw，无法发送确定性变量请求');
  }
  const compiled = compileVariableRequest(snapshot, taskPrompt);
  logVariableRequest(compiled.diagnostics);
  const request = Object.assign({}, config, {
    ordered_prompts: compiled.orderedPrompts,
    max_chat_history: 0
  });
  delete request.user_input;
  delete request.injects;
  if (request.custom_api) {
    request.custom_api = Object.assign({}, samplingOverrides(snapshot), request.custom_api);
  }
  const overrides = buildOverrides(snapshot);
  if (overrides) request.overrides = Object.assign({}, overrides, request.overrides);
  return generateRaw(request);
}
```

Delete the `generate()` branch and all generated `injects` config.

- [ ] **Step 5: Add safe diagnostics with runtime versions**

Use feature detection:

```js
function safeVersion(fnName) {
  try { return typeof window[fnName] === 'function' ? String(window[fnName]()) : 'unknown'; }
  catch (e) { return 'unknown'; }
}
function logVariableRequest(diagnostics) {
  const detail = Object.assign({}, diagnostics, {
    tavernHelperVersion: safeVersion('getTavernHelperVersion'),
    tavernVersion: safeVersion('getTavernVersion')
  });
  console.info('[Pastoral][VariableRequest]', detail);
  window.dispatchEvent(new CustomEvent('pastoral:variable-request', { detail }));
}
```

Only diagnostics metadata is emitted.

- [ ] **Step 6: Update all callers to freeze the stage before building the prompt**

`callSecondApiForVariable(context)`:

```js
const cfg = Settings.load();
const snapshot = createStageSnapshot(context.purpose, cfg);
const prompt = buildPrompt(Object.assign({}, context, { config: cfg, snapshot }));
// each pass:
generateVariable(pass === 0 ? prompt : repairPrompt(prompt, raw), snapshot, {
  generation_id: id,
  should_stream: false,
  should_silence: true,
  custom_api: { apiurl: api.url, key: api.key, model: api.model, source: 'openai' }
});
```

`callMainApiForDaily(context)` must create one endday snapshot and reuse it for both initial and repair passes.

`testSecondApi(candidate)` must use a normal snapshot but compile the connection-test text once through the same transport.

- [ ] **Step 7: Remove obsolete assembly functions and constants**

Delete production branches/comments for `assembly === 'inject'`, obsolete `resolvePreset` assembly output, and any helper only used to prepare injection. Keep `buildOverrides` because it still prevents hidden worldbook/author-note content.

- [ ] **Step 8: Run API tests and confirm GREEN**

Run: `node test/api.js`

Expected: all API tests pass; no test expects production `generate()`/`injects`.

- [ ] **Step 9: Commit deterministic transport**

```bash
git add js/api.js test/api.js
git commit -m "fix: send one deterministic variable task on every host

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Make endday stages explicit and preserve partial outcomes

**Files:**
- Modify: `test/api.js`
- Modify: `js/chat.js:370-480`
- Modify: `js/api.js:456-552,599-602`

**Interfaces:**
- Consumes: `ApiEngine.processAfterMain(context)`, `ApiEngine.processEndday(context)`, `MVU.settleForWrite`, `MVU.writeWithTimeout`, `MVU.enforceAndWrite`.
- Produces: stage-result objects and an endday summary containing independent `normalError`, `enddayError`, and `writeError` values.

Stage result shape:

```js
{
  stage: 'normal' | 'deterministic' | 'endday' | 'enforce',
  stageId: string,
  ok: boolean,
  source: 'main-story' | 'main-api' | 'second-api' | 'script',
  snapshot: object | null,
  error: Error | null
}
```

- [ ] **Step 1: Write failing distinct-preset sequence tests**

Set normal preset A and endday preset B, intercept `pastoral:variable-request`, and execute a multi API endday request. Assert exact ordering and presets:

```js
ok(stages.join('>') === 'normal(A)>deterministic>initial-write>endday(B)>enforce',
  '多 API 归寝使用日常 A 后再使用归寝 B');
```

For single API:

```js
ok(stages.join('>') === 'main-story-as-normal>deterministic>initial-write>endday(B)>enforce',
  '单 API 复用主剧情日常结果且只额外执行归寝 B');
ok(normalSilentCalls === 0, '单 API 不额外静默调用日常更新');
```

- [ ] **Step 2: Write failing normal-stage failure continuation test**

Make multi API `processAfterMain()` fail. Assert deterministic and endday still execute; endday receives a fact marker; final summary is partial and includes the normal error:

```js
ok(stages.includes('deterministic') && stages.includes('endday(B)'), '日常失败后继续确定性与归寝阶段');
ok(/日常变量阶段失败.*不得猜测.*补算/.test(enddayContext.stageFacts), '归寝阶段收到禁止补算事实');
ok(summary.updateOk === false && /日常阶段/.test(summary.updateError), '日常失败使账簿标为部分完成');
```

- [ ] **Step 3: Run API tests and confirm RED**

Run: `node test/api.js`

Expected: FAIL because current `chat.js` ignores the normal-stage result and loses its error.

- [ ] **Step 4: Add stable stage result construction**

In `js/api.js`, make `processAfterMain()` and `processEndday()` return stage-labelled results with `source` values matching the design. Preserve existing caller fields (`summary`, `messageId`) for compatibility.

Use stage ids:

```js
function stageId(messageId, stage) {
  return `endday:${messageId}:${stage}`;
}
```

Do not rerun successful deterministic settlement; continue relying on existing `settleForWrite()` settlement ids.

- [ ] **Step 5: Refactor the endday branch in `handleUnifiedRequest` into named stage variables**

Use:

```js
let normalStage = null;
let deterministicStage = null;
let enddayStage = null;
let enforceStage = null;
```

For multi mode, capture `normalStage = await ApiEngine.processAfterMain(...)`. For single mode, synthesize:

```js
normalStage = {
  stage: 'normal',
  stageId: `endday:${messageId}:normal`,
  ok: true,
  source: 'main-story',
  snapshot: MVU.getDataSnapshot(),
  error: null
};
```

- [ ] **Step 6: Carry normal failure facts into endday**

Build:

```js
const stageFacts = normalStage && !normalStage.ok
  ? '日常变量阶段失败；不得猜测、补算或重复执行日常即时变化。错误：'
    + String(normalStage.error && normalStage.error.message || normalStage.error || '未知错误')
  : '';
```

Pass `stageFacts` to `ApiEngine.processEndday()`. Update `buildPrompt()` to add it under `【阶段执行事实】` without treating it as model-editable data.

- [ ] **Step 7: Compute final completion from every stage**

```js
const errors = [
  normalStage && normalStage.error ? '日常阶段：' + normalStage.error.message : '',
  enddayStage && enddayStage.error ? '归寝阶段：' + enddayStage.error.message : '',
  writeError ? '最终 MVU 写回失败：' + writeError.message : ''
].filter(Boolean);
const complete = !!normalStage.ok && !!enddayStage.ok && !writeError;
const updateError = errors.join('；');
```

Continue delayed-write relocking exactly as current code does.

- [ ] **Step 8: Keep retry scoped to the failed stage**

Ensure `lastFailure` includes `purpose`. Normal failures retry `processAfterMain`; endday failures retry `processEndday`. A retry never calls `settleForWrite` and therefore cannot repeat salary, maintenance, or crop progression.

- [ ] **Step 9: Run API tests and confirm GREEN**

Run: `node test/api.js`

Expected: sequence, distinct-preset, failure-continuation, timeout, and final-write tests all pass.

- [ ] **Step 10: Commit explicit endday pipeline**

```bash
git add js/api.js js/chat.js test/api.js
git commit -m "fix: isolate normal and endday settlement stages

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Remove assembly UI and expose deterministic diagnostics

**Files:**
- Modify: `test/smoke.js`
- Modify: `js/app.js:243-405,421-470`
- Modify: `css/components.css:332-350`

**Interfaces:**
- Consumes: `ApiEngine.createStageSnapshot`, `ApiEngine.compileVariableRequest`, `pastoral:variable-request` diagnostics.
- Produces: one deterministic preset UI and preview; no assembly selector.

- [ ] **Step 1: Write failing UI migration tests**

In `test/smoke.js`, assert:

```js
ok(!doc.querySelector('[name="normalAssembly"]') && !doc.querySelector('[name="enddayAssembly"]'),
  '界面不再提供跨平台不可靠的注入组装方式');
ok(/确定性消息列表/.test(doc.querySelector('[data-preset-effective="normal"]').textContent),
  '设置页说明所有请求采用确定性编译');
```

Set normal A/endday B and preview both. Assert each preview names its own preset, reports `taskCount=1`, and reports the task last.

- [ ] **Step 2: Run smoke test and confirm RED**

Run: `node build.js && node test/smoke.js`

Expected: FAIL because assembly selectors and inject copy remain.

- [ ] **Step 3: Remove assembly controls and persistence**

Delete `normalAssembly/enddayAssembly` fields, inject warning text, assembly event handlers, and `assembly` from the `stage(kind)` save payload. Replace with one static explanation:

```text
所有变量请求都编译为确定性消息列表：选中预设的启用条目按原顺序展开，前端更新任务严格只出现一次并位于末位。
```

- [ ] **Step 4: Rebuild preview on the production compiler**

`describeAssembly` must not independently recreate production behavior. Build a stage snapshot from draft settings, call `ApiEngine.compileVariableRequest(snapshot, task)`, and render diagnostics plus each item:

```text
阶段：日常更新
预设：日常A
传输：generateRaw
消息数：4
任务数量：1
任务末位：是
任务指纹：a1b2c3d4
```

Then list sequence/role/source/character count as before.

- [ ] **Step 5: Show last runtime diagnostics safely**

Listen for `pastoral:variable-request` while the settings modal is open. Update a small status block with stage, preset, messages, task count/last, and versions. Never show Key, task text, or snapshot data.

- [ ] **Step 6: Remove obsolete assembly CSS and run smoke tests**

Remove `[data-preset-assembly]` / `[data-assembly-note]` styles no longer used. Keep prompt-preview styles.

Run: `node build.js && node test/smoke.js`

Expected: all smoke tests pass.

- [ ] **Step 7: Commit UI migration**

```bash
git add js/app.js css/components.css test/smoke.js index.html
git commit -m "refactor: show deterministic variable request diagnostics

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Full verification, documentation, and deployment artifacts

**Files:**
- Modify: `progress.md`
- Modify: `index.html` (generated)
- Generated ignored artifact: `public/index.html`
- Reference: `docs/superpowers/specs/2026-08-01-cross-platform-variable-settlement-design.md`

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: verified self-contained build and an auditable progress record.

- [ ] **Step 1: Add a cross-host contract test fixture**

In `test/api.js`, run the same compiled request through two fake host adapters:

```js
const windowsHost = (cfg) => ({
  taskCopies: countTask(cfg.user_input) + countTask(cfg.injects) + countTask(cfg.ordered_prompts)
});
const termuxHost = (cfg) => ({
  taskCopies: countTask(cfg.user_input) + countTask(cfg.ordered_prompts) // ignores injects
});
ok(windowsHost(sentConfig).taskCopies === 1, 'Windows 合同只见一份任务');
ok(termuxHost(sentConfig).taskCopies === 1, 'Termux 合同只见一份任务');
```

- [ ] **Step 2: Run the full test suite once**

Run: `npm test`

Expected: every test file reports `✓ 全部通过`; no `✗` assertions.

- [ ] **Step 3: Run syntax checks**

Run:

```bash
for f in js/api.js js/app.js js/chat.js js/settings.js; do node --check "$f"; done
```

Expected: no output/errors.

- [ ] **Step 4: Rebuild and compare artifacts**

Run:

```bash
node build.js
diff index.html public/index.html
```

Expected: build succeeds; `diff` has no output.

- [ ] **Step 5: Run whitespace validation**

Run: `git diff --check`

Expected: no whitespace errors. CRLF conversion warnings are informational only.

- [ ] **Step 6: Update progress documentation**

Record in `progress.md`:

- exact root cause (`user_input + injects` duplicate carrier; no guaranteed preset user-input slot);
- deterministic `generateRaw` decision;
- single vs multi API approved endday semantics;
- distinct normal/endday preset proof;
- normal-failure partial-result behavior;
- test assertion count and verification commands;
- any real-host behavior that remains unverified locally.

- [ ] **Step 7: Commit final verification artifacts**

```bash
git add test/api.js progress.md index.html js/api.js js/app.js js/chat.js js/settings.js css/components.css test/settings.js test/smoke.js
git commit -m "test: verify cross-platform variable settlement flow

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

If no files remain after prior commits except `progress.md`/generated build, stage only those files.

- [ ] **Step 8: Push both current feature branch and main**

Run:

```bash
git push origin feat/data-backend-engine
git push origin feat/data-backend-engine:main
```

Expected: both refs advance to the same final commit. Do not stage or modify the user's existing unrelated deleted/untracked reference files.

- [ ] **Step 9: Verify remote state**

Run:

```bash
git fetch origin
git log --oneline -1 origin/main
git rev-list --count origin/main..origin/feat/data-backend-engine
git show origin/main:index.html | grep -c "taskFingerprint"
```

Expected: main and feature branch have the same tip; ahead count is `0`; generated remote build contains deterministic request diagnostics.
