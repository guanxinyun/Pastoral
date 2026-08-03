# Visual Texture Redesign — Image-Based Depth Enhancement

**Date:** 2026-08-04
**Approach:** Option B — Real image textures + background replacements

## Goal

Replace flat CSS-only textures with real AI-generated image textures to add visual depth, warmth, and tactile quality. Maintain all existing functionality, dual-theme system, and responsive behavior.

## Assets (img/)

| File | Usage | Size |
|------|-------|------|
| `羊皮纸底纹-昼.jpg` | Day theme body background | 146KB |
| `深色皮革底纹-夜.jpg` | Night theme body background | 341KB |
| `标题山谷背景.jpg` | Title screen scene replacement | 317KB |
| `书页纸张纹理.jpg` | Book page surface texture | 319KB |

Reserved slots (future): decorative divider image, card texture image.

---

## Section 1: Foundation — Body Background Textures

### tokens.css changes

Add new token in `:root`:
```css
--texture-base-image: url("img/羊皮纸底纹-昼.jpg");
```

Override in `[data-theme="night"]`:
```css
--texture-base-image: url("img/深色皮革底纹-夜.jpg");
```

### base.css changes

Update `body` background to layer the image underneath existing CSS textures:
```css
background-image:
  var(--texture-noise),
  var(--texture-linen),
  var(--vignette),
  var(--texture-base-image);
background-size: 180px, auto, auto, cover;
background-repeat: repeat, repeat, no-repeat, no-repeat;
background-position: center, center, center, center;
background-attachment: scroll, scroll, scroll, fixed;
```

The existing CSS textures (noise, linen, vignette) remain as overlay layers at reduced visual weight, blending with the real texture underneath.

---

## Section 2: Title Screen — Mountain Valley Image

### tokens.css changes

Update the existing slot:
```css
--title-scene-image: url("img/标题山谷背景.jpg");
```

### layout.css changes

The `--title-scene-image` is already referenced in `.title-screen__sky` as the first layer of `background-image`. When it's a real image (not `none`), it covers the CSS gradient fallback beneath it.

Keep all CSS-only scene elements (mountains, lake, mist, inn, tree, fireflies) but reduce their opacity so they act as atmospheric overlays on top of the real image rather than the primary scene:
- `.title-screen__mountains--far` opacity → 0.3
- `.title-screen__mountains--near` opacity → 0.35
- `.title-screen__lake` opacity → 0.25
- `.title-screen__tree` opacity → 0.3
- `.title-screen__inn` — hide (the image has its own landscape)
- `.title-screen__mist` — keep as-is (atmospheric overlay)
- `.title-screen__fireflies` — keep as-is (particle overlay)

This preserves CSS fallback if the image fails to load, and adds animated atmospheric layers on top of the static image.

---

## Section 3: Book Pages — Paper Texture

### layout.css changes

Update `.page` background to include the paper texture image:
```css
background:
  radial-gradient(circle at 12% 4%, hsl(42 82% 72% / .08), transparent 26%),
  var(--texture-linen),
  url("img/书页纸张纹理.jpg") center / cover no-repeat,
  linear-gradient(165deg, var(--color-surface-raised), var(--color-surface));
```

The paper texture sits between the linen overlay and the color fallback gradient.

Also update `.book` background similarly to give the book container itself a subtle texture.

### Shadow Enhancement

Strengthen shadows for more depth perception:

In `:root`:
```css
--shadow-paper: 0 1px 2px hsl(28 30% 20% / 0.08),
                0 3px 6px hsl(28 30% 20% / 0.1),
                0 8px 18px hsl(28 30% 20% / 0.09);
--shadow-book:  0 30px 80px hsl(28 36% 12% / 0.25),
                0 8px 24px hsl(28 36% 12% / 0.15),
                0 2px 6px hsl(28 36% 12% / 0.1);
```

Night theme shadows also get a slight boost.

---

## Section 4: Component Enhancements

### Cards (.card, .staff-card, .visitor-card, .quest-card, .building)
- Add subtle inner glow: `box-shadow` includes a faint `inset 0 1px 0 hsl(42 80% 92% / 0.2)` for a paper-edge highlight
- Slightly increase hover elevation shadow

### HUD (.hud)
- Add paper texture reference to background for consistency with page surface

### Book Spine (.book__spine)
- Darken gradient slightly for more pronounced page separation
- Night theme: spine gets a subtle blue-tinted shadow

### Tabs (.tabs)
- Add subtle paper texture to active tab background

---

## Section 5: Night Theme Texture Adjustments

The night theme already overrides `--texture-linen` and `--vignette`. Additional adjustments:
- `--vignette` darkened further to create stronger candlelight focus effect over the leather texture
- Leather texture + deep vignette = dramatic spotlight-on-desk atmosphere
- Book pages in night mode: paper texture gets a CSS `brightness(0.35) sepia(0.3)` filter via a pseudo-element overlay, making the warm paper appear as aged parchment under dim candlelight

---

## Non-Goals

- No structural HTML changes
- No JavaScript changes
- No new animations (existing animations sufficient)
- No font changes
- No layout/responsive behavior changes
