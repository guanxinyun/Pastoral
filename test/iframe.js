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
  Object.defineProperty(pwin, 'innerWidth', { value: 390, writable: true, configurable: true });
  Object.defineProperty(pwin, 'innerHeight', { value: 856, writable: true, configurable: true });
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
  let measuredHeight = 640;
  Object.defineProperty(cwin, 'innerWidth', { value: 390, writable: true, configurable: true });
  Object.defineProperty(cwin, 'innerHeight', { value: 760, writable: true, configurable: true });
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
  Object.defineProperty(cdoc.documentElement, 'scrollHeight', { get: () => measuredHeight, configurable: true });
  Object.defineProperty(cdoc.body, 'scrollHeight', { get: () => measuredHeight, configurable: true });
  await wait(700);

  ok(!!cdoc.getElementById('titleScreen') && cdoc.getElementById('book').hasAttribute('inert'), 'iframe 加载后标题先出现');
  cdoc.getElementById('titleStart').dispatchEvent(new cwin.MouseEvent('click', { bubbles: true }));
  await wait(100);
  ok(!cdoc.getElementById('book').hasAttribute('inert') && cdoc.getElementById('prologue').hidden, '已有楼层从标题直接恢复正式界面');
  ok(cdoc.body.classList.contains('is-game') && !cdoc.body.classList.contains('is-title'),
    '已有存档进入游戏后清除标题阶段状态');
  const embeddedSwitcher = cdoc.querySelector('[data-mobile-page-switcher]');
  const embeddedExit = cdoc.querySelector('[data-mobile-exit]');
  const embeddedLeft = cdoc.getElementById('pageLeft');
  const embeddedRight = cdoc.getElementById('pageRight');
  ok(embeddedSwitcher && embeddedSwitcher.hidden, '窄酒馆 iframe 非全屏隐藏全屏页签');
  ok(embeddedExit && embeddedExit.hidden, '窄酒馆 iframe 非全屏隐藏退出按钮');
  ok(!cdoc.body.classList.contains('mobile-page--ledger') && !cdoc.body.classList.contains('mobile-page--story'),
    '普通内嵌模式不设置全屏单页状态');
  ok(!embeddedLeft.hidden && !embeddedRight.hidden,
    '普通内嵌模式同时保留经营页与剧情页');
  const embeddedBook = cdoc.getElementById('book');
  Object.defineProperty(embeddedBook, 'clientHeight', { value: 760, configurable: true });
  Object.defineProperty(embeddedBook, 'scrollHeight', { value: 1800, configurable: true });
  ok(embeddedBook.scrollHeight > embeddedBook.clientHeight
    && /body\.in-tavern\.in-tavern--dynamic\.is-game:not\(\.is-immersive\)\s+\.book\s*\{[^}]*overflow-y:\s*auto[^}]*touch-action:\s*pan-y/.test(CARD),
  '普通手机内嵌整本书是可触摸的有界滚动区域');
  ok(/body\.in-tavern\.in-tavern--dynamic\.is-game:not\(\.is-immersive\)\s+\.(?:panels|journal__stream)[^}]*overflow:\s*visible/.test(CARD),
    '普通手机内嵌的内部内容区不抢占书本滚动');
  measuredHeight = 980;
  cdoc.body.classList.add('is-prologue');
  await wait(80);
  ok(parseFloat(iframe.style.getPropertyValue('--pastoral-frame-height')) >= 980,
    '序章阶段随完整正文增长宿主 iframe');
  cdoc.body.classList.remove('is-prologue');

  console.log('\n[1] 第 0 层接管其余聊天楼层');
  const style = pdoc.getElementById('pastoral-host-takeover');
  ok(!!style, '父文档已注入仅供全屏的 <style>');
  const css = style ? style.textContent : '';
  ok(/#chat > \.mes:not\(\[mesid="0"\]\)/.test(css), '接管样式隐藏第 1 层及以后聊天楼层');
  ok(!/#send_form[\s\S]*display:\s*none/.test(css), '接管样式保留原生输入区');
  ok(iframe.classList.contains('pastoral-host-frame'), '宿主 iframe 带接管标记');
  ok(iframe.classList.contains('pastoral-host-dynamic'), '窄屏宿主 iframe 使用动态高度模式');
  ok(parseFloat(iframe.style.getPropertyValue('--pastoral-frame-height')) >= 560,
    '标题阶段立即写入至少 560px 的动态 iframe 高度');
  pwin.innerWidth = 1280;
  cwin.innerWidth = 850;
  pwin.dispatchEvent(new pwin.Event('resize'));
  await wait(80);
  ok(!iframe.classList.contains('pastoral-host-dynamic')
    && !cdoc.documentElement.classList.contains('in-tavern--dynamic')
    && !cdoc.body.classList.contains('in-tavern--dynamic'),
  '桌面父视口下窄聊天栏仍使用有界序章滚动，不误判为手机动态高度');
  pwin.innerWidth = 390;
  cwin.innerWidth = 390;
  pwin.dispatchEvent(new pwin.Event('resize'));
  await wait(80);
  ok(iframe.classList.contains('pastoral-host-dynamic')
    && cdoc.documentElement.classList.contains('in-tavern--dynamic')
    && cdoc.body.classList.contains('in-tavern--dynamic'),
  '父视口恢复手机宽度后重新启用动态内嵌高度');
  ok(/iframe\.pastoral-host-dynamic[\s\S]*height:\s*var\(--pastoral-frame-height,\s*560px\)/.test(css),
    '父页面以测量值驱动移动 iframe 高度');
  ok(/iframe\.pastoral-host-frame[\s\S]*height:\s*clamp\(560px,\s*78vh,\s*900px\)[\s\S]*height:\s*clamp\(560px,\s*78dvh,\s*900px\)/.test(css),
    '桌面有界 iframe 保留 vh 与 dvh 高度');
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
  ok(embeddedExit && !embeddedExit.hidden, '进入全屏后显示退出按钮');
  ok(embeddedRight.hidden, '手机全屏经营页语义隐藏剧情页');
  ok(ledgerTab && storyTab && ledgerTab.getAttribute('aria-selected') === 'true'
    && storyTab.getAttribute('aria-selected') === 'false', '经营页 ARIA 状态正确');
  embeddedLeft.scrollTop = 120;
  if (storyTab) storyTab.dispatchEvent(new cwin.MouseEvent('click', { bubbles: true }));
  ok(!!storyTab && cdoc.body.classList.contains('mobile-page--story') && storyTab.getAttribute('aria-selected') === 'true', '可切换到剧情页');
  embeddedLeft.scrollTop = 0; // 模拟 display:none 后浏览器丢弃隐藏页滚动位置
  embeddedRight.scrollTop = 240;
  if (ledgerTab) ledgerTab.dispatchEvent(new cwin.MouseEvent('click', { bubbles: true }));
  embeddedRight.scrollTop = 0;
  await wait(20);
  ok(embeddedLeft.scrollTop === 120, '切回经营页后恢复离开前的滚动位置');
  if (storyTab) storyTab.dispatchEvent(new cwin.MouseEvent('click', { bubbles: true }));
  await wait(20);
  ok(embeddedRight.scrollTop === 240, '切回剧情页后恢复离开前的滚动位置');
  ok(/px$/.test(cdoc.documentElement.style.getPropertyValue('--mobile-viewport-height')), '手机沉浸同步可视视口高度 CSS 变量');

  btn.dispatchEvent(new cwin.MouseEvent('click', { bubbles: true }));
  await wait(120);
  ok(!iframe.classList.contains('pastoral-immersive'), '退出：iframe 去沉浸类');
  ok(!pdoc.body.classList.contains('pastoral-immersive-lock'), '退出：父页解锁滚动');
  ok(!cdoc.body.classList.contains('is-immersive'), '退出：卡内类已移除');
  ok(embeddedSwitcher.hidden && embeddedExit.hidden, '退出全屏后隐藏页签与退出按钮');
  ok(!cdoc.body.classList.contains('mobile-page--ledger') && !cdoc.body.classList.contains('mobile-page--story'),
    '退出全屏后清除单页状态');
  ok(!embeddedLeft.hidden && !embeddedRight.hidden,
    '退出全屏后恢复普通双页流');
  measuredHeight = 2100;
  cdoc.body.classList.add('is-game');
  await wait(80);
  const gameFrameHeight = parseFloat(iframe.style.getPropertyValue('--pastoral-frame-height'));
  ok(gameFrameHeight <= 760,
    '进入游戏后 iframe 回到父视口可用高度而非跟随长内容（实际 ' + gameFrameHeight + 'px）');
  ok(btn.getAttribute('aria-pressed') === 'false', '退出：aria-pressed=false');

  console.log('\n[3] iframe 内对话流仍正常');
  const bubs = cdoc.querySelectorAll('#stream .bub:not(.bub--typing)');
  ok(bubs.length === 2, 'iframe 内剧情页隐藏 0 楼，渲染其余 2 条气泡（实际 ' + bubs.length + '）');
  ok(cdoc.body.classList.contains('in-tavern'), 'in-tavern 标记');

  console.log('\n' + (errors.length ? '运行时错误：\n  ' + errors.join('\n  ') : '无运行时错误'));
  failed += errors.length;
  console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
})();
