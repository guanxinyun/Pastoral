/* mobile-unmanaged.js · 父 frame 不可访问时的手机正式页回退 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let failed = 0;
function ok(cond, label) { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failed++; }
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost:5501/',
    beforeParse(win) {
      Object.defineProperty(win, 'innerWidth', { value: 375, configurable: true });
      Object.defineProperty(win, 'innerHeight', { value: 150, configurable: true });
      win.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      win.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
      win.getCurrentMessageId = () => 0;
      win.getLastMessageId = () => 1;
      win.getChatMessages = () => [{ message_id: 1, role: 'assistant', name: '旅店', message: '已有存档' }];
      win.setChatMessages = async () => {};
      win.waitGlobalInitialized = async () => {};
      win.formatAsTavernRegexedString = (text) => text;
      win.Mvu = { getMvuData: () => ({ stat_data: null }) };
      win.eventOn = () => {};
      win.iframe_events = { GENERATION_STARTED: 'a', GENERATION_ENDED: 'b' };
      win.tavern_events = { GENERATION_STOPPED: 'c' };
    }
  });
  const { window: win } = dom;
  const doc = win.document;
  await wait(600);
  doc.getElementById('titleStart').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(100);

  ok(doc.documentElement.classList.contains('in-tavern--unmanaged'), '父 frame 不可得时标记 unmanaged 回退');
  ok(doc.body.classList.contains('is-game'), '已有存档进入正式游戏');
  const bodyStyle = win.getComputedStyle(doc.body);
  ok(bodyStyle.minHeight === '640px' && bodyStyle.height === 'auto' && bodyStyle.overflow === 'visible',
    '正式游戏向宿主暴露至少 640px 内容高度');
  const exit = doc.querySelector('[data-mobile-exit]');
  ok(exit && exit.hidden, '非全屏 unmanaged 手机隐藏退出按钮');

  console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
