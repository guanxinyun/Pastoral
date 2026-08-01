# Cross-Platform Variable Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send each variable task exactly once on Termux and Windows, use the correct normal/endday preset through an immediate switch-launch-restore transaction, and preserve the approved endday stage order.

**Architecture:** `none` continues through `generateRaw`; `current` calls `generate` with one `user_input`; `fixed` serializes only a short local transaction that snapshots the live preset, loads the stage preset, obtains the generation Promise, restores the original preset immediately, then awaits the Promise outside the lock. Every request freezes its own normal/endday settings before launch.

**Tech Stack:** Browser JavaScript IIFEs, TavernHelper preset/generation APIs, SillyTavern/MVU APIs, JSDOM, Node.js.

## Global Constraints

- Never send the same task through both `user_input` and `injects`.
- The preset launch lock ends immediately after `generate()` returns its Promise; it never waits for the network response.
- Preserve both the original loaded preset name and unsaved `in_use` content.
- Do not create/delete presets or worldbook entries.
- Do not alter main-story `/send` + `/trigger await=true`.
- Single API story MVU is the normal endday stage; no extra silent normal request.
- Multi API normal failure continues later stages but makes the final result partial.
- Preserve deterministic settlement idempotency and delayed-write relocking.
- Do not stage unrelated deleted/untracked user reference files.

---

### Task 1: Migrate obsolete assembly settings

**Files:** `test/settings.js`, `js/settings.js`

- [ ] Add RED assertions that legacy `assembly: 'inject'|'compile'` is removed while normal/endday mode, preset name, temperature, context, and unknown settings survive.
- [ ] Run `node test/settings.js`; confirm failure because assembly remains.
- [ ] Remove `assembly` from defaults and `delete preset.assembly` during normalization.
- [ ] Run `node test/settings.js`; confirm all pass.
- [ ] Commit settings migration.

### Task 2: Implement stage snapshots and short preset transactions

**Files:** `test/api.js`, `js/api.js`

**Interfaces:**

```js
createStageSnapshot(kind, config)
launchWithFixedPreset(targetPreset, generateConfig)
generateVariable(config, snapshot)
```

- [ ] Add RED tests for immutable normal A/endday B snapshots.
- [ ] Add RED fixed-transaction test asserting exact order:

```text
getLoadedPresetName → getPreset(in_use) → loadPreset(target)
→ generate(user_input only) → loadPreset(original)
→ replacePreset(in_use, originalLive, render:none)
```

- [ ] Add RED test where `generate()` returns an unresolved Promise; assert restore completes and a second transaction can launch before the first network Promise resolves.
- [ ] Add RED tests for synchronous generate failure, failed target load, failed restoration, and preservation of unsaved `in_use` edits.
- [ ] Implement immutable stage snapshot selecting only `variablePresets[kind]` and `Settings.promptFor(kind)`.
- [ ] Implement a Promise-chain launch lock covering only snapshot/switch/generate/restore.
- [ ] Store the generation Promise without awaiting it inside the lock; await it after lock release.
- [ ] Add safe fingerprint and diagnostics fields: stage, mode, target preset, transport, taskCount=1, switched/restored, runtime versions.
- [ ] Run `node test/api.js`; confirm pass.
- [ ] Commit transaction implementation.

### Task 3: Route all variable requests through one task carrier

**Files:** `test/api.js`, `js/api.js`

- [ ] Add RED Windows-host test that counts `user_input + injects`; expect exactly one.
- [ ] Add RED Termux-host test that ignores injects; expect exactly one.
- [ ] Add RED path tests:
  - none → `generateRaw`, one `user_input`, ordered prompts end in `'user_input'`;
  - current → `generate`, no `preset_name`, no `injects`;
  - fixed → short switch transaction, `generate`, no `preset_name`, no `injects`.
- [ ] Refactor `generateVariable(config, snapshot)` to the three paths above.
- [ ] Delete runtime compile/inject assembly branches; retain only preview/helper code still needed until Task 5.
- [ ] Freeze one snapshot per initial/repair pair so repair cannot switch stage or preset.
- [ ] Update connection test to use a normal snapshot and the same transport.
- [ ] Run API tests; confirm pass.
- [ ] Commit one-carrier transport fix.

### Task 4: Refactor explicit endday stages

**Files:** `test/api.js`, `js/chat.js`, `js/api.js`

- [ ] Add RED multi API sequence test:

```text
switch(normal A) → launch → restore → deterministic → initial-write
→ switch(endday B) → launch → restore → enforce
```

- [ ] Add RED single API sequence test:

```text
main-story-as-normal → deterministic → initial-write
→ switch(endday B) → launch → restore → enforce
```

and assert zero extra silent normal calls.

- [ ] Add RED normal-failure continuation test: deterministic/endday still run; endday gets “日常变量阶段失败；不得猜测、补算或重复执行日常即时变化”; final summary is partial.
- [ ] Capture explicit normal/deterministic/endday/enforce stage results and IDs.
- [ ] Freeze normal/endday snapshots at their own launch points; never reuse normal snapshot for endday.
- [ ] Preserve initial-write timeout continuation and delayed relocking.
- [ ] Combine normal, endday, and final-write errors in summary; complete only when required stages succeed.
- [ ] Keep retry scoped to failed API stage and never rerun deterministic settlement.
- [ ] Run API tests; confirm pass.
- [ ] Commit endday stage fix.

### Task 5: Simplify settings UI and diagnostics

**Files:** `test/smoke.js`, `js/app.js`, `css/components.css`

- [ ] Add RED assertions that assembly selectors/warnings are gone.
- [ ] Assert mode copy accurately describes none/current/fixed behavior.
- [ ] Assert normal and endday previews show distinct selected presets and one task carrier.
- [ ] Remove assembly controls and save fields.
- [ ] Replace preview with transport diagnostics for the selected mode.
- [ ] Listen to `pastoral:variable-request` and display stage/mode/target/transport/task count/fingerprint/switch/restoration without secrets.
- [ ] Remove obsolete assembly CSS.
- [ ] Run `node build.js && node test/smoke.js`; confirm pass.
- [ ] Commit UI migration.

### Task 6: Verify, document, and push

**Files:** `test/api.js`, `progress.md`, generated `index.html`

- [ ] Add final concurrent-launch fixture proving locks do not overlap while unresolved network Promises do overlap.
- [ ] Run `npm test`; require zero failed assertions.
- [ ] Run `node --check` for modified JS.
- [ ] Run `node build.js` and compare `index.html` with `public/index.html`.
- [ ] Run `git diff --check`.
- [ ] Update progress.md with root causes, short-transaction behavior, normal/endday sequence, test count, and real-host items needing player verification.
- [ ] Commit final artifacts.
- [ ] Push `feat/data-backend-engine` and fast-forward `main` from that branch.
- [ ] Fetch and verify both remote refs share the same tip and remote `index.html` contains preset-switch transaction diagnostics.
