# Book Silhouette and Title Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Tavern stage full-size while restoring a recognizable desktop book silhouette, let mobile use the complete single-page width, and add one resilient CSS variable for a future title-scene image-host URL.

**Architecture:** Preserve the existing `.book > .page--left + .book__spine + .page--right` structure and solve the silhouette entirely in CSS: the full-size `.book` becomes the same-tone outer sheet/cover and responsive inline padding creates the desktop page edges. The mobile breakpoint removes that decorative inline inset while retaining safe-area padding. A token in `css/tokens.css` supplies an optional title image as the top background layer of `.title-screen__sky`; the existing gradients remain underneath as the no-network and failed-request fallback.

**Tech Stack:** Static HTML, CSS custom properties and media queries, Node.js build script, regex-based Node test suite, Playwright browser verification.

## Global Constraints

- Do not alter business data, IDs, data attributes, event names, scrolling ownership, mobile page-switch behavior, or immersive lifecycle.
- Desktop and tablet keep the full available stage; the visible edge is inside the book, not a large external gutter.
- Desktop page-edge inset targets `clamp(16px, 2vw, 32px)` and must use logical/responsive CSS rather than a fixed-width layout.
- Mobile below the existing `899px` breakpoint does not reserve decorative side edges; safe-area insets remain supported.
- Keep desktop pages strictly equal width and keep narrative measure at `66–72ch`.
- `--title-scene-image` defaults to `none`; no upload UI, image-host SDK, credential, API key, or downloaded/embedded remote image is added.
- A failed or absent remote image must leave the existing CSS valley scene and readable title controls visible.
- Preserve all pre-existing working-tree edits. Only stage the explicit implementation whitelist; never stage the existing deleted reference files, MVU document, split references, `.playwright-mcp/`, `.superpowers/`, `task_plan.md`, `progress.md`, or `findings.md` unless a later explicit instruction changes that boundary.
- Generated `index.html` and `public/index.html` must be byte-identical after the final build.

## File Map

- `css/tokens.css` — owns the new `--title-scene-image` public customization point.
- `css/layout.css` — owns title background-layer composition and responsive book/page-edge layout.
- `test/layout.js` — owns static regression assertions for the token, fallback layers, desktop edge, mobile edge removal, and preserved layout contracts.
- `index.html` — generated self-contained bundle; never hand-edit.
- `public/index.html` — generated deployment bundle; never hand-edit.
- `docs/superpowers/specs/2026-08-02-book-silhouette-and-title-image-design.md` — approved behavior contract; read-only during implementation unless a contradiction is discovered.

---

### Task 0: Stabilize the Existing Tavern Viewport Baseline

**Files:**
- Verify current edits: `css/components.css`, `css/layout.css`, `js/app.js`, `js/host.js`, `js/intro.js`
- Verify current tests: `test/iframe.js`, `test/intro.js`, `test/layout.js`
- Regenerate: `index.html`, `public/index.html`

**Interfaces:**
- Consumes: the current working tree’s bounded Tavern iframe, title/prologue/game body states, prologue entry button, and mobile-in-Tavern page switching.
- Produces: a tested baseline commit on which the book silhouette rules can be added without confusing pre-existing changes with this feature.

- [ ] **Step 1: Record the exact baseline whitelist and exclusions**

Run:

```bash
git status --short
git diff -- css/components.css css/layout.css js/app.js js/host.js js/intro.js test/iframe.js test/intro.js test/layout.js
git diff --name-only
```

Expected: the source/test whitelist contains the active Tavern viewport work; unrelated deleted reference files, MVU/reference documents, planning logs, and untracked tool directories remain visibly outside the whitelist.

- [ ] **Step 2: Build the current source baseline**

Run:

```bash
node build.js
```

Expected: exits 0 and reports regenerated `index.html + public/index.html`.

- [ ] **Step 3: Run the focused baseline tests**

Run:

```bash
node test/intro.js
node test/iframe.js
node test/layout.js
node test/build.js
```

Expected: every command exits 0. If one fails, fix only the verified regression in the baseline whitelist before continuing; do not weaken an assertion unrelated to the changed behavior.

- [ ] **Step 4: Confirm generated outputs and syntax**

Run:

```bash
node --check js/app.js
node --check js/host.js
node --check js/intro.js
node -e "const fs=require('fs'); process.exit(fs.readFileSync('index.html','utf8')===fs.readFileSync('public/index.html','utf8')?0:1)"
git diff --check -- css/components.css css/layout.css js/app.js js/host.js js/intro.js test/iframe.js test/intro.js test/layout.js index.html public/index.html
```

Expected: all commands exit 0; line-ending warnings are acceptable, whitespace errors are not.

