/* ============================================================
   暮归旅店 · 双页书交互主控
   翻页标签切换（inkBleed）/ 底栏动作 / 主题 / 设置
   1s 轮询：rawText + stat_data 变化才重渲染（逐面板签名比对）
   所有玩家动作经 /setinput 发给 AI，前端不本地改状态
   ============================================================ */
(function () {
  'use strict';

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
    const pop = h('div', { class: 'settings-pop', id: 'settingsPop', role: 'dialog', 'aria-label': '设置' });
    const close = () => pop.remove();

    pop.appendChild(h('div', { class: 'settings-pop__head' }, [
      h('span', { class: 'ic', html: Icon.get('settings') }),
      h('span', { class: 'settings-pop__title' }, '掌柜手记'),
      h('button', { class: 'settings-pop__close', 'aria-label': '关闭', onclick: close },
        h('span', { class: 'ic', html: Icon.get('close') }))
    ]));

    const themeBtn = h('button', { class: 'btn btn--ghost btn--sm' },
      document.documentElement.getAttribute('data-theme') === 'night' ? '当前：夜 · 切昼' : '当前：昼 · 切夜');
    themeBtn.addEventListener('click', () => {
      toggleTheme();
      themeBtn.textContent = document.documentElement.getAttribute('data-theme') === 'night' ? '当前：夜 · 切昼' : '当前：昼 · 切夜';
    });
    pop.appendChild(h('div', { class: 'set-row' }, [
      h('div', null, [
        h('div', { class: 'set-row__title' }, '昼夜主题'),
        h('div', { class: 'faint', style: 'font-size:var(--font-size-2xs)' }, '羊皮纸昼景 / 靛蓝烛夜')
      ]),
      themeBtn
    ]));

    pop.appendChild(h('div', { class: 'notice notice--info', style: 'margin-top:var(--space-3)' }, [
      h('span', { class: 'ic notice__icon', html: Icon.get('info') }),
      h('div', null, '本界面由酒馆助手驱动，状态读自 MVU 变量；动作经 /setinput 写入输入框，由 AI 推进世界。')
    ]));

    document.body.appendChild(pop);
    Icon.render(pop);
    // 点击浮卡外部关闭
    setTimeout(() => {
      const handler = (e) => { if (!pop.contains(e.target)) { close(); document.removeEventListener('mousedown', handler); } };
      document.addEventListener('mousedown', handler);
    }, 0);
  }

  function h(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
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

  /* ---------- 底栏动作 ---------- */
  function dockAction(act) {
    switch (act) {
      case 'cook': openTab('inventory'); toast('info', '灶事', '择一道食谱烹制。'); break;
      case 'water': triggerSlash('/setinput 浇灌所有农田'); break;
      case 'rest': triggerSlash('/setinput 小憩片刻，恢复精力'); break;
      case 'endday': triggerSlash('/setinput 归寝入眠，结束今天'); break;
    }
  }

  /* ---------- 轮询刷新 ---------- */
  let lastRaw = null, lastSig = null, started = false;

  function refresh(force) {
    const raw = Extract.getRawText();
    const state = MVU.getState();
    const sig = JSON.stringify(state);
    const rawChanged = force || raw !== lastRaw;
    const stateChanged = force || sig !== lastSig;

    Render.state = state;
    Render.raw = raw;

    if (stateChanged) {
      Render.hud(state);
      Render.panel(currentTab(), state, false);
    }
    if (rawChanged) {
      Render.narrative(raw);
      Render.choices(raw);
    }
    lastRaw = raw;
    lastSig = sig;
  }

  /* ---------- 初始化 ---------- */
  async function init() {
    Icon.render(document);

    // 等待 MVU 就绪
    await MVU.init();

    // 首屏渲染
    Render.state = MVU.getState();
    Render.raw = Extract.getRawText();
    Render.hud(Render.state);
    Render.panel(currentTab(), Render.state, true);
    Render.narrative(Render.raw);
    Render.choices(Render.raw);
    lastRaw = Render.raw;
    lastSig = JSON.stringify(Render.state);

    // 翻页标签
    $$('.tab').forEach((t) => t.addEventListener('click', () => openTab(t.dataset.tab)));

    // 主题 / 设置
    const themeBtn = $('#themeToggle'); if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    const setBtn = $('#settingsBtn'); if (setBtn) setBtn.addEventListener('click', openSettings);

    // 底栏
    $$('.dock__btn').forEach((b) => b.addEventListener('click', () => dockAction(b.dataset.act)));

    // Esc 关设置
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { const p = document.getElementById('settingsPop'); if (p) p.remove(); }
    });

    // 1s 轮询
    if (!started) { started = true; setInterval(refresh, 1000); }

    // 欢迎语
    setTimeout(() => toast('magic', '暮归旅店 · 开张志', '愿这盏烛火，照亮你重建家业的路。'), 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
