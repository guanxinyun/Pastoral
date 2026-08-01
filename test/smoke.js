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
const MIGRATION = fs.readFileSync(path.join(__dirname, '..', '迁移参考资料', 'README.md'), 'utf8');

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
  const mvuFloors = opts.mvuFloors || null;

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
      win.triggerSlash = async (cmd) => {
        calls.slash.push(cmd);
        if (cmd === '/trigger await=true') {
          const nextId = chat[chat.length - 1].message_id + 1;
          chat.push({ message_id: nextId, role: 'assistant', name: '暮归旅店', is_hidden: false, message: '<p>新的回复。</p>' });
        }
      };
      win.waitGlobalInitialized = async () => {};
      win.formatAsTavernRegexedString = (t) => t;
      win.Mvu = {
        getMvuData: (options) => {
          calls.mvuGet.push(options);
          return mvuFloors ? mvuFloors[options.message_id] : { stat_data: win.SAMPLE_STATE || { 旅店: { 资金: 50000 } }, marker: 'latest-snapshot' };
        },
        replaceMvuData: async () => true
      };
      win.getPresetNames = () => ['剧情预设', '变量专用'];
      win.default_preset = { settings: {}, prompts: [], prompts_unused: [], extensions: {} };
      win.createOrReplacePreset = async () => true;
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
    ok(!!doc.getElementById('titleScreen') && doc.getElementById('book').hasAttribute('inert'), '加载后先显示标题且正式界面不可误操作');
    doc.getElementById('titleStart').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(80);
    ok(doc.getElementById('prologue').hidden && !doc.getElementById('book').hasAttribute('inert'), '已有楼层点击开始后跳过序章并恢复存档');
    ok(!!doc.getElementById('pageLeft') && !!doc.getElementById('pageRight'), '双页均在');
    ok(!!doc.getElementById('composerInput'), 'composer 输入框存在');
    ok(!!doc.getElementById('requestStatus') && doc.getElementById('requestStatus').getAttribute('role') === 'status', '请求阶段状态条存在且可被辅助技术读取');
    ok(!!doc.getElementById('fullscreenToggle'), '全屏按钮存在');
    doc.getElementById('settingsBtn').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(30);
    ok(!doc.querySelector('[name="apiMode"]') && !!doc.querySelector('[name="secondApiUrl"]'), '设置直接显示第二 API 参数且不再提供模式开关');
    ok(doc.querySelector('[name="secondApiKey"]').type === 'password', 'API Key 使用密码输入框');
    ok(!!doc.getElementById('retrySecondApi'), '设置中提供手动重试第二 API 操作');
    ok(!!doc.getElementById('testSecondApi'), '设置中提供第二 API 连接测试');
    ok(!!doc.querySelector('[data-settings-tab="prompts"]'), '设置提供独立更新提示词页面');
    ok(!!doc.querySelector('[data-settings-tab="presets"]'), '设置提供独立变量请求预设页面');
    doc.querySelector('[data-settings-tab="presets"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const normalMode = doc.querySelector('[name="normalPresetMode"]');
    const enddayMode = doc.querySelector('[name="enddayPresetMode"]');
    ok(normalMode && enddayMode && normalMode.value === 'current' && enddayMode.value === 'current', '普通与归寝变量请求默认均沿用当前预设');
    ok(Array.from(normalMode.options).map((option) => option.value).join(',') === 'current,fixed'
      && Array.from(enddayMode.options).map((option) => option.value).join(',') === 'current,fixed', '预设只保留当前与指定预设');
    ok(!doc.querySelector('[data-preset-context]'), '不再显示无预设上下文开关');
    normalMode.value = 'fixed'; normalMode.dispatchEvent(new win.Event('change', { bubbles: true }));
    const normalFixed = doc.querySelector('[name="normalPresetName"]');
    ok(!normalFixed.closest('[data-preset-fixed]').hidden && normalFixed.options.length === 2, '固定模式显示酒馆预设列表且排除内部预设');
    normalFixed.value = '变量专用';
    // 深度注入屏蔽对三种模式都要有，所以不能藏在 none 专属的上下文区域里。
    const blockDepth = doc.querySelector('[name="normalBlockDepth"]');
    ok(!!blockDepth && !blockDepth.checked, '预设页提供深度注入屏蔽开关且默认不勾选');
    ok(!blockDepth.closest('[data-preset-context]'), '深度注入屏蔽在当前与指定预设模式下均可见');
    ok(!!doc.querySelector('[name="normalTemperature"]') && doc.querySelector('[name="normalTemperature"]').value === '0',
      '预设页提供采样温度且默认 0');
    const effective = doc.querySelector('[data-preset-effective="normal"]');
    ok(effective && /沿用酒馆深度注入与作者注释/.test(effective.textContent), '预设页说明默认沿用酒馆注入');
    doc.getElementById('presetSettingsForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    let savedSettings = JSON.parse(win.localStorage.getItem('mrfz_settings'));
    ok(savedSettings.variablePresets.normal.mode === 'fixed' && savedSettings.variablePresets.normal.presetName === '变量专用', '变量预设设置保存到网页缓存');
    ok(savedSettings.variablePresets.normal.blockDepthEntries === false && savedSettings.variablePresets.normal.temperature === 0,
      '默认放行与采样温度一并保存');
    blockDepth.checked = true; blockDepth.dispatchEvent(new win.Event('change', { bubbles: true }));
    ok(/已屏蔽深度注入/.test(effective.textContent), '主动勾选后说明文字立即改为屏蔽');
    doc.getElementById('presetSettingsForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    ok(JSON.parse(win.localStorage.getItem('mrfz_settings')).variablePresets.normal.blockDepthEntries === true, '屏蔽选择可持久化');

    ok(!doc.querySelector('[name="normalAssembly"]') && !doc.querySelector('[name="enddayAssembly"]'),
      '界面不再提供跨宿主不一致的 compile/inject 组装开关');
    const effectiveText = doc.querySelector('[data-preset-effective="normal"]');
    ok(/等待约 1 秒.*保留约 2 秒.*切回/.test(effectiveText.textContent), '固定模式说明切换与提示词捕获延迟');
    ok(/只发送一次/.test(effectiveText.textContent), '设置页明确任务只通过 user_input 发送一次');
    ok(!Object.prototype.hasOwnProperty.call(JSON.parse(win.localStorage.getItem('mrfz_settings')).variablePresets.normal, 'assembly'),
      '保存结果不再包含旧 assembly 字段');
    doc.querySelector('[data-settings-tab="prompts"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const normalPrompt = doc.querySelector('[name="normalPrompt"]');
    const enddayPrompt = doc.querySelector('[name="enddayPrompt"]');
    ok(!!normalPrompt && !!enddayPrompt, '设置包含日常更新与归寝日结两个指导输入框');
    ok(normalPrompt.value === win.Settings.builtinGuide('normal') && enddayPrompt.value === win.Settings.builtinGuide('endday'), '两个输入框预填内置默认指导');
    ok(/## 一、日常更新/.test(normalPrompt.value) && !/## 二、归寝日结/.test(normalPrompt.value)
      && /## 二、归寝日结/.test(enddayPrompt.value) && !/## 一、日常更新/.test(enddayPrompt.value), '预填内容分别是日常与归寝两套规则');
    normalPrompt.value = '玩家普通提示'; enddayPrompt.value = '玩家日结提示';
    doc.getElementById('promptSettingsForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    savedSettings = JSON.parse(win.localStorage.getItem('mrfz_settings'));
    ok(savedSettings.prompts.normal === '玩家普通提示' && savedSettings.prompts.endday === '玩家日结提示', '指导可从设置页面保存到网页缓存');
    ok(win.Settings.promptFor('normal', win.Settings.load()) === '玩家普通提示', '保存后的指导会被变量请求真正读取');
    // 预览必须反映输入框里的草稿，否则玩家无法确认"到底发了什么"。
    normalPrompt.value = '草稿指导内容';
    doc.querySelector('[data-preview-prompt="normal"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const previewBox = doc.querySelector('[data-prompt-preview]');
    ok(previewBox && !previewBox.hidden && /草稿指导内容/.test(previewBox.textContent), '预览显示输入框当前草稿');
    ok(/变量更新输出格式/.test(previewBox.textContent), '预览包含自动合并的输出格式');
    doc.querySelector('[data-preview-prompt="endday"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok(/当前阶段：归寝日结/.test(previewBox.textContent), '归寝预览切换到归寝阶段');
    normalPrompt.value = '玩家普通提示';
    doc.querySelector('[data-reset-prompts]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok(normalPrompt.value === win.Settings.builtinGuide('normal') && JSON.parse(win.localStorage.getItem('mrfz_settings')).prompts.normal === '', '恢复内置默认同时还原文本框与缓存');
    doc.querySelector('.settings-pop__close').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    win.Settings.save({ variablePresets: { normal: { mode: 'fixed', presetName: '已删除预设' } } });
    doc.getElementById('settingsBtn').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    doc.querySelector('[data-settings-tab="presets"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const missingPreset = doc.querySelector('[name="normalPresetName"]');
    ok(missingPreset.value === '已删除预设' && /已不存在/.test(missingPreset.selectedOptions[0].textContent), '已删除的固定预设保持原设置并明确提示修正');
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

  /* ---------- 1a. 只有零楼时强制完整序章 ---------- */
  console.log('\n[1a] 只有零楼时强制序章');
  {
    const originalMessage = '```\n```';
    const chat = [{ message_id: 0, role: 'assistant', name: '暮归旅店', is_hidden: false, message: originalMessage }];
    const { win, doc, calls } = load(0, { chat });
    let readyEvents = 0;
    win.addEventListener('pastoral:intro-ready', () => readyEvents++);
    await wait(600);
    const start = doc.getElementById('titleStart');
    start.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    start.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(100);
    const prologueText = doc.getElementById('prologue').textContent;
    ok(/第一年.*春季第1天/.test(prologueText) && /霍根·星摇/.test(prologueText) && /声望\+3/.test(prologueText), '零楼围栏被完整内置序章替代');
    ok(doc.querySelectorAll('[data-prologue-chapter="letter"]').length === 1 && readyEvents === 1, '快速双击只生成一个序章并发出一次就绪事件');
    ok(calls.set.length === 0, '强制序章不覆盖第 0 楼');
    ok(chat[0].message === originalMessage, '第 0 楼原消息保持不变');
    ok(calls.del.length === 0 && calls.slash.length === 0, '强制序章不删除楼层也不触发模型');
  }

  /* ---------- 1b. 生成中新楼 MVU 为空时保持上一楼 ---------- */
  console.log('\n[1b] 等待主模型时保持上一楼 MVU');
  {
    const chat = makeChat().concat({ message_id: 3, role: 'user', name: '我', is_hidden: false, message: '新的行动' });
    const { win } = load(0, { chat, mvuFloors: {
      2: { stat_data: { 旅店: { 资金: 23456 } }, marker: 'previous-valid' },
      3: { stat_data: null }
    } });
    await wait(600);
    const snapshot = win.MVU.getDataSnapshot();
    ok(snapshot.marker === 'previous-valid' && snapshot.stat_data.旅店.资金 === 23456,
      '最新楼未初始化时保持上一楼有效 MVU');
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

  console.log('\n[6] 迁移资料自包含');
  const sections = ['宿主接口', '正文提取', 'MVU 完整快照', '补丁验证', '第二 API', '固定预设', '伪零层', '移动视口', '本地图片', '验收清单'];
  ok(sections.every((title) => MIGRATION.includes(title)), '迁移指南覆盖十个独立重建主题');
  ok(/_types_split\/04-chat-message\.txt/.test(MIGRATION) && /_types_split\/15-ejs-mvu\.txt/.test(MIGRATION) && /slash_command_split\//.test(MIGRATION), '迁移指南精确指向接口切片');
  ok(!/当前源码地图/.test(MIGRATION) && !/### 当前实现/.test(MIGRATION), '迁移指南不再维护 Pastoral 当前源码地图');
  ok(!/`js\/(extract|mvu|api|chat|host|settings)\.js`/.test(MIGRATION) && !/`css\/(layout|components)\.css`/.test(MIGRATION), '迁移不要求读取 Pastoral JS/CSS 原件');
  ok(!/test\/(api|settings|mvu|smoke|iframe|layout)\.js/.test(MIGRATION) && !/docs\/(specs|superpowers)/.test(MIGRATION), '迁移不依赖测试或历史设计稿');

  console.log('\n' + (errors.length ? '运行时错误：\n  ' + errors.join('\n  ') : '无运行时错误'));
  if (errors.length) failed += errors.length;
  console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
})();
