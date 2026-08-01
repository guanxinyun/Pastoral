/* ============================================================
   iframe.js · 跨域样式接管 + 全屏烟雾测试（jsdom 父/子文档）
   把卡片装进模拟酒馆页面的 iframe，验证：
   1) 首层卡与其他楼层、酒馆原生输入区正常共存
   2) 全屏按钮只放大当前 iframe 页面，并锁定父页滚动
   用法：node test/iframe.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const CARD = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failed = 0;
function ok(cond, label) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label);
  if (!cond) failed++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 模拟酒馆宿主页：#chat 里 3 层楼 + 原生输入区 */
const HOST_PAGE = `<!DOCTYPE html><html><head><title>SillyTavern</title></head><body>
<div id="chat">
  <div class="mes" mesid="0"><div class="mes_block"><div class="ch_name">旅店</div><div class="mes_text"><div id="cardSlot"></div></div></div></div>
  <div class="mes" mesid="1"><div class="mes_block"><div class="mes_text">用户消息</div></div></div>
  <div class="mes" mesid="2"><div class="mes_block"><div class="mes_text">AI 消息</div></div></div>
</div>
<div id="send_form"><textarea id="send_textarea"></textarea></div>
</body></html>`;

(async () => {
  const errors = [];
  const dom = new JSDOM(HOST_PAGE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost:8000/' });
  const { window: pwin, window: { document: pdoc } } = dom;
  pwin.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });

  // 建 iframe 并注入酒馆 API + 卡片
  const iframe = pdoc.createElement('iframe');
  pdoc.getElementById('cardSlot').appendChild(iframe);

  const chat = [
    { message_id: 0, role: 'assistant', name: '旅店', is_hidden: false, message: '<p>门扉吱呀。</p>' },
    { message_id: 1, role: 'user', name: '我', is_hidden: false, message: '进店' },
    { message_id: 2, role: 'assistant', name: '旅店', is_hidden: false, message: '<p>炉火正旺。</p><options>坐下\n上楼</options>' }
  ];

  const cwin = iframe.contentWindow;
  const cdoc = cwin.document;
  Object.defineProperty(cwin, 'innerWidth', { value: 390, writable: true, configurable: true });
  let requestedElement = null;
  iframe.requestFullscreen = async function () { requestedElement = this; pdoc.fullscreenElement = this; };
  pdoc.exitFullscreen = async function () { pdoc.fullscreenElement = null; };
  Object.assign(cwin, {
    matchMedia: (query) => ({ matches: /max-width:\s*899px/.test(query), media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
    getCurrentMessageId: () => 0,
    getLastMessageId: () => 2,
    getChatMessages: (range) => {
      const s = String(range);
      if (s.includes('-')) { const [a, b] = s.split('-').map(Number); return chat.filter((m) => m.message_id >= a && m.message_id <= b); }
      return chat.filter((m) => m.message_id === Number(s));
    },
    setChatMessages: async () => {},
    deleteChatMessages: async () => {},
    triggerSlash: async () => {},
    waitGlobalInitialized: async () => {},
    formatAsTavernRegexedString: (t) => t,
    Mvu: { getMvuData: () => ({ stat_data: null }) },
    eventOn: () => {},
    iframe_events: { GENERATION_STARTED: 'a', GENERATION_ENDED: 'b' },
    tavern_events: { GENERATION_STOPPED: 'c' },
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0)
  });
  cwin.addEventListener('error', (e) => errors.push(e.message));

  cdoc.open();
  cdoc.write(CARD);
  cdoc.close();
  await wait(700);

  ok(!!cdoc.getElementById('titleScreen') && cdoc.getElementById('book').hasAttribute('inert'), 'iframe 加载后标题先出现');
  cdoc.getElementById('titleStart').dispatchEvent(new cwin.MouseEvent('click', { bubbles: true }));
  await wait(100);
  ok(!cdoc.getElementById('book').hasAttribute('inert') && cdoc.getElementById('prologue').hidden, '已有楼层从标题直接恢复正式界面');
  const embeddedSwitcher = cdoc.querySelector('[data-mobile-page-switcher]');
  const embeddedStoryTab = cdoc.querySelector('[data-mobile-page="story"]');
  ok(embeddedSwitcher && !embeddedSwitcher.hidden && cdoc.body.classList.contains('mobile-page--ledger'), '窄酒馆 iframe 非全屏也启用单页经营视图');
  embeddedStoryTab && embeddedStoryTab.dispatchEvent(new cwin.MouseEvent('click', { bubbles: true }));
  ok(cdoc.body.classList.contains('mobile-page--story'), '窄酒馆 iframe 非全屏可切换剧情页');
  cdoc.querySelector('[data-mobile-page="ledger"]').dispatchEvent(new cwin.MouseEvent('click', { bubbles: true }));

  console.log('\n[1] 第 0 层接管其余聊天楼层');
  const style = pdoc.getElementById('pastoral-host-takeover');
  ok(!!style, '父文档已注入仅供全屏的 <style>');
  const css = style ? style.textContent : '';
  ok(/#chat > \.mes:not\(\[mesid="0"\]\)/.test(css), '接管样式隐藏第 1 层及以后聊天楼层');
  ok(!/#send_form[\s\S]*display:\s*none/.test(css), '接管样式保留原生输入区');
  ok(iframe.classList.contains('pastoral-host-frame'), '宿主 iframe 带有界布局标记');
  ok(/iframe\.pastoral-host-frame[\s\S]*height:\s*clamp\(560px,\s*78vh,\s*900px\)[\s\S]*height:\s*clamp\(560px,\s*78dvh,\s*900px\)/.test(css),
    '父酒馆 iframe 先提供移动 WebView 可识别的 vh 高度，再用 dvh 增强');
  ok(/iframe\.pastoral-host-frame[\s\S]*max-height:\s*calc\(100vh\s*-\s*96px\)[\s\S]*max-height:\s*calc\(100dvh\s*-\s*96px\)/.test(css),
    '宿主 iframe 最大高度同时提供 vh 与 dvh，旧手机不会回退成 150px 短条');

  const mes1 = pdoc.querySelector('.mes[mesid="1"]');
  const mes0 = pdoc.querySelector('.mes[mesid="0"]');
  const form = pdoc.getElementById('send_form');
  ok(pwin.getComputedStyle(mes1).display === 'none', '第 1 层及以后在父页面隐藏');
  ok(pwin.getComputedStyle(mes0).display !== 'none', '第 0 层宿主仍显示');
  ok(pwin.getComputedStyle(form).display !== 'none', '原生输入区仍显示');
  ok(pwin.getComputedStyle(pdoc.querySelector('.mes[mesid="0"] .ch_name')).display !== 'none', '0 楼原有名字条未被剥除');

  console.log('\n[2] 全屏进入 / 退出');
  const btn = cdoc.getElementById('fullscreenToggle');
  ok(!!btn, '全屏按钮存在');
  ok(btn.getAttribute('aria-pressed') === 'false', '初始 aria-pressed=false');

  btn.dispatchEvent(new cwin.MouseEvent('click', { bubbles: true }));
  await wait(120);
  ok(iframe.classList.contains('pastoral-immersive'), '进入：iframe 加沉浸类');
  ok(pdoc.body.classList.contains('pastoral-immersive-lock'), '进入：父页锁滚动');
  ok(cdoc.body.classList.contains('is-immersive'), '进入：卡内 is-immersive');
  ok(btn.getAttribute('aria-pressed') === 'true', '进入：aria-pressed=true');
  ok(btn.dataset.tip === '退出全屏', '进入：提示文案切换');
  ok(pwin.getComputedStyle(iframe).position === 'fixed', 'iframe 实际钉满视口（position:fixed）');
  ok(requestedElement === iframe, '原生全屏请求目标是当前 iframe，而不是父页面根节点');
  const switcher = cdoc.querySelector('[data-mobile-page-switcher]');
  const ledgerTab = cdoc.querySelector('[data-mobile-page="ledger"]');
  const storyTab = cdoc.querySelector('[data-mobile-page="story"]');
  ok(switcher && !switcher.hidden && cdoc.body.classList.contains('mobile-page--ledger'), '手机全屏默认经营页');
  ok(ledgerTab && storyTab && ledgerTab.getAttribute('aria-selected') === 'true'
    && storyTab.getAttribute('aria-selected') === 'false', '经营页 ARIA 状态正确');
  if (storyTab) storyTab.dispatchEvent(new cwin.MouseEvent('click', { bubbles: true }));
  ok(!!storyTab && cdoc.body.classList.contains('mobile-page--story') && storyTab.getAttribute('aria-selected') === 'true', '可切换到剧情页');
  ok(/px$/.test(cdoc.documentElement.style.getPropertyValue('--mobile-viewport-height')), '手机沉浸同步可视视口高度 CSS 变量');

  btn.dispatchEvent(new cwin.MouseEvent('click', { bubbles: true }));
  await wait(120);
  ok(!iframe.classList.contains('pastoral-immersive'), '退出：iframe 去沉浸类');
  ok(!pdoc.body.classList.contains('pastoral-immersive-lock'), '退出：父页解锁滚动');
  ok(!cdoc.body.classList.contains('is-immersive'), '退出：卡内类已移除');
  ok(cdoc.body.classList.contains('mobile-page--ledger') !== cdoc.body.classList.contains('mobile-page--story'), '退出全屏后窄酒馆 iframe 仍保持一个单页视图');
  ok(btn.getAttribute('aria-pressed') === 'false', '退出：aria-pressed=false');

  console.log('\n[3] iframe 内对话流仍正常');
  const bubs = cdoc.querySelectorAll('#stream .bub:not(.bub--typing)');
  ok(bubs.length === 3, 'iframe 内渲染 3 条气泡（实际 ' + bubs.length + '）');
  ok(cdoc.body.classList.contains('in-tavern'), 'in-tavern 标记');

  console.log('\n' + (errors.length ? '运行时错误：\n  ' + errors.join('\n  ') : '无运行时错误'));
  failed += errors.length;
  console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
})();