- [ ] **Step 5: Commit only the verified baseline**

```bash
git add -- css/components.css css/layout.css js/app.js js/host.js js/intro.js test/iframe.js test/intro.js test/layout.js index.html public/index.html
git diff --cached --name-only
git commit -m "fix: constrain tavern experience viewport" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin HEAD
```

Expected staged names are exactly the ten listed files. If any unrelated path appears, unstage it before committing.

---

### Task 1: Add the Resilient Title Image-Host Hook

**Files:**
- Modify: `test/layout.js:96-106`
- Modify: `css/tokens.css:43-51`
- Modify: `css/layout.css:37-43`
- Regenerate: `index.html`, `public/index.html`

**Interfaces:**
- Consumes: existing `:root` title tokens and `.title-screen__sky` CSS valley artwork.
- Produces: CSS custom property `--title-scene-image` whose value is `none | url(...)`; the sky layer consumes it without JavaScript or DOM changes.

- [ ] **Step 1: Write failing token and fallback assertions**

Add these assertions under `[5] 标题、序章与全面视觉契约` in `test/layout.js`:

```js
ok(/--title-scene-image:\s*none\s*;/.test(CSS), '标题场景图床入口默认关闭');
ok(/\.title-screen__sky\s*\{[^}]*background-image:\s*var\(--title-scene-image\)[^}]*radial-gradient[^}]*linear-gradient/.test(CSS),
  '标题图片覆盖层之下保留太阳与山谷渐变回退');
ok(/\.title-screen__sky\s*\{[^}]*background-size:\s*cover\s*,/.test(CSS),
  '标题图床图片使用 cover 且不改变下层构图');
ok(/\.title-screen__sky\s*\{[^}]*background-repeat:\s*no-repeat/.test(CSS),
  '标题图床图片不平铺');
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
node build.js && node test/layout.js
```

Expected: FAIL only the four new title-image assertions because the token and composed background do not exist.

- [ ] **Step 3: Add the public title image token**

In the title-token block of `css/tokens.css`, add:

```css
  /* 可选图床原图直链：改为 url("https://...")；none 时使用下方纯 CSS 山谷 */
  --title-scene-image: none;
```

Keep this token in `:root`; do not override it in `[data-theme="night"]`, so one configured URL works in both themes.

- [ ] **Step 4: Compose the image over the existing CSS fallback**

Replace the `.title-screen__sky` background declaration in `css/layout.css` with:

```css
.title-screen__sky {
  inset: 0;
  background-image:
    var(--title-scene-image),
    radial-gradient(circle at 73% 17%, hsl(41 80% 78% / .95) 0 2.4%, hsl(41 84% 66% / .2) 4% 17%, transparent 32%),
    linear-gradient(177deg, var(--color-title-sky) 0%, hsl(214 40% 26%) 38%, var(--color-title-horizon) 72%, hsl(39 68% 66%) 100%);
  background-position: center, center, center;
  background-size: cover, auto, auto;
  background-repeat: no-repeat;
}
```

This keeps the existing opaque valley gradient as the lowest layer, so `none` and failed URL requests both retain the current scene.

- [ ] **Step 5: Rebuild and verify GREEN**

Run:

```bash
node build.js
node test/layout.js
node test/build.js
```

Expected: all pass; generated outputs are identical.

- [ ] **Step 6: Commit and push the title hook**

```bash
git add -- css/tokens.css css/layout.css test/layout.js index.html public/index.html
git diff --cached --name-only
git commit -m "feat: add title scene image hook" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin HEAD
```

Expected: only the five listed paths are committed.

---

### Task 2: Restore the Desktop Book Silhouette and Full Mobile Page

**Files:**
- Modify: `test/layout.js:67-91,108-115`
- Modify: `css/layout.css:6-14,122-174,251-307`
- Regenerate: `index.html`, `public/index.html`

**Interfaces:**
- Consumes: `.book`, `.page`, `.book__spine`, `body.in-tavern.is-game`, `body.is-immersive`, the `899px` mobile breakpoint, and safe-area environment variables.
- Produces: `--book-edge-inline: clamp(16px, 2vw, 32px)` scoped to `.book`; full-size Tavern/immersive shells use it on desktop, while the mobile media rule reduces decorative inline padding to safe-area-only values.

- [ ] **Step 1: Replace the obsolete external-gutter assertion with failing silhouette assertions**

In `test/layout.js`, replace the current assertion that expects `width: calc(100% - 24px)` and `margin: 12px auto` for the Tavern game book with:

