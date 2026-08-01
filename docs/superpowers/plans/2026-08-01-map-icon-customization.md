# Map and Farm Icon Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build reusable local custom icons for map/farm/seed/livestock targets, stabilize the mobile immersive soft-keyboard layout, and make the migration guide self-contained without Pastoral source files.

**Architecture:** Extend the existing IndexedDB asset module with custom-icon records and icon bindings, then add a focused `IconPicker` module that owns resolution, gestures, dialog UI, and local image lifecycle. Renderers only describe targets and defaults. Mobile viewport code remains in `app.js`/`layout.css`, using VisualViewport-driven CSS height rather than absolute positioning.

**Tech Stack:** Vanilla JavaScript, IndexedDB, Blob/Object URLs, DOM/CSS, VisualViewport API, Node.js static tests, jsdom, existing self-contained build pipeline.

## Global Constraints

- Accept PNG, JPEG, WebP, and SVG only; maximum 2 MiB per file and 100 personal icons.
- Custom images and bindings stay in IndexedDB and never enter MVU, chat messages, model prompts, or `mrfz_settings`.
- SVG uploads load only as Blob image URLs; never inject uploaded SVG markup with `innerHTML`.
- Desktop uses right-click; touch uses 550ms long press cancelled after 12px movement; keyboard uses ContextMenu or Shift+F10.
- Target priority is coordinate-specific, then shared-name/crop, then system inference.
- Seed catalog and same-name planted crops share `crop:<normalized-name>` by default.
- Mobile keyboard-open mode hides status and quick actions, keeps the compact HUD, story, composer, and send button.
- Preserve desktop, non-immersive, MVU, chat, and API behavior.
- Do not stage or commit unrelated existing working-tree changes.

---

## File Structure

- `js/assets.js`: IndexedDB records, custom icon CRUD, binding CRUD, object URL cache, scope isolation.
- `js/icons.js`: expanded SVG preset catalog and public metadata.
- `js/icon-picker.js`: binding resolution, target decoration, gestures, modal UI, upload/rename/delete, refresh events.
- `js/render.js`: supplies map/farm/seed/livestock target keys and invokes icon decoration after renders.
- `js/app.js`: initializes IconPicker and synchronizes VisualViewport/keyboard state.
- `css/components.css`: replaceable icon and picker dialog/drawer styles.
- `css/layout.css`: mobile viewport height, stable dock grid, keyboard-open layout.
- `build.js`: inserts `icon-picker` after `assets` and before `render`.
- `test/assets.js`: IndexedDB API shape, validation constants, graceful fallback.
- `test/icons.js`: preset catalog and picker priority/interaction contracts.
- `test/farm.js`: rendered target keys and crop/seed sharing.
- `test/layout.js`: VisualViewport CSS and keyboard-open layout contracts.
- `test/smoke.js`: build inclusion and picker accessibility surface.
- `package.json`: includes new icon test.
- `迁移参考资料/README.md`: concise self-contained migration guide.

---

### Task 1: Local Icon Asset Store and Preset Catalog

**Files:**
- Modify: `js/assets.js`
- Modify: `js/icons.js`
- Modify: `test/assets.js`
- Create: `test/icons.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `Assets.listCustomIcons()`, `Assets.putCustomIcon(blob, name)`, `Assets.renameCustomIcon(id, name)`, `Assets.removeCustomIcon(id)`, `Assets.customIconUrl(id)`, `Assets.getIconBindings()`, `Assets.setIconBindings(bindings)`, `Assets.removeBindingsForIcon(id)`.
- Produces: `Icon.catalog()` returning preset descriptors `{name,label,group,keywords}`.
- Preserves: existing staff avatar API.

- [ ] **Step 1: Add failing asset and catalog assertions**

Extend `test/assets.js` to assert all public methods exist, limits are exposed, invalid MIME and oversized Blobs return failure without throwing when IndexedDB is absent. Create `test/icons.js` to evaluate `icons.js` and assert at least 20 new map/crop/livestock presets and grouped catalog metadata.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node test/assets.js && node test/icons.js`
Expected: FAIL because custom icon APIs/catalog entries do not exist.

- [ ] **Step 3: Implement IndexedDB schema and CRUD**

Upgrade the database version, keep the `Assets` store, use typed record keys under the existing scope, validate exact allowed MIME strings and `blob.size <= 2 * 1024 * 1024`, cap icon records at 100, cache/revoke URLs, and remove bindings that reference a deleted icon.

- [ ] **Step 4: Add SVG presets and catalog metadata**

