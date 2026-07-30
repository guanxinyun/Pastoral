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
      case 'endday': Chat.compose('归寝入眠，结束今天'); break;
    }
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
      if (e.key === 'Escape') { const p = document.getElementById('settingsPop'); if (p) p.remove(); }
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