```js
ok(/\.book\s*\{[^}]*--book-edge-inline:\s*clamp\(16px,\s*2vw,\s*32px\)/.test(CSS),
  '书本外壳定义响应式同色页缘');
ok(/body\.in-tavern\.is-game\s+\.book\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none[^}]*height:\s*100%[^}]*margin:\s*0[^}]*padding-inline:\s*var\(--book-edge-inline\)/.test(CSS),
  '酒馆舞台铺满，桌面页缘位于书本内部');
ok(/body\.is-immersive\s+\.book\s*\{[^}]*padding-inline:\s*var\(--book-edge-inline\)/.test(CSS),
  '桌面沉浸模式仍保留书本轮廓');
ok(/@media\s*\(max-width:\s*899px\)[\s\S]*body\.in-tavern\.is-game\s+\.book\s*,[\s\S]*body\.is-immersive\s+\.book\s*\{[^}]*padding-inline:\s*max\(0px,\s*env\(safe-area-inset-left\)\)\s+max\(0px,\s*env\(safe-area-inset-right\)\)/.test(CSS),
  '手机移除装饰页缘，仅保留左右安全区');
ok(!/body\.in-tavern\.is-game\s+\.book\s*\{[^}]*width:\s*calc\(100%\s*-\s*24px\)/.test(CSS),
  '正式书本不再通过缩小外壳制造外部留白');
```

Keep all existing assertions for page equality, `100dvh`, mobile page switching, keyboard behavior, and `72ch` measure unchanged.

- [ ] **Step 2: Run the layout test to verify RED**

Run:

```bash
node build.js && node test/layout.js
```

Expected: FAIL the new book-shell, desktop inset, immersive inset, and mobile safe-area assertions while the existing equality/mobile-flow assertions continue to pass.

- [ ] **Step 3: Define the same-tone book edge on the base shell**

Update the base `.book` rule in `css/layout.css` to include the responsive edge token and a paper-colored outer surface:

```css
.book {
  --book-edge-inline: clamp(16px, 2vw, 32px);
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 14px var(--book-edge-inline);
  box-sizing: border-box;
  gap: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--texture-linen), linear-gradient(165deg, var(--color-surface-raised), var(--color-surface));
  box-shadow: var(--shadow-book);
}
```

The background uses the same semantic paper tokens as the pages; do not add a contrasting external gutter.

- [ ] **Step 4: Make Tavern and immersive desktop shells fill the stage with internal edges**

Change the top Tavern rule to:

```css
body.in-tavern.is-game .book {
  width: 100%;
  max-width: none;
  height: 100%;
  min-height: 0;
  margin: 0;
  padding-block: clamp(10px, 1.4vw, 18px);
  padding-inline: var(--book-edge-inline);
  overflow: hidden;
  flex-wrap: nowrap;
}
```

Change the desktop immersive rule to retain responsive inline edges:

```css
body.is-immersive .book {
  max-width: none;
  height: 100vh;
  padding-block: 12px;
  padding-inline: var(--book-edge-inline);
  flex-wrap: nowrap;
  align-items: stretch;
}
```

- [ ] **Step 5: Remove decorative side edges at the mobile breakpoint**

Inside the existing `@media (max-width: 899px)` block, place this rule after the height/flex-direction declarations:

```css
  body.in-tavern.is-game .book,
  body.is-immersive .book {
    padding-block: max(0px, env(safe-area-inset-top)) max(0px, env(safe-area-inset-bottom));
    padding-inline: max(0px, env(safe-area-inset-left)) max(0px, env(safe-area-inset-right));
    border-radius: 0;
    box-shadow: none;
  }
```

Remove the older immersive mobile `padding: max(8px, env(...)) ...` declaration so it cannot reintroduce decorative side space. Do not change `.page { padding: 16px; }` or the page switcher’s own spacing.

- [ ] **Step 6: Rebuild and verify the focused contracts**

Run:

```bash
node build.js
node test/layout.js
node test/iframe.js
node test/build.js
```

Expected: all pass. The test output still confirms equal desktop pages, one visible mobile page, dynamic viewport height, safe-area syntax, internal scrolling, and bounded Tavern state transitions.

- [ ] **Step 7: Commit and push the silhouette**

```bash
git add -- css/layout.css test/layout.js index.html public/index.html
git diff --cached --name-only
git commit -m "fix: restore responsive book silhouette" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin HEAD
```

Expected: only the four listed paths are committed.

---

### Task 3: Full Regression, Browser Verification, and Delivery

**Files:**
- Verify: all production and test files
- Regenerate if needed: `index.html`, `public/index.html`
- Do not modify project planning logs that predated this plan.

**Interfaces:**
- Consumes: completed title image hook and responsive book silhouette.
- Produces: verified build and a concise user procedure for adding a future image-host direct URL.