Add named 24×24 paths for map, crop, farm state, and livestock categories. Implement `Icon.catalog(group)` without changing `Icon.get/render/set` fallback behavior.

- [ ] **Step 5: Run focused tests**

Run: `node test/assets.js && node test/icons.js`
Expected: PASS.

### Task 2: Icon Resolver, Gestures, and Accessible Picker

**Files:**
- Create: `js/icon-picker.js`
- Modify: `css/components.css`
- Modify: `build.js`
- Modify: `test/icons.js`
- Modify: `test/smoke.js`

**Interfaces:**
- Consumes: Task 1 `Assets` APIs and `Icon.catalog()`.
- Produces: `IconPicker.init()`, `IconPicker.decorate(root)`, `IconPicker.resolve(keys, fallback)`, `IconPicker.open(targetElement)`, `IconPicker.refresh(root)`.
- DOM contract: each replaceable node carries `data-icon-target`, optional `data-icon-shared`, `data-icon-fallback`, `data-icon-label`, and `data-icon-scope-label`.

- [ ] **Step 1: Add failing picker contract tests**

Assert build order includes `icon-picker` after `assets`, source contains 550ms/12px gesture thresholds, contextmenu and keyboard triggers, dialog semantics, focus trap, preset/personal tabs, upload accept list, scope choices, restore/save controls, and custom `<img>` rendering rather than SVG markup injection.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node test/icons.js && node test/smoke.js`
Expected: FAIL because picker module and build inclusion are missing.

- [ ] **Step 3: Implement resolver and decoration**

Load bindings once, resolve ordered candidate keys, render custom images asynchronously with system fallback, mark target elements focusable, and refresh on a `pastoral:icons-changed` event.

- [ ] **Step 4: Implement right-click, long-press, and keyboard opening**

Use delegated pointer/contextmenu/keydown handlers. Cancel long press on movement greater than 12px, pointer cancel/leave, and scrolling; suppress the click immediately following a successful 550ms press.

- [ ] **Step 5: Implement picker dialog and library actions**

Build a native dialog-like modal with focus trapping, tablist, 44px icon buttons, upload busy/error states, rename/delete controls, reference-count warning, target/shared scope radios, restore/cancel/save, Escape close, and focus return.

- [ ] **Step 6: Add picker styles**

Use project tokens, mobile-first bottom drawer, desktop centered modal, custom scrollbar, selected/hover/active/focus states, empty/error/loading states, light/night compatibility, and reduced-motion handling.

- [ ] **Step 7: Run focused tests**

Run: `node test/icons.js && node test/smoke.js`
Expected: PASS.

### Task 3: Map, Farm, Seed, and Livestock Integration

**Files:**
- Modify: `js/render.js`
- Modify: `js/app.js`
- Modify: `test/farm.js`
- Modify: `test/icons.js`

**Interfaces:**
- Consumes: `IconPicker.decorate(root)` and the data attributes from Task 2.
- Map candidates: `map:x,y`, `map-name:<normalized-name>`.
- Farm candidates: `farm:normal:x,y` or `farm:magic:x,y`, then `crop:<normalized-name>`.
- Seed candidate: `crop:<normalized-name>`.
- Livestock candidate: `livestock:<normalized-name>`.

- [ ] **Step 1: Add failing rendered-key tests**

Extend DOM tests to assert map cells expose coordinate and shared keys, normal/magic plots expose distinct coordinate keys, planted cells and seed cards use identical crop keys, livestock exposes name keys, and all targets have keyboard/context-menu labels.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run build && node test/farm.js && node test/icons.js`
Expected: FAIL because rendered target descriptors are absent.

- [ ] **Step 3: Add target descriptor helpers**

Add HTML escaping/attribute-safe key helpers and centralize replaceable icon markup so arbitrary MVU names cannot break attributes or selectors.

- [ ] **Step 4: Integrate map targets**

Map explored cells provide coordinate-specific and shared-name candidates while preserving normal click-to-detail behavior. Detail icons reuse the same mapping.

- [ ] **Step 5: Integrate farm, seed, and livestock targets**

Normal and magic grids provide distinct coordinate keys; crop details and seed cards share crop keys; livestock uses normalized name. Invoke `IconPicker.decorate()` after each relevant render and dynamic detail render.

- [ ] **Step 6: Initialize picker**

Call `IconPicker.init()` after initial icon render and before regular interactions; ensure MVU re-renders naturally re-decorate targets.

- [ ] **Step 7: Run focused tests**

Run: `npm run build && node test/farm.js && node test/icons.js`
Expected: PASS.

