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

console.log('\n[4] 滚动条已按主题定制');
ok(/\.journal__stream::-webkit-scrollbar-thumb/.test(CSS), '对话流滚动条已定制');

console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
