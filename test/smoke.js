/* ============================================================
   smoke.js · 伪同层烟雾测试（jsdom）
   1) 0 楼宿主：渲染双页 / 抓取全局对话 / 气泡与楼层号对应 / composer 存在
   2) 非 0 楼：自我销毁（body 清空）
   3) 独立预览（无酒馆 API）：样例数据回退，不报错
   用法：node test/smoke.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let failed = 0;
function ok(cond, label) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label);
  if (!cond) failed++;
}

/** 构造聊天记录：0 楼卡片 + 若干对话 */
function makeChat() {
  return [
    { message_id: 0, role: 'assistant', name: '暮归旅店', is_hidden: false, message: '<p>旅店的门扉在暮色里吱呀作响。</p><options>擦净柜台\n清点库存</options>' },
    { message_id: 1, role: 'user', name: '我', is_hidden: false, message: '擦净柜台' },
    { message_id: 2, role: 'assistant', name: '暮归旅店', is_hidden: false, message: '<p>木纹重新透出温润的光。</p><options>推门远望\n生火煮茶</options>' }
  ];
}

/** 在 jsdom 中加载卡片；floor=null 表示无酒馆 API（独立预览） */
function load(floor, opts = {}) {
  const chat = opts.chat || makeChat();
  const calls = { slash: [], set: [], del: [] };

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(win) {
      win.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
      // jsdom 未实现 matchMedia（浏览器原生具备），补桩
      win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      if (floor === null) return; // 独立预览：不注入任何酒馆 API

      win.getCurrentMessageId = () => floor;
      win.getLastMessageId = () => chat[chat.length - 1].message_id;
      win.getChatMessages = (range) => {
        const s = String(range);
        if (s.includes('-')) {
          const [a, b] = s.split('-').map(Number);
          return chat.filter((m) => m.message_id >= a && m.message_id <= b);
        }
        const n = Number(s);
        const id = n < 0 ? chat[chat.length + n].message_id : n;
        return chat.filter((m) => m.message_id === id);
      };
      win.setChatMessages = async (arr) => { calls.set.push(arr); arr.forEach((u) => { const m = chat.find((c) => c.message_id === u.message_id); if (m && u.message !== undefined) m.message = u.message; }); };
      win.deleteChatMessages = async (ids) => { calls.del.push(ids); ids.forEach((id) => { const i = chat.findIndex((c) => c.message_id === id); if (i >= 0) chat.splice(i, 1); }); };
      win.triggerSlash = async (cmd) => { calls.slash.push(cmd); };
      win.waitGlobalInitialized = async () => {};
      win.formatAsTavernRegexedString = (t) => t;
      win.Mvu = { getMvuData: () => ({ stat_data: null }) };
      win.eventOn = () => {};
      win.iframe_events = { GENERATION_STARTED: 'a', GENERATION_ENDED: 'b' };
      win.tavern_events = { GENERATION_STOPPED: 'c' };
    }
  });
  return { dom, win: dom.window, doc: dom.window.document, chat, calls };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let errors = [];

  /* ---------- 1. 0 楼宿主 ---------- */
  console.log('\n[1] 0 楼宿主渲染');
  {
    const { win, doc, calls } = load(0);
    win.addEventListener('error', (e) => errors.push('floor0: ' + e.message));
    await wait(600);

    ok(doc.body.innerHTML.length > 0, 'body 未被销毁');
    ok(!!doc.getElementById('pageLeft') && !!doc.getElementById('pageRight'), '双页均在');
    ok(!!doc.getElementById('composerInput'), 'composer 输入框存在');
    ok(!!doc.getElementById('fullscreenToggle'), '全屏按钮存在');

    const bubs = doc.querySelectorAll('#stream .bub:not(.bub--typing)');
    ok(bubs.length === 3, '抓取全局对话渲染 3 条气泡（实际 ' + bubs.length + '）');
    const ids = Array.from(bubs).map((b) => b.dataset.mid).join(',');
    ok(ids === '0,1,2', '气泡与 message_id 对应：' + ids);

    // 选项来自【最新一楼】
    const choices = Array.from(doc.querySelectorAll('#choices .choice')).map((c) => c.dataset.plain);
    ok(choices.length === 2 && choices[0] === '推门远望', '选项取自最新一楼：' + choices.join(' / '));

    // 图标已渲染
    ok(doc.querySelectorAll('svg.icon-fill').length > 10, '图标已渲染');

    // 面板渲染
    ok(doc.querySelector('.panel.is-active').innerHTML.trim().length > 0, '左页首个面板有内容');

    // composer 发送 -> /send + /trigger
    const ta = doc.getElementById('composerInput');
    ta.value = '推门远望';
    doc.getElementById('composerSend').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(300);
    const sent = calls.slash.join(' | ');
    ok(/\/send 推门远望/.test(sent), '/send 已发出：' + sent);
    ok(/\/trigger/.test(sent), '/trigger 已发出');
  }

  /* ---------- 2. 非 0 楼自我销毁 ---------- */
  console.log('\n[2] 非 0 楼自我销毁');
  {
    const { win, doc } = load(2);
    win.addEventListener('error', (e) => errors.push('floor2: ' + e.message));
    await wait(400);
    ok(doc.body.innerHTML.trim() === '', 'body 已清空');
    ok(doc.querySelectorAll('#stream .bub').length === 0, '无气泡渲染（不轮询）');
  }

  /* ---------- 3. 独立预览回退 ---------- */
  console.log('\n[3] 独立预览（无酒馆 API）');
  {
    const { win, doc } = load(null);
    win.addEventListener('error', (e) => errors.push('standalone: ' + e.message));
    await wait(600);
    ok(!!doc.getElementById('pageLeft'), '双页仍渲染');
    ok(doc.body.classList.contains('standalone'), 'standalone 标记');
    ok(doc.querySelectorAll('#stream .bub').length >= 1, '样例原文渲染气泡');
    ok(doc.querySelector('#hudFunds').textContent.trim() !== '', 'HUD 有样例数据');
  }

  /* ---------- 4. 编辑 / 删除写回对应 message_id ---------- */
  console.log('\n[4] 编辑 / 删除 兼容 message_id');
  {
    const { win, doc, chat, calls } = load(0);
    win.addEventListener('error', (e) => errors.push('edit: ' + e.message));
    await wait(600);

    // 右键 1 楼
    const b1 = doc.querySelector('.bub[data-mid="1"]');
    b1.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }));
    await wait(60);
    const menu = doc.getElementById('bubMenu');
    ok(!!menu, '右键菜单已弹出');
    const items = Array.from(menu.querySelectorAll('.bub-menu__item')).map((i) => i.textContent.trim());
    ok(items.length === 3, '菜单含 复制/编辑/删除（' + items.join(' · ') + '）');

    // 编辑
    items.forEach(() => {});
    const editBtn = Array.from(menu.querySelectorAll('.bub-menu__item')).find((i) => /编辑/.test(i.textContent));
    editBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(60);
    const ta = doc.querySelector('.bub[data-mid="1"] .bub-edit');
    ok(!!ta, '编辑框出现');
    ta.value = '擦净柜台，并点亮灯';
    Array.from(doc.querySelectorAll('.bub[data-mid="1"] .bub-edit__bar button')).find((b) => b.textContent === '保存')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(200);
    ok(calls.set.length === 1 && calls.set[0][0].message_id === 1, 'setChatMessages 写回 message_id=1');
    ok(chat.find((c) => c.message_id === 1).message === '擦净柜台，并点亮灯', '原文已更新');

    // 删除（两步确认）
    const b2 = doc.querySelector('.bub[data-mid="2"]');
    b2.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }));
    await wait(60);
    const delBtn = Array.from(doc.getElementById('bubMenu').querySelectorAll('.bub-menu__item')).find((i) => /删除/.test(i.textContent));
    delBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(40);
    ok(calls.del.length === 0, '首次点击不删除（等确认）');
    ok(/确认删除/.test(delBtn.textContent), '按钮进入确认态');
    delBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(200);
    ok(calls.del.length === 1 && calls.del[0][0] === 2, 'deleteChatMessages 删除 message_id=2');

    // 0 楼受保护
    const b0 = doc.querySelector('.bub[data-mid="0"]');
    b0.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }));
    await wait(60);
    const m0 = doc.getElementById('bubMenu');
    ok(m0.querySelectorAll('.bub-menu__item').length === 1, '0 楼仅允许复制');
    ok(!!m0.querySelector('.bub-menu__note'), '0 楼有保护说明');
  }

  /* ---------- 5. Hash 机制：无变化不重绘 ---------- */
  console.log('\n[5] Hash 机制避免无效重绘');
  {
    const { win, doc } = load(0);
    win.addEventListener('error', (e) => errors.push('hash: ' + e.message));
    await wait(600);
    const first = doc.querySelector('.bub[data-mid="1"]');
    await wait(900); // 跨越多个 400ms 轮询周期
    const same = doc.querySelector('.bub[data-mid="1"]');
    ok(first === same, '对话未变时气泡 DOM 节点未被替换');
  }

  console.log('\n' + (errors.length ? '运行时错误：\n  ' + errors.join('\n  ') : '无运行时错误'));
  if (errors.length) failed += errors.length;
  console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
})();