### Task 4: VisualViewport and Mobile Keyboard Layout

**Files:**
- Modify: `js/app.js`
- Modify: `css/layout.css`
- Modify: `test/layout.js`
- Modify: `test/iframe.js`

**Interfaces:**
- Produces CSS custom property `--mobile-viewport-height` and body class `.is-mobile-keyboard-open`.
- Consumes `window.visualViewport` when available, otherwise preserves `100dvh` fallback.

- [ ] **Step 1: Add failing viewport/layout assertions**

Assert mobile immersive height reads `var(--mobile-viewport-height, 100dvh)`, story page remains a flex column with `min-height:0`, dock uses a non-wrapping grid, touch buttons are 44px, keyboard-open hides `.dock`, compacts HUD, and composer remains in flow. Assert JS listens to VisualViewport resize/scroll with requestAnimationFrame and uses focus plus a meaningful viewport-height reduction.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node test/layout.js && node test/iframe.js`
Expected: FAIL on the new viewport and keyboard assertions.

- [ ] **Step 3: Implement viewport synchronization**

Write the visible height to the CSS variable, coalesce updates with one animation frame, recompute on VisualViewport/window events and mobile page changes, and remove keyboard state when leaving immersive/story mode.

- [ ] **Step 4: Implement keyboard detection**

Require composer focus and a VisualViewport height reduction beyond a stable threshold; use a focus-only fallback only when VisualViewport is unavailable. Call `scrollIntoView({block:'nearest'})` once when opening, not on every resize.

- [ ] **Step 5: Stabilize mobile CSS**

Use the viewport variable on the book, explicit flex/grid rows, `min-height:0`, non-wrapping dock layout, safe-area padding, compact keyboard HUD, hidden dock in keyboard mode, touch tooltip suppression, and textarea max height.

- [ ] **Step 6: Run focused tests**

Run: `node test/layout.js && node test/iframe.js`
Expected: PASS.

### Task 5: Self-Contained Migration Guide

**Files:**
- Replace: `迁移参考资料/README.md`
- Test: add static assertions to `test/smoke.js`

**Interfaces:**
- Consumes only TavernHelper/MVU contracts described by `_types_split/` and `slash_command_split/` plus the reader's own Schema/initvar.
- Produces a concise guide whose algorithms and reference snippets do not require Pastoral `js/`, `css/`, tests, built HTML, or historical design documents.

- [ ] **Step 1: Add failing documentation assertions**

Assert the guide has the ten approved sections, names the needed split contract files, contains self-contained adapters/algorithms, and does not contain source-map tables or required-read references to Pastoral JS/CSS/tests/design docs.

- [ ] **Step 2: Run smoke test and verify failure**

Run: `node test/smoke.js`
Expected: FAIL because the existing guide still contains source/test/design dependencies.

- [ ] **Step 3: Rewrite the guide**

Replace it with concise sections for host contracts, content extraction, full MVU snapshots, patch validation, second API, fixed-preset transaction, pseudo-zero-floor coordinates, VisualViewport layout, local image assets/mappings, and a minimal acceptance checklist. Include self-contained reference code and precise split-file pointers.

- [ ] **Step 4: Run smoke test**

Run: `node test/smoke.js`
Expected: PASS.

### Task 6: Full Verification and Delivery

**Files:**
- Verify all modified source, tests, docs, build outputs, spec, and plan.

**Interfaces:**
- Produces synchronized `index.html` and `public/index.html`, a focused commit, and pushed `origin/main`.

- [ ] **Step 1: Run JavaScript syntax checks**

Run: `for f in js/*.js test/*.js build.js; do node --check "$f" || exit 1; done`
Expected: all files parse.

- [ ] **Step 2: Run the complete suite**

Run: `npm test`
Expected: PASS with every suite, including assets/icons/farm/layout/iframe/smoke.

- [ ] **Step 3: Run repository integrity checks**

Run: `git diff --check` and compare hashes of `index.html` and `public/index.html`.
Expected: no whitespace errors; hashes match.

- [ ] **Step 4: Review only task-related changes**

Run: `git status --short` and `git diff -- <explicit task file list>`. Confirm pre-existing deletions, planning scratch files, split references, and `.playwright-mcp/` remain unstaged.

- [ ] **Step 5: Commit task files**

Stage only the explicit task file list and commit with:

```text
feat: add customizable map and farm icons

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

- [ ] **Step 6: Push the completed commit**

Push the commit to `origin/main` according to the project's standing delivery preference, then report the commit hash and verification evidence.