- [ ] **Step 1: Run the full automated suite**

Run:

```bash
npm test
```

Expected: build succeeds and every test script ends with `全部通过`; no failure marker appears.

- [ ] **Step 2: Run static and generated-output checks**

Run:

```bash
node --check build.js
node --check js/app.js
node --check js/host.js
node --check js/intro.js
node -e "const fs=require('fs'); const a=fs.readFileSync('index.html','utf8'); const b=fs.readFileSync('public/index.html','utf8'); if(a!==b) process.exit(1); if(!a.includes('--title-scene-image: none;')) process.exit(2);"
git diff --check
git status --short
```

Expected: syntax and bundle checks exit 0; `git diff --check` has no whitespace error. Existing unrelated changes may remain in status but must not be staged.

- [ ] **Step 3: Launch the real page and inspect the required viewports**

Use the project run workflow (`npm run dev` if no more specific launcher exists), then inspect in Playwright at:

```text
Desktop: 1440 × 900
Medium: 768 × 900
Mobile: 375 × 812
```

At 1440px verify the full stage is occupied, the same-tone left/right inner edges and central spine make a complete book, both pages are equal, and neither page is clipped. Toggle immersive mode and verify the inner edge remains without excessive wasted width.

At 768px verify no horizontal overflow or crushed controls and that the existing single-page switch behavior still works.

At 375px verify decorative side edges are absent, the active page uses the complete safe width, the page switcher changes between ledger/story, and title copy/buttons remain within the viewport.

- [ ] **Step 4: Verify title fallback and URL behavior without committing a real URL**

In Playwright, first inspect the default computed style and confirm the CSS valley is visible with `--title-scene-image: none`.

Then temporarily set the runtime property without editing files:

```js
document.documentElement.style.setProperty('--title-scene-image', 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221600%22 height=%22900%22%3E%3Crect width=%221600%22 height=%22900%22 fill=%22%235c7155%22/%3E%3C/svg%3E")');
```

Confirm the test image covers the sky layer while the title and button remain readable. Then set:

```js
document.documentElement.style.setProperty('--title-scene-image', 'url("https://invalid.example.invalid/missing.webp")');
```

Confirm the underlying gradient valley remains visible and controls remain usable. Finally remove the runtime override:

```js
document.documentElement.style.removeProperty('--title-scene-image');
```

- [ ] **Step 5: Check console/network and working-tree boundaries**

Confirm the browser console has no new errors from layout or background loading; the deliberately invalid image request may show a network failure and is expected. Then run:

```bash
git diff --cached --name-only
git status --short
git log -4 --oneline --decorate
```

Expected: no staged files remain; the latest commits are the baseline, title hook, and silhouette commits pushed to `origin/feat/data-backend-engine`; unrelated pre-existing paths remain untouched.

- [ ] **Step 6: Deliver the exact image-host instructions**

Report these instructions with the verification result:

```text
1. Upload a horizontal WebP scene (recommended 16:9, at least 1920×1080) to an HTTPS image host/static asset service.
2. Copy the original-file direct URL, not the image-host preview-page URL. Opening it alone in a browser should display only the image.
3. Open css/tokens.css and replace `--title-scene-image: none;` with `--title-scene-image: url("https://your-direct-image-url.webp");`.
4. Run `npm run build`.
5. Use the regenerated index.html (public/index.html is generated identically). The remote image still requires network access at runtime.
```

No additional commit is required unless verification produced a concrete fix; any such fix must rerun the affected focused test and `npm test`, then be committed with only its explicit files.

## Plan Self-Review

- **Spec coverage:** Task 1 covers the single optional title image token, cover behavior, CSS fallback, no JavaScript/uploader, and direct-link documentation. Task 2 covers full desktop/Tavern/immersive stage, internal same-tone book edges, mobile edge removal with safe areas, equal pages, and unchanged reading measure. Task 3 covers all specified desktop/medium/mobile and valid/invalid image checks, full regression, build equality, and user instructions.
- **Boundary coverage:** Task 0 isolates and verifies the already-active Tavern viewport work so generated bundles never commit code absent from source commits; all tasks use explicit staging whitelists and preserve unrelated user files.
- **Type/interface consistency:** The only new interface is the CSS custom property `--title-scene-image`; its declaration and all consumers use that exact spelling. The book inset is internal CSS state `--book-edge-inline` and is consumed consistently in Tavern and immersive rules.
- **Placeholder scan:** The plan contains no TBD/TODO/“implement later” instructions. Example hostnames and `https://...` appear only as documented user-replaceable URL examples, not unfinished implementation requirements.
