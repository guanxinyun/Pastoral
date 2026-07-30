/* farm.js · 农田大小与地块网格静态/DOM 测试 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let failed = 0;
function ok(cond, label) { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failed++; }
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  console.log('\n[Farm]');
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
    win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  }});
  await new Promise((r) => setTimeout(r, 400));
  const { document: doc } = dom.window;
  doc.querySelector('.tab[data-tab="farm"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  const cells = doc.querySelectorAll('.farm-grid .farm-cell');
  ok(cells.length === 9, '默认 3×3 农田显示 9 个田格（实际 ' + cells.length + '）');
  ok(doc.querySelector('.farm-grid').style.gridTemplateColumns.includes('3'), '宽=3 控制网格列数');
  ok(!!doc.querySelector('.farm-cell[data-plot="0,0"]'), '缺失记录也生成 (0,0) 荒地格');
  ok(!!doc.querySelector('.farm-overflow [data-plot-detail="3,-1"]'), '越界旧记录 3,-1 保留在范围外田格区');
  const farmText = doc.querySelector('.panel[data-panel="farm"]').textContent;
  ok(/田格/.test(farmText) && !/地块/.test(farmText), '农田使用旅店私有“田格”文案，不称宏观地块');

  const schema = fs.readFileSync(path.join(__dirname, '..', '本项目mvu文件.txt'), 'utf8');
  ok(/农田大小[\s\S]*?长[\s\S]*?宽/.test(schema), '项目 MVU schema 参考包含农田大小长宽');

  console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
