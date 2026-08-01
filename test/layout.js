/* ============================================================
   layout.js · 双页等分布局的层叠顺序断言
   jsdom 无视口概念、不解析媒体查询宽度，故直接对打包产物做
   规则顺序/内容断言，防止「基础规则写在媒体查询之后把等宽覆盖掉」回归。
   用法：node test/layout.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const CSS = (() => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  return m ? m[1] : '';
})();

let failed = 0;
function ok(cond, label) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label);
  if (!cond) failed++;
}

/** 配平扫描全部规则：返回 [{selector, body, media, index}] */
function allRules() {
  const out = [];
  const mediaStack = [];
  let depth = 0, i = 0, segStart = 0;
  while (i < CSS.length) {
    const ch = CSS[i];
    if (ch === '{') {
      const head = CSS.slice(segStart, i).trim().replace(/\/\*[\s\S]*?\*\//g, '').trim();
      depth++;
      if (head.startsWith('@media')) {
        mediaStack.push({ q: head, depth });
      } else {
        const end = CSS.indexOf('}', i);
        out.push({
          selector: head,
          body: end === -1 ? '' : CSS.slice(i + 1, end).trim(),
          media: mediaStack.length ? mediaStack[mediaStack.length - 1].q : null,
          index: i
        });
      }
      segStart = i + 1;
    } else if (ch === '}') {
      while (mediaStack.length && mediaStack[mediaStack.length - 1].depth === depth) mediaStack.pop();
      depth--;
      segStart = i + 1;
    }
    i++;
  }
  return out;
}

console.log('\n[1] .page 规则层叠顺序');
const rules = allRules().filter((r) => r.selector === '.page');
ok(rules.length >= 2, `找到 ${rules.length} 条 .page 规则（media: ${rules.map((r) => r.media || 'none').join(' / ')}）`);

const base = rules.find((r) => !r.media && /flex:\s*1 1 100%/.test(r.body));
const wide = rules.find((r) => r.media && /min-width:\s*900px/.test(r.media) && /flex:\s*1 1 0/.test(r.body));

ok(!!base, '存在窄屏基础规则 flex: 1 1 100%');
ok(!!wide, '存在 ≥900px 等宽规则 flex: 1 1 0');
ok(!!base && !!wide && wide.index > base.index,
  '等宽规则位于基础规则之后（同优先级下后者生效）');
ok(!!wide && /width:\s*50%/.test(wide.body), '等宽规则含 width: 50%');

console.log('\n[2] 双页等高');
ok(/\.book\s*\{[^}]*align-items:\s*stretch/.test(CSS), '.book 用 align-items: stretch（等高）');
ok(!/\.book\s*\{[^}]*align-items:\s*flex-start/.test(CSS), '.book 不再用 flex-start（曾导致一大一小）');

console.log('\n[3] 沉浸/全屏视口');
ok(/body\.is-immersive\s+\.book\s*\{[^}]*height:\s*100vh/.test(CSS), '全屏时书容器铺满视口高');
ok(/body\.is-immersive\s+\.page\s*\{[^}]*width:\s*50%/.test(CSS), '全屏时双页各占一半');
ok(/body\.is-immersive\s+\.journal__stream\s*\{[^}]*flex:\s*1/.test(CSS), '全屏时对话流吃掉剩余高度');
ok(/iframe\.pastoral-immersive[\s\S]*?position:\s*fixed\s*!important/.test(CSS) === false,
  '沉浸 iframe 规则不在卡内样式表（应注入父文档）');
ok(/\.mobile-page-switcher/.test(CSS), '提供手机沉浸页签样式');
ok(/@media\s*\(max-width:\s*899px\)[\s\S]*body\.is-immersive[\s\S]*100dvh/.test(CSS),
  '手机沉浸使用动态视口高度');
ok(/body\.is-immersive\.mobile-page--ledger\s+\.page--right[\s\S]*display:\s*none/.test(CSS),
  '经营页状态隐藏剧情页');
ok(/body\.is-immersive\.mobile-page--story\s+\.page--left[\s\S]*display:\s*none/.test(CSS),
  '剧情页状态隐藏经营页');
ok(!/body\.is-immersive\s+\.book\s*\{[^}]*flex-wrap:\s*wrap[^}]*height:\s*auto/.test(CSS),
  '手机沉浸不再上下堆叠双页');
ok(/height:\s*var\(--mobile-viewport-height,\s*100dvh\)/.test(CSS), '手机沉浸高度由 VisualViewport CSS 变量驱动并回退 100dvh');
ok(/body\.is-immersive\.mobile-page--story\s+\.page--right\s*\{[^}]*min-height:\s*0/.test(CSS), '手机剧情页保持纵向弹性且允许正文收缩');
ok(/body\.is-immersive\.mobile-page--story\s+\.dock\s*\{[^}]*display:\s*grid/.test(CSS), '手机剧情 dock 使用稳定网格而非任意换行');
ok(/body\.is-immersive\.is-mobile-keyboard-open\s+\.dock\s*\{[^}]*display:\s*none/.test(CSS), '软键盘打开时隐藏状态与快捷栏');
ok(/body\.is-immersive\.is-mobile-keyboard-open\s+\.hud/.test(CSS), '软键盘打开时 HUD 使用紧凑样式');
ok(!/body\.is-immersive\.is-mobile-keyboard-open\s+\.composer\s*\{[^}]*(position:\s*(fixed|absolute))/.test(CSS), '键盘模式 composer 仍在正常布局流');

