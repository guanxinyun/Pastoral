/* ============================================================
   暮归旅店 · 双页书交互主控（伪同层宿主）
   翻页标签切换（inkBleed）/ 底栏动作 / 主题 / 全屏 / 设置
   Chat 以 400ms 高频轮询接管全局对话；stat_data 变化才重渲染面板
   所有玩家动作填入卡内 composer，由玩家确认后 /send + /trigger
   ============================================================ */
(function () {
  'use strict';

  // 唯一宿主判定：非 0 楼直接自我销毁，不再执行任何渲染与轮询
  if (!Host.init()) return;

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- 当前标签 ---------- */
  function currentTab() {
    const t = $('.tab.is-active');
    return t ? t.dataset.tab : 'overview';
  }

  /* ---------- 翻页：切换左页功能面板 ---------- */
  function openTab(name) {
    const panel = $(`.panel[data-panel="${name}"]`);
    if (!panel) return;
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
    $$('.panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === name));
    // 面板由 display:none 转 block 时自动重放 inkBleed 翻页动效；立即渲染该面板
    Render.panel(name, Render.state, true);
  }

  /* ---------- 主题 ---------- */
  function setTheme(th) {
    document.documentElement.setAttribute('data-theme', th);
    const tg = $('#themeToggle');
    if (tg) Icon.set(tg, th === 'night' ? 'sun' : 'moon');
  }
  function toggleTheme() {
    setTheme(document.documentElement.getAttribute('data-theme') === 'night' ? 'day' : 'night');
  }

  /* ---------- 设置浮卡（轻量，非全屏覆层） ---------- */
  function openSettings() {
    const existing = document.getElementById('settingsPop');
    if (existing) { existing.remove(); return; }
    const cfg = Settings.load();
    const backdrop = h('div', { class: 'modal-backdrop settings-backdrop', id: 'settingsBackdrop' });
    const pop = h('section', { class: 'settings-pop', id: 'settingsPop', role: 'dialog', 'aria-modal': 'true', 'aria-label': '设置' });
    const close = () => backdrop.remove();

    pop.appendChild(h('div', { class: 'settings-pop__head' }, [
      h('span', { class: 'ic', html: Icon.get('settings') }),
      h('span', { class: 'settings-pop__title' }, '掌柜手记'),
      h('button', { class: 'settings-pop__close', type: 'button', 'aria-label': '关闭', onclick: close },
        h('span', { class: 'ic', html: Icon.get('close') }))
    ]));

    const tabs = h('div', { class: 'settings-tabs', role: 'tablist', 'aria-label': '设置页面' }, [
      h('button', { class: 'settings-tab is-active', type: 'button', role: 'tab', 'aria-selected': 'true', 'data-settings-tab': 'api' }, '接口设置'),
      h('button', { class: 'settings-tab', type: 'button', role: 'tab', 'aria-selected': 'false', 'data-settings-tab': 'prompts' }, '更新提示词')
    ]);
    pop.appendChild(tabs);
    const apiPage = h('div', { class: 'settings-page is-active', 'data-settings-page': 'api' });
    const promptPage = h('div', { class: 'settings-page', 'data-settings-page': 'prompts', hidden: '' });

    const themeBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' },
      document.documentElement.getAttribute('data-theme') === 'night' ? '当前：夜 · 切昼' : '当前：昼 · 切夜');
    themeBtn.addEventListener('click', () => {
      toggleTheme();
      themeBtn.textContent = document.documentElement.getAttribute('data-theme') === 'night' ? '当前：夜 · 切昼' : '当前：昼 · 切夜';
    });
    apiPage.appendChild(h('div', { class: 'set-row' }, [
      h('div', {}, [h('div', { class: 'set-row__title' }, '昼夜主题'), h('div', { class: 'faint set-help' }, '羊皮纸昼景 / 靛蓝烛夜')]),
      themeBtn
    ]));

    const form = h('form', { class: 'settings-form', id: 'apiSettingsForm' });
    const mode = h('select', { class: 'set-input', name: 'apiMode', 'aria-label': 'API 模式' }, [
      h('option', { value: 'single' }, '单 API'), h('option', { value: 'multi' }, '多 API')
    ]);
    mode.value = cfg.apiMode;
    form.appendChild(h('label', { class: 'set-field' }, [h('span', { class: 'set-field__label' }, 'API 模式'), mode]));

    const apiBox = h('fieldset', { class: 'set-api', id: 'secondApiFields' });
    apiBox.appendChild(h('legend', {}, '第二 API'));
    const field = (label, name, value, type, min) => h('label', { class: 'set-field' }, [
      h('span', { class: 'set-field__label' }, label),
      h('input', { class: 'set-input', name, value, type: type || 'text', min: min == null ? null : min, autocomplete: name === 'secondApiKey' ? 'off' : null })
    ]);
    apiBox.appendChild(field('URL', 'secondApiUrl', cfg.secondApi.url, 'url'));
    apiBox.appendChild(field('API Key', 'secondApiKey', cfg.secondApi.key, 'password'));
    apiBox.appendChild(field('模型名', 'secondApiModel', cfg.secondApi.model));
    apiBox.appendChild(field('超时时间（ms）', 'secondApiTimeout', cfg.secondApi.timeout, 'number', 1000));
    apiBox.appendChild(field('最大重试次数', 'secondApiRetries', cfg.secondApi.maxRetries, 'number', 0));
    form.appendChild(apiBox);

    const syncMode = () => { apiBox.hidden = mode.value !== 'multi'; };
    mode.addEventListener('change', syncMode); syncMode();
    const save = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, '保存 API 设置');
    form.appendChild(save);
    const retry = h('button', { class: 'btn btn--ghost btn--block', id: 'retrySecondApi', type: 'button' }, '重新调用上次失败的第二 API');
    retry.disabled = !(window.ApiEngine && ApiEngine.lastFailure);
    retry.addEventListener('click', async () => {
      retry.disabled = true; retry.textContent = '正在重试…';
      try {
        const result = await ApiEngine.retryLastFailure();
        if (result && result.ok) { toast('success', '第二 API 重试成功', '变量已重新计算并写回最新楼层。'); close(); }
        else toast('error', '重试失败', '主模型变量保持不变。');
      } catch (e) { toast('error', '无法重试', e && e.message || String(e)); }
      finally { retry.textContent = '重新调用上次失败的第二 API'; retry.disabled = !(window.ApiEngine && ApiEngine.lastFailure); }
    });
    form.appendChild(retry);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const next = Settings.save({ apiMode: mode.value, secondApi: {
        url: form.elements.secondApiUrl.value,
        key: form.elements.secondApiKey.value,
        model: form.elements.secondApiModel.value,
        timeout: form.elements.secondApiTimeout.value,
        maxRetries: form.elements.secondApiRetries.value
      } });
      if (next.apiMode === 'multi' && !Settings.isSecondApiComplete(next)) {
        toast('warn', '设置已保存', '第二 API 配置尚不完整，调用时将自动降级。');
      } else toast('success', '设置已保存', next.apiMode === 'multi' ? '双轨 API 已启用。' : '当前使用单 API。');
    });
    apiPage.appendChild(form);

    apiPage.appendChild(h('div', { class: 'notice notice--info set-notice' }, [
      h('span', { class: 'ic notice__icon', html: Icon.get('info') }),
      h('div', {}, '状态始终读取最新楼层 MVU 快照；第二 API 只负责变量计算，失败时自动保留主模型结果。')
    ]));

    const promptForm = h('form', { class: 'settings-form prompt-settings-form', id: 'promptSettingsForm' });
    const promptField = (label, name, value, help) => h('label', { class: 'set-field' }, [
      h('span', { class: 'set-field__label' }, label),
      h('span', { class: 'faint set-help' }, help),
      h('textarea', { class: 'set-input set-textarea', name, rows: '8', placeholder: '留空则使用程序内置默认提示词' }, value)
    ]);
    promptForm.appendChild(promptField('普通变量更新', 'normalPrompt', cfg.prompts.normal, '普通剧情、农事和其他非归寝请求使用。'));
    promptForm.appendChild(promptField('归寝日结', 'enddayPrompt', cfg.prompts.endday, '归寝结算使用；脚本已完成的扣费、植物成长和设施引力不会重复执行。'));
    const promptActions = h('div', { class: 'settings-actions' }, [
      h('button', { class: 'btn btn--ghost', type: 'button', 'data-reset-prompts': '' }, '恢复内置默认'),
      h('button', { class: 'btn btn--primary', type: 'submit' }, '保存提示词')
    ]);
    promptForm.appendChild(promptActions);
    promptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      Settings.save({ prompts: { normal: promptForm.elements.normalPrompt.value, endday: promptForm.elements.enddayPrompt.value } });
      toast('success', '提示词已保存', '空白栏目会继续使用程序内置默认提示词。');
    });
    promptForm.querySelector('[data-reset-prompts]').addEventListener('click', () => {
      promptForm.elements.normalPrompt.value = '';
      promptForm.elements.enddayPrompt.value = '';
      Settings.save({ prompts: { normal: '', endday: '' } });
      toast('info', '已恢复内置默认', '网页缓存中的自定义提示词已清空。');
    });
    promptPage.appendChild(promptForm);
    pop.appendChild(apiPage); pop.appendChild(promptPage);
    $$('.settings-tab', pop).forEach((tab) => tab.addEventListener('click', () => {
      const name = tab.dataset.settingsTab;
      $$('.settings-tab', pop).forEach((item) => { const on = item === tab; item.classList.toggle('is-active', on); item.setAttribute('aria-selected', on ? 'true' : 'false'); });
      $$('.settings-page', pop).forEach((page) => { const on = page.dataset.settingsPage === name; page.classList.toggle('is-active', on); page.hidden = !on; });
    }));

    backdrop.appendChild(pop); document.body.appendChild(backdrop);
    Icon.render(pop);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  }

  function h(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
    });
    return e;
  }

  /* ---------- 全屏（沉浸视口） ---------- */
  function syncFullscreenBtn() {
    const b = $('#fullscreenToggle');
    if (!b) return;
    const on = Host.immersive;
    Icon.set(b.querySelector('.ic'), on ? 'compress' : 'expand');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', on ? '退出全屏' : '进入全屏');
    b.dataset.tip = on ? '退出全屏' : '进入全屏';
  }
  function toggleFullscreen() {
    Host.toggleImmersive();
    syncFullscreenBtn();
  }

  /* ---------- 底栏动作：填入 composer，由玩家确认发送 ---------- */
  function dockAction(act) {
    switch (act) {
      case 'cook': openTab('inventory'); toast('info', '灶事', '择一道食谱烹制。'); break;
      case 'water': Chat.compose('浇灌所有农田'); break;
      case 'rest': Chat.compose('小憩片刻，恢复精力'); break;
      case 'endday': confirmEndday(); break;
    }
  }

  /* ---------- 归寝确认 ---------- */
  function confirmEndday() {
    if (document.getElementById('enddayConfirm') || Chat.busy) return;
    const previous = document.activeElement;
    const ta = $('#composerInput');
    const existing = ta ? String(ta.value || '').trimEnd() : '';
    const action = '归寝入眠，结束今天';
    const finalText = existing ? existing + '\n' + action : action;
    const backdrop = h('div', { class: 'modal-backdrop', id: 'enddayConfirm' });
    const dialog = h('section', { class: 'daily-modal endday-confirm', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'enddayConfirmTitle' });
    const close = () => { backdrop.remove(); if (previous && previous.focus) previous.focus(); };
    dialog.appendChild(h('header', { class: 'daily-modal__head' }, [
      h('span', { class: 'ic', html: Icon.get('moon') }),
      h('h2', { id: 'enddayConfirmTitle' }, '归寝入眠')
    ]));
    dialog.appendChild(h('div', { class: 'daily-modal__body' }, [
      h('p', {}, '结束今天后将结算员工薪资、建筑维护费、植物成长与次日预报。'),
      h('div', { class: 'endday-preview' }, finalText)
    ]));
    const cancel = h('button', { class: 'btn btn--ghost', type: 'button', 'data-endday-cancel': '', onclick: close }, '取消');
    const confirm = h('button', { class: 'btn btn--primary', type: 'button', 'data-endday-confirm': '' }, '结束今天并发送');
    confirm.addEventListener('click', async () => {
      confirm.disabled = true; cancel.disabled = true; confirm.textContent = '正在发送归寝行动…';
      const ok = await Chat.handleUnifiedRequest(finalText, { kind: 'endday' });
      if (ok) close();
      else { confirm.disabled = false; cancel.disabled = false; confirm.textContent = '重新发送'; }
    });
    dialog.appendChild(h('div', { class: 'daily-modal__foot' }, [cancel, confirm]));
    backdrop.appendChild(dialog); document.body.appendChild(backdrop); Icon.render(dialog); confirm.focus();
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
    backdrop.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  function formatLedgerNumber(value) {
    return Money.formatCopper(value);
  }

  /* ---------- 每日总结模态框 ---------- */
  function showDailySummary(detail) {
    const old = document.getElementById('dailySummary'); if (old) old.remove();
    const previous = document.activeElement;
    const backdrop = h('div', { class: 'modal-backdrop', id: 'dailySummary' });
    const dialog = h('section', { class: 'daily-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dailySummaryTitle' });
    const close = () => { backdrop.remove(); if (previous && previous.focus) previous.focus(); };
    dialog.appendChild(h('header', { class: 'daily-modal__head' }, [
      h('span', { class: 'ic', html: Icon.get('moon') }),
      h('h2', { id: 'dailySummaryTitle' }, '今日账簿'),
      h('button', { class: 'settings-pop__close', type: 'button', 'aria-label': '关闭每日总结', onclick: close }, h('span', { class: 'ic', html: Icon.get('close') }))
    ]));
    const value = (n) => Number.isFinite(Number(n)) ? formatLedgerNumber(Number(n)) : '暂无数据';
    const report = detail || {};
    const rows = report.beforeFunds == null ? [] : [
      ['原日初资金', value(report.initialFunds)],
      ['归寝前资金', value(report.beforeFunds)],
      ['员工薪资', '−' + value(report.salary)],
      ['建筑维护', '−' + value(report.maintenance)],
      ['日结后资金', value(report.afterFunds)]
    ];
    dialog.appendChild(h('div', { class: 'daily-modal__body' }, [
      rows.length ? h('dl', { class: 'daily-ledger' }, rows.flatMap(([label, amount]) => [h('dt', {}, label), h('dd', {}, amount)])) : null,
      h('div', { class: 'daily-summary-copy' }, String(report.summary || '').trim() || '日结完成，变量已更新。')
    ]));
    dialog.appendChild(h('div', { class: 'daily-modal__foot' }, [h('span', { class: 'faint' }, detail && detail.source === 'second' ? '由第二 API 结算' : '由当前主 API 结算'), h('button', { class: 'btn btn--primary', type: 'button', onclick: close }, '合上账簿')]));
    backdrop.appendChild(dialog); document.body.appendChild(backdrop); Icon.render(dialog);
    const focusables = () => Array.from(dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    const first = focusables()[0]; if (first) first.focus();
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      const nodes = focusables(); if (!nodes.length) return;
      const a = nodes[0], z = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
  }

  /* ---------- 状态轮询（面板/HUD；对话流由 Chat 自行轮询） ---------- */
  let lastSig = null, lastRaw = null, started = false;

  function refresh(force) {
    const state = MVU.getState();
    const sig = JSON.stringify(state);
    const raw = Chat.latestRaw();

    Render.state = state;
    Render.raw = raw;

    if (force || sig !== lastSig) {
      Render.hud(state);
      Render.panel(currentTab(), state, false);
    }
    if (force || raw !== lastRaw) {
      Render.choices(raw);
    }
    lastSig = sig;
    lastRaw = raw;
  }

  /* ---------- 初始化 ---------- */
  async function init() {
    Icon.render(document);

    // 等待 MVU 就绪
    await MVU.init();

    // 全局消息接管：400ms 高频轮询 + 气泡右键菜单 + composer
    Chat.init();

    // 首屏渲染
    Render.state = MVU.getState();
    Render.raw = Chat.latestRaw();
    Render.hud(Render.state);
    Render.panel(currentTab(), Render.state, true);
    Render.choices(Render.raw);
    lastRaw = Render.raw;
    lastSig = JSON.stringify(Render.state);

    // 对话流有变化时立刻重算选项，不等下一次状态轮询
    window.addEventListener('pastoral:chat', () => refresh(false));
    window.addEventListener('pastoral:daily-summary', (e) => showDailySummary(e.detail || {}));

    // 翻页标签
    $$('.tab').forEach((t) => t.addEventListener('click', () => openTab(t.dataset.tab)));

    // 主题 / 全屏 / 设置
    const themeBtn = $('#themeToggle'); if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    const fsBtn = $('#fullscreenToggle'); if (fsBtn) fsBtn.addEventListener('click', toggleFullscreen);
    syncFullscreenBtn();
    const setBtn = $('#settingsBtn'); if (setBtn) setBtn.addEventListener('click', openSettings);

    // 底栏
    $$('.dock__btn').forEach((b) => b.addEventListener('click', () => dockAction(b.dataset.act)));

    // Esc 关设置
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { const p = document.getElementById('settingsBackdrop'); if (p) p.remove(); }
    });

    // 外部退出全屏（Esc / 系统手势）时同步按钮
    window.addEventListener('pastoral:immersive', syncFullscreenBtn);

    // 1s 状态轮询（对话流由 Chat 以 400ms 独立轮询）
    if (!started) { started = true; setInterval(refresh, 1000); }

    // 欢迎语
    setTimeout(() => toast('magic', '暮归旅店 · 开张志', '愿这盏烛火，照亮你重建家业的路。'), 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
