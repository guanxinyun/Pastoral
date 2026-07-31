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
  const calls = { slash: [], set: [], del: [], mvuGet: [] };

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost:5501/',
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
      win.Mvu = { getMvuData: (options) => { calls.mvuGet.push(options); return { stat_data: null, marker: 'latest-snapshot' }; } };
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
    ok(!!doc.getElementById('requestStatus') && doc.getElementById('requestStatus').getAttribute('role') === 'status', '请求阶段状态条存在且可被辅助技术读取');
    ok(!!doc.getElementById('fullscreenToggle'), '全屏按钮存在');
    doc.getElementById('settingsBtn').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(30);
    ok(!!doc.querySelector('[name="apiMode"]') && !!doc.querySelector('[name="secondApiUrl"]'), '设置中包含 API 模式和第二 API 参数');
    ok(doc.querySelector('[name="secondApiKey"]').type === 'password', 'API Key 使用密码输入框');
    ok(!!doc.getElementById('retrySecondApi'), '设置中提供手动重试第二 API 操作');
    ok(!!doc.getElementById('testSecondApi'), '设置中提供第二 API 连接测试');
    ok(!!doc.querySelector('[data-settings-tab="prompts"]'), '设置提供独立更新提示词页面');
    doc.querySelector('[data-settings-tab="prompts"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const normalPrompt = doc.querySelector('[name="normalPrompt"]');
    const enddayPrompt = doc.querySelector('[name="enddayPrompt"]');
    ok(!!normalPrompt && !!enddayPrompt, '设置包含普通更新与归寝日结两个提示词输入框');
    ok(normalPrompt.value === '' && enddayPrompt.value === '', '提示词输入框默认保持空白');
    normalPrompt.value = '玩家普通提示'; enddayPrompt.value = '玩家日结提示';
    doc.getElementById('promptSettingsForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    const savedSettings = JSON.parse(win.localStorage.getItem('mrfz_settings'));
    ok(savedSettings.prompts.normal === '玩家普通提示' && savedSettings.prompts.endday === '玩家日结提示', '提示词可从设置页面保存到网页缓存');
    doc.querySelector('.settings-pop__close').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const bubs = doc.querySelectorAll('#stream .bub:not(.bub--typing)');
    ok(bubs.length === 3, '抓取全局对话渲染 3 条气泡（实际 ' + bubs.length + '）');
    const ids = Array.from(bubs).map((b) => b.dataset.mid).join(',');
    ok(ids === '0,1,2', '气泡与 message_id 对应：' + ids);

    // 状态快照来自 lastMessageId，而不是宿主 iframe 所在的 0 楼
    ok(calls.mvuGet.length > 0 && calls.mvuGet.every((o) => o.type === 'message' && o.message_id === 2),
      'MVU 始终读取 lastMessageId=2');
    const snap = win.MVU.getDataSnapshot();
    ok(snap && snap.marker === 'latest-snapshot' && snap !== win.Mvu.getMvuData({ type: 'message', message_id: 2 }),
      '可取得完整且独立的最新楼层 MvuData 快照');

    // 选项来自【最新一楼】
    const choices = Array.from(doc.querySelectorAll('#choices .choice')).map((c) => c.dataset.plain);
    ok(choices.length === 2 && choices[0] === '推门远望', '选项取自最新一楼：' + choices.join(' / '));

    // 图标已渲染
    ok(doc.querySelectorAll('svg.icon-fill').length > 10, '图标已渲染');

    // 面板渲染与脚本设施引力
    const overviewText = doc.querySelector('.panel.is-active').textContent;
    ok(doc.querySelector('.panel.is-active').innerHTML.trim().length > 0, '左页首个面板有内容');
    ok(/日初资金/.test(overviewText) && /今日变化/.test(overviewText), '总览显示日初资金和今日经营变化');
    ok(/5金/.test(doc.getElementById('hudFunds').textContent) && /5金/.test(overviewText), '50000 铜币在 HUD 与预报中显示为 5 金');
    ok(/美食\s*11/.test(overviewText) || doc.querySelector('#radarOverview'), '总览使用脚本汇总的六维设施引力');
    win.dispatchEvent(new win.CustomEvent('pastoral:daily-summary', { detail: { initialFunds: 50000, beforeFunds: 50123, salary: 100, maintenance: 23, afterFunds: 50000, summary: '结算完成' } }));
    const ledgerText = doc.getElementById('dailySummary').textContent;
    ok(/5金1银23铜/.test(ledgerText) && /1银/.test(ledgerText) && /23铜/.test(ledgerText) && /5金/.test(ledgerText), '归寝账簿统一显示金银铜单位');
    doc.querySelector('#dailySummary .settings-pop__close').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    win.dispatchEvent(new win.CustomEvent('pastoral:daily-summary', { detail: { beforeFunds: 50000, salary: 100, maintenance: 20, afterFunds: 49880, updateOk: false, updateError: '第二 API 超时' } }));
    ok(/确定性结算已完成/.test(doc.getElementById('dailySummary').textContent) && /第二 API 超时/.test(doc.getElementById('dailySummary').textContent), '额外 AI 失败仍显示确定性账簿与错误');
    doc.querySelector('#dailySummary .settings-pop__close').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    // 快捷动作叠加，不覆盖玩家已有输入
    const ta = doc.getElementById('composerInput');
    ta.value = '先检查门窗';
    win.Chat.compose('浇灌所有农田');
    win.Chat.compose('小憩片刻');
    ok(ta.value === '先检查门窗\n浇灌所有农田\n小憩片刻', '快捷动作按换行叠加，不覆盖原输入');

    // 归寝先确认，取消不会发送或修改输入
    const beforeEndday = ta.value;
    doc.querySelector('[data-act="endday"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(30);
    ok(!!doc.getElementById('enddayConfirm'), '归寝按钮先打开确认框');
    const cancelEndday = doc.querySelector('#enddayConfirm [data-endday-cancel]');
    ok(!!cancelEndday, '归寝确认框提供取消操作');
    cancelEndday.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok(ta.value === beforeEndday && calls.slash.length === 0, '取消归寝不修改输入且不发送');

    // composer 发送 -> /send + /trigger
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