console.log('\n[4] 滚动条已按主题定制');
ok(/\.journal__stream::-webkit-scrollbar-thumb/.test(CSS), '对话流滚动条已定制');

console.log('\n[5] 标题、序章与全面视觉契约');
ok(/\.title-screen\s*\{[^}]*min-height:\s*100svh/.test(CSS), '标题占据沉浸视口');
ok(!/\.title-screen__scene\s*>\s*span\s*\{[^}]*inset:\s*0/.test(CSS), '标题场景通用层不覆盖各景物定位');
ok(/\.title-screen__inn\s*\{[^}]*right:\s*13%[^}]*bottom:\s*12%/.test(CSS), '旅店定位在山谷右下方');
ok(/\.prologue__measure\s*\{[^}]*max-width:\s*72ch/.test(CSS), '序章阅读宽度限制为 72ch');
ok(/\.bub__body\s*>\s*\*\s*\{[^}]*max-width:\s*(66ch|72ch)/.test(CSS), '正式正文阅读宽度受限');
ok(/min-height:\s*44px/.test(CSS), '交互控件包含 44px 触控目标');
ok(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(CSS), '提供减少动效覆盖');
ok(/--color-title-sky:/.test(CSS) && /--color-parchment-warm:/.test(CSS), '标题山谷与信纸使用设计令牌');
ok(/--title-scene-image:\s*none\s*;/.test(CSS), '标题场景图床入口默认关闭');
ok(/\.title-screen__sky\s*\{[^}]*background-image:\s*var\(--title-scene-image\)[^}]*radial-gradient[^}]*linear-gradient/.test(CSS),
  '标题图片覆盖层之下保留太阳与山谷渐变回退');
ok(/\.title-screen__sky\s*\{[^}]*background-size:\s*cover\s*,/.test(CSS),
  '标题图床图片使用 cover 且不改变下层构图');
ok(/\.title-screen__sky\s*\{[^}]*background-repeat:\s*no-repeat/.test(CSS),
  '标题图床图片不平铺');
ok(/\.book\s*\{[^}]*box-shadow:\s*var\(--shadow-book\)/.test(CSS), '正式双页书使用统一高端层次阴影');
ok(/\.card:hover[^{]*\{[^}]*transform:\s*translateY/.test(CSS), '正式卡片具有细腻悬停反馈');

console.log('\n[6] 酒馆 iframe 有界布局');
ok(/html\.in-tavern\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/.test(CSS), '酒馆子文档锁定为单个 iframe 视口');
ok(/body\.in-tavern\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/.test(CSS), '有界酒馆 body 不再向外撑高');
ok(/html\.in-tavern--dynamic\s*\{[^}]*height:\s*auto[^}]*overflow:\s*visible/.test(CSS), '动态宿主 html 暴露自然内容高度');
ok(/body\.in-tavern\.in-tavern--dynamic\s*\{[^}]*height:\s*auto[^}]*overflow:\s*visible/.test(CSS), '动态宿主 body 不裁切内容');
ok(/body\.in-tavern\.in-tavern--dynamic\s+\.title-screen\s*\{[^}]*height:\s*auto[^}]*min-height:\s*560px[^}]*overflow:\s*visible/.test(CSS),
  '父页面不可接管时标题至少 560px 并完整暴露开始按钮');
ok(/body\.in-tavern\.in-tavern--dynamic\.is-prologue\s+\.prologue\s*\{[^}]*height:\s*auto[^}]*max-height:\s*none[^}]*overflow:\s*visible/.test(CSS),
  '动态宿主序章按完整内容自然展开');
ok(/html\.in-tavern--unmanaged[\s\S]*body\.in-tavern\.in-tavern--unmanaged\.is-game\s*\{[^}]*height:\s*auto[^}]*min-height:\s*640px[^}]*overflow:\s*visible/.test(CSS),
  '无法控制父 frame 时正式游戏暴露至少 640px 自然高度');
ok(/body\.in-tavern\.in-tavern--unmanaged\.is-game\s+\.book\s*\{[^}]*height:\s*640px[^}]*min-height:\s*640px/.test(CSS),
  '无法控制父 frame 时书页不是 96px 短条');
ok(/body\.in-tavern\s+\.title-screen\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0/.test(CSS), '有界酒馆标题不使用 dvh 参与高度反馈');
ok(/body\.in-tavern\.is-prologue\s+\.prologue\s*\{[^}]*width:\s*calc\(100%\s*-\s*24px\)[^}]*height:\s*calc\(100%\s*-\s*24px\)[^}]*margin:\s*12px auto[^}]*overflow-y:\s*auto/.test(CSS), '酒馆序章在留白视口内滚动');
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
ok(/body\.in-tavern\.is-prologue\s+\.book[\s\S]*display:\s*none/.test(CSS), '酒馆序章与正式界面互斥显示');
ok(/body\.in-tavern\.is-game\s+\.prologue[\s\S]*display:\s*none/.test(CSS), '进入正式界面后序章不再占位');

console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
