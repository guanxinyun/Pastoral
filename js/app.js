/* ============================================================
   暮归旅店 · 交互逻辑
   抽屉 / 模态 / 吐司 / 雷达 / 地图 / 数值 / 时段 / 主题
   ============================================================ */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 通用：创建元素 ---------- */
  function h(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) e.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  /** SVG 元素创建（必须用 createElementNS，否则不渲染） */
  function sh(tag, attrs = {}, children = []) {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') e.setAttribute('class', v);
      else if (k === 'html') e.innerHTML = v;
      else if (v !== null && v !== undefined) e.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  /* ============================================================
     资金：格式化 + 翻页动画
     ============================================================ */
  function formatFunds(silver) {
    const g = Math.floor(silver / 100);
    const s = silver % 100;
    return g > 0 ? `${g}金${s}银` : `${s}银`;
  }
  function setFundsText(el, newText) {
    if (el.textContent.trim() === newText) return;
    if (reduceMotion) { el.textContent = newText; return; }
    const old = el.textContent.trim();
    el.innerHTML = '';
    const oldS = h('span', { class: 'flip-old' }, old);
    const newS = h('span', { class: 'flip-new' }, newText);
    el.append(oldS, newS);
    setTimeout(() => { el.textContent = newText; }, 620);
  }
  function renderFunds(animate = true) {
    const el = $('#fundsValue');
    if (animate) setFundsText(el, formatFunds(GAME.funds));
    else el.textContent = formatFunds(GAME.funds);
    // 金币图标轻跳
    const ic = $('.funds__icon');
    if (ic && !reduceMotion) {
      ic.style.animation = 'none';
      void ic.offsetWidth;
      ic.style.animation = 'coin-hop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
    }
  }
  function addFunds(delta) {
    GAME.funds = Math.max(0, GAME.funds + delta);
    renderFunds(true);
  }

  /* ============================================================
     状态条：精力 / 压力（含裂纹与呼吸）
     ============================================================ */
  function updateStatBars() {
    const eFill = $('#energyFill'), eTrack = $('#energyTrack');
    eFill.style.setProperty('--p', GAME.energy + '%');
    eFill.classList.toggle('low', GAME.energy < 20);
    $('#energyVal').textContent = `${GAME.energy} / 100`;

    const sFill = $('#stressFill'), sTrack = $('#stressTrack');
    sFill.style.setProperty('--p', GAME.stress + '%');
    $('#stressVal').textContent = `${GAME.stress} / 100`;
    sTrack.classList.toggle('warn', GAME.stress >= 50 && GAME.stress < 80);
    sTrack.classList.toggle('critical', GAME.stress >= 80);
  }
  function changeStat(kind, delta) {
    if (kind === 'energy') GAME.energy = Math.max(0, Math.min(100, GAME.energy + delta));
    if (kind === 'stress') GAME.stress = Math.max(0, Math.min(100, GAME.stress + delta));
    updateStatBars();
  }

  /* ============================================================
     雷达图（通用，支持动画与顶点交互）
     ============================================================ */
  function polar(cx, cy, r, angleDeg) {
    const a = (angleDeg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function drawRadar(svg, axes, vals, max, opts = {}) {
    const size = opts.size || 240;
    const cx = size / 2, cy = size / 2;
    const R = size / 2 - (opts.pad || 42);
    const n = axes.length;
    const vR = opts.vertexR || 3.5;
    const ang = (i) => (360 / n) * i;
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.innerHTML = '';

    // 同心网格（4 层）
    for (let g = 1; g <= 4; g++) {
      const rr = (R * g) / 4;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const [x, y] = polar(cx, cy, rr, ang(i));
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      svg.appendChild(sh('polygon', {
        class: 'radar__grid', points: pts.join(' '),
        style: g === 4 ? 'stroke:var(--color-border-strong)' : ''
      }));
    }
    // 轴线 + 标签
    axes.forEach((ax, i) => {
      const [x, y] = polar(cx, cy, R, ang(i));
      svg.appendChild(sh('line', { class: 'radar__axis', x1: cx, y1: cy, x2: x.toFixed(1), y2: y.toFixed(1) }));
      if (opts.showLabels !== false) {
        const [lx, ly] = polar(cx, cy, R + (opts.labelPad || 18), ang(i));
        svg.appendChild(sh('text', { class: 'radar__label', x: lx.toFixed(1), y: ly.toFixed(1) }, ax.name || ax));
      }
    });

    // 数据多边形 + 顶点
    const area = sh('polygon', { class: 'radar__area', points: '' });
    if (opts.color) area.style.fill = opts.color;
    svg.appendChild(area);
    const verts = [];
    vals.forEach((v, i) => {
      const vt = sh('circle', { class: 'radar__vertex', cx: cx, cy: cy, r: vR, 'data-key': axes[i].key != null ? axes[i].key : i });
      svg.appendChild(vt);
      verts.push(vt);
      if (opts.showVals !== false) {
        const [tx, ty] = polar(cx, cy, R + (opts.labelPad || 18) - 6, ang(i));
        svg.appendChild(sh('text', { class: 'radar__val', x: tx.toFixed(1), y: (ty + 8).toFixed(1) }, String(v)));
      }
      if (opts.onVertex) {
        vt.addEventListener('mouseenter', () => opts.onVertex(axes[i], i));
        vt.addEventListener('click', () => opts.onVertex(axes[i], i));
      }
    });

    // 动画：从中心向外弹性拉伸
    const start = performance.now();
    const dur = reduceMotion ? 1 : 900;
    function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      const ease = 1 - Math.pow(1 - t, 3);
      const pts = vals.map((v, i) => {
        const r = R * (v / max) * ease;
        const [x, y] = polar(cx, cy, r, ang(i));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      area.setAttribute('points', pts.join(' '));
      verts.forEach((vt, i) => {
        const r = R * (vals[i] / max) * ease;
        const [x, y] = polar(cx, cy, r, ang(i));
        vt.setAttribute('cx', x.toFixed(1));
        vt.setAttribute('cy', y.toFixed(1));
      });
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function initRadarOverview() {
    const svg = $('#radarOverview');
    const bubble = $('#dimBubble'), bTitle = $('#dimBubbleTitle'), bBody = $('#dimBubbleBody');
    const max = 100;
    drawRadar(svg, DIMS, DIMS.map(d => d.val), max, {
      size: 240, pad: 44, labelPad: 20,
      onVertex: (dim) => {
        bTitle.textContent = `${dim.name} · 引力 ${dim.val}`;
        bTitle.style.color = dim.color;
        bBody.innerHTML = dim.sources.map(([n, v]) =>
          `<div class="dim-source"><span>${n}</span><span>+${v}</span></div>`).join('');
        bubble.classList.add('is-open');
      }
    });
    // 离开雷达时收起气泡
    svg.addEventListener('mouseleave', () => bubble.classList.remove('is-open'));
  }

  function initStaffRadar(svgId, staff) {
    const svg = $('#' + svgId);
    if (!svg) return;
    const axes = STAFF_AXES.map((n, i) => ({ name: '', key: i }));
    const max = 20;
    drawRadar(svg, axes, staff.vals, max, { size: 60, pad: 6, labelPad: 0, showLabels: false, showVals: false, vertexR: 1.8 });
  }

  /* ============================================================
     地图网格
     ============================================================ */
  function buildMap() {
    const grid = $('#mapGrid');
    grid.innerHTML = '';
    const explored = new Set(Object.keys(TILES));
    const N = 15, C = 7;
    const neighbors = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dx, dy]) => explored.has(`${x + dx},${y + dy}`));

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const x = c - C, y = r - C;
        const key = `${x},${y}`;
        const cell = h('div', { class: 'map-cell', 'data-x': x, 'data-y': y });
        if (explored.has(key)) {
          const t = TILES[key];
          cell.classList.add('explored');
          if (x === 0 && y === 0) cell.classList.add('center');
          cell.innerHTML = `<span class="ic map-cell__icon" data-i="${t.icon}"></span>`;
          cell.title = `${t.name} (${x},${y})`;
          cell.addEventListener('click', () => showTileDetail(x, y, t));
        } else {
          cell.classList.add('fog');
          if (neighbors(x, y)) {
            cell.classList.add('adjacent');
            cell.title = `未知地块 (${x},${y}) · 可探索`;
            // 迷雾粒子
            const parts = h('div', { class: 'fog-particles' });
            for (let p = 0; p < 3; p++) {
              const s = h('span');
              s.style.left = (10 + p * 28) + '%';
              s.style.top = (20 + (p % 2) * 40) + '%';
              s.style.animationDelay = (p * 0.9) + 's';
              parts.appendChild(s);
            }
            cell.appendChild(parts);
            cell.addEventListener('click', () => exploreConfirm(x, y));
          }
        }
        grid.appendChild(cell);
      }
    }
    Icon.render(grid);
  }

  function showTileDetail(x, y, t) {
    const box = $('#tileDetail');
    const resHtml = t.res.length
      ? t.res.map(([n, q]) => `<div class="dim-source"><span>${n}</span><span>×${q}</span></div>`).join('')
      : '<div class="faint" style="font-size:var(--font-size-xs)">此地暂无可采资源。</div>';
    let crop = '';
    if (t.type === 'field') {
      crop = `
        <div class="crop-plot" style="margin-top:var(--space-3)">
          <div class="crop-plot__head"><span class="ic" data-i="wheat" style="color:var(--color-success);--ic:18px"></span><span class="crop-plot__name">种植区 · (${x},${y})</span></div>
          <div class="row--between row" style="margin-bottom:4px"><span class="faint" style="font-size:var(--font-size-2xs)">晨露麦 · 已浇水</span><span class="faint" style="font-size:var(--font-size-2xs)">2 / 4 天</span></div>
          <div class="grow-bar"><div class="grow-bar__fill" style="width:50%"></div></div>
        </div>`;
    }
    box.innerHTML = `
      <div class="card tile-detail" style="margin-top:var(--space-4)">
        <div class="tile-detail__head">
          <span class="ic ic--lg" data-i="${t.icon}" style="color:var(--color-primary)"></span>
          <div class="col"><span class="serif" style="font-weight:600;font-size:var(--font-size-md)">${t.name}</span>
          <span class="tile-detail__coord">坐标 (${x}, ${y}) · ${typeLabel(t.type)}</span></div>
        </div>
        <p class="muted" style="font-size:var(--font-size-xs);line-height:1.7;margin:var(--space-2) 0">${t.desc}</p>
        <div class="list-h" style="margin:var(--space-3) 0 var(--space-2)"><span>当前可采集</span></div>
        <div>${resHtml}</div>
        ${crop}
        <button class="btn btn--primary btn--block btn--sm" style="margin-top:var(--space-3)" data-gather="${t.name}"><span class="ic btn__icon" data-i="bag"></span>前往采集</button>
      </div>`;
    Icon.render(box);
    box.querySelector('[data-gather]').addEventListener('click', () => {
      toast('success', '采集完成', `你在「${t.name}」收获了一些${t.res.length ? '「' + t.res[0][0] + '」' : '材料'}。`);
      burst(window.innerWidth / 2, window.innerHeight / 2);
      changeStat('energy', -4);
    });
  }
  function typeLabel(t) {
    return ({ inn: '旅店', field: '田地', forest: '森林', lake: '溪流', mountain: '山岩', cave: '洞穴' })[t] || '地块';
  }

  function exploreConfirm(x, y) {
    openModal({
      icon: 'compass', title: '探索未知地块',
      body: `
        <div class="notice notice--info"><span class="ic notice__icon" data-i="info"></span>
        <div>前往 <strong>(${x}, ${y})</strong> 探索需消耗 <strong>精力 12</strong>，可能发现新资源、新地块或遭遇事件。</div></div>
        <div class="row" style="gap:var(--space-2)"><span class="pill pill--amber">耗时 半日</span><span class="pill">消耗 精力12</span><span class="pill pill--mint">可能 触发事件</span></div>`,
      actions: [
        { label: '再想想', ghost: true },
        { label: '出发探索', primary: true, onClick: () => {
          if (GAME.energy < 12) { toast('error', '精力不足', '掌柜太累了，先休息片刻吧。'); return; }
          changeStat('energy', -12);
          // 随机揭示一个地块类型
          const pool = [
            { type: 'forest', icon: 'tree', name: '幽密林', desc: '林木更深，菌香更浓。', res: [['苔松茸', '5'], ['清露香草', '3']] },
            { type: 'field', icon: 'berry', name: '野莓坡', desc: '一片结果的野莓丛。', res: [['山莓', '7'], ['铃兰', '4']] },
            { type: 'cave', icon: 'cave', name: '苔洞深处', desc: '洞壁泛着薄荷蓝微光。', res: [['净水符石', '1'], ['青石板', '8']] },
          ];
          const found = pool[Math.floor(Math.random() * pool.length)];
          TILES[`${x},${y}`] = found;
          buildMap();
          closeModal();
          toast('magic', '探索成功', `你发现了「${found.name}」！`);
          addNarrative('event', '探索', `你拨开迷雾，向 (${x},${y}) 走去。渐渐地，一片<span class="hl">${found.name}</span>显露在眼前——${found.desc}`);
          burst(window.innerWidth / 2, window.innerHeight / 2);
        } }
      ]
    });
  }

  /* ============================================================
     抽屉 / 面板
     ============================================================ */
  const PANEL_META = {
    overview:  { title: '旅店总览', icon: 'house' },
    inventory: { title: '库存管理', icon: 'bag' },
    building:  { title: '建筑管理', icon: 'hammer' },
    map:       { title: '地图与探索', icon: 'compass' },
    staff:     { title: '员工管理', icon: 'person' },
    visitor:   { title: '访客管理', icon: 'key' },
    quest:     { title: '任务日志', icon: 'scroll' },
    farm:      { title: '农牧总览', icon: 'wheat' },
  };
  function openPanel(name) {
    const meta = PANEL_META[name];
    if (!meta) return;
    $$('.rail-btn').forEach(b => b.classList.toggle('is-active', b.dataset.panel === name));
    $$('.panel').forEach(p => p.classList.toggle('is-active', p.dataset.panel === name));
    $('#drawerTitle').textContent = meta.title;
    Icon.set($('#drawerIcon'), meta.icon);
    $('#drawer').classList.add('is-open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#drawerBackdrop').classList.add('is-open');
    // 面板专属初始化
    if (name === 'overview') initRadarOverview();
    if (name === 'staff') { initStaffRadar('radarStaff1', STAFF[0]); initStaffRadar('radarStaff2', STAFF[1]); }
    if (name === 'map') buildMap();
    // 滚回顶
    $('#drawerBody').scrollTop = 0;
  }
  function closeDrawer() {
    $('#drawer').classList.remove('is-open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#drawerBackdrop').classList.remove('is-open');
    $$('.rail-btn').forEach(b => b.classList.remove('is-active'));
  }

  /* ============================================================
     标签页（通用）
     ============================================================ */
  function wireTabs(container) {
    const tabs = $$(`.tab`, container);
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const name = tab.dataset.tab;
        tabs.forEach(t => t.classList.toggle('is-active', t === tab));
        $$(`.tab-pane`, container).forEach(p =>
          p.classList.toggle('is-active', p.dataset.pane === name));
      });
    });
  }

  /* ============================================================
     模态框系统
     ============================================================ */
  function openModal({ icon, title, body, actions = [], size }) {
    const root = $('#modalRoot');
    const acts = actions.map((a, i) => {
      const btn = h('button', {
        class: 'btn ' + (a.primary ? 'btn--primary' : a.danger ? 'btn--danger' : 'btn--ghost'),
        'data-i-act': i
      }, a.label);
      if (a.onClick) btn.addEventListener('click', a.onClick);
      else btn.addEventListener('click', closeModal);
      return btn;
    });
    const modal = h('div', { class: 'modal' + (size ? ' modal--' + size : '') }, [
      h('div', { class: 'modal__head' }, [
        h('span', { class: 'ic ic--lg modal__icon', html: Icon.get(icon) }),
        h('h3', { class: 'modal__title' }, title),
        h('button', { class: 'seal-close', 'aria-label': '关闭', onclick: closeModal },
          h('span', { class: 'ic seal-close__icon', html: Icon.get('close') }))
      ]),
      h('div', { class: 'modal__body', html: body }),
      acts.length ? h('div', { class: 'modal__foot' }, acts) : null
    ]);
    root.innerHTML = '';
    root.appendChild(modal);
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    Icon.render(modal);
    return modal;
  }
  function closeModal() {
    const root = $('#modalRoot');
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    setTimeout(() => { if (!root.classList.contains('is-open')) root.innerHTML = ''; }, 360);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); closeDrawer(); }
  });

  /* ============================================================
     吐司通知 + 满足感粒子
     ============================================================ */
  const TOAST_ICONS = { success: 'check', warn: 'warning', error: 'warning', magic: 'sparkle', info: 'info' };
  function toast(type, title, msg) {
    const stack = $('#toastStack');
    const t = h('div', { class: `toast toast--${type}`, role: 'status' }, [
      h('span', { class: 'ic toast__icon', html: Icon.get(TOAST_ICONS[type] || 'info') }),
      h('div', { class: 'toast__body' }, [
        h('div', { class: 'toast__title' }, title),
        msg ? h('div', { class: 'toast__msg' }, msg) : null
      ])
    ]);
    stack.appendChild(t);
    setTimeout(() => {
      t.classList.add('is-out');
      setTimeout(() => t.remove(), 260);
    }, 3600);
  }
  function burst(x, y) {
    if (reduceMotion) return;
    const layer = $('#burstLayer');
    for (let i = 0; i < 7; i++) {
      const s = h('span', { class: 'star-burst', html: Icon.get('sparkle') });
      const ang = (Math.PI * 2 * i) / 7;
      const dist = 30 + Math.random() * 40;
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      layer.appendChild(s);
      setTimeout(() => s.remove(), 900);
    }
  }

  /* ============================================================
     叙事：打字机 + 追加消息
     ============================================================ */
  function typewriter(el, html, speed = 16) {
    if (!GAME.typewriter || reduceMotion) { el.innerHTML = html; return; }
    let i = 0;
    function step() {
      if (i >= html.length) { el.innerHTML = html; return; }
      // 遇到标签则整段跨过，避免切断
      if (html[i] === '<') {
        const end = html.indexOf('>', i);
        i = end === -1 ? html.length : end + 1;
      } else {
        i++;
      }
      el.innerHTML = html.slice(0, i) + '<span class="typing-caret"></span>';
      setTimeout(step, speed);
    }
    step();
  }
  function addNarrative(tagKind, tagLabel, html, timeLabel) {
    const inner = $('#narrativeInner');
    const msg = h('article', { class: 'msg' }, [
      h('div', { class: 'msg__head' }, [
        h('span', { class: `msg__tag msg__tag--${tagKind}`, html: `<span class="ic" data-i="sparkle" style="--ic:13px"></span>${tagLabel}` }),
        h('span', { class: 'msg__time' }, timeLabel || current_time_label())
      ]),
      h('div', { class: 'msg__body' })
    ]);
    inner.appendChild(msg);
    Icon.render(msg);
    typewriter(msg.querySelector('.msg__body'), html);
    $('#narrative').scrollTop = $('#narrative').scrollHeight;
  }
  function current_time_label() {
    const active = $('.time-node.is-active');
    return active ? active.dataset.label : '上午';
  }

  /* ============================================================
     时段 / 主题
     ============================================================ */
  function setTime(timeKey) {
    const t = TIMES[timeKey];
    $$('.time-node').forEach(n => n.classList.toggle('is-active', n.dataset.time === timeKey));
    setTheme(t.theme);
    toast('info', `时辰：${t.label}`, t.desc);
  }
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    Icon.set($('#themeToggle'), theme === 'night' ? 'sun' : 'moon');
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    setTheme(cur === 'night' ? 'day' : 'night');
  }

  /* ============================================================
     各类操作弹窗
     ============================================================ */
  function modalQuickCook() {
    const list = RECIPES.map(r => {
      const mats = r.mats.map(([n, q, ok]) =>
        `<span class="mat-chip ${ok ? 'ok' : 'no'}">${n} ×${q}</span>`).join('');
      const stars = '★'.repeat(r.stars) + '☆'.repeat(2 - r.stars);
      return `<div class="recipe" data-recipe="${r.name}" data-price="${r.price}">
        <div class="recipe__head"><span class="ic" data-i="pot" style="color:var(--color-primary);--ic:18px"></span><span class="recipe__name">${r.name}</span><span class="recipe__stars">${stars}</span></div>
        <div class="recipe__mats">${mats}</div>
        <div class="recipe__foot"><span class="faint" style="font-size:var(--font-size-2xs)">售价 <span class="num" style="color:var(--color-primary)">${r.price}银</span></span></div>
      </div>`;
    }).join('');
    openModal({
      icon: 'pot', title: '快捷烹饪',
      body: `<div class="notice notice--info"><span class="ic notice__icon" data-i="info"></span><div>选择一道菜肴烹制，将消耗对应食材并获得铜币与引力。</div></div>${list}`,
      actions: [{ label: '关闭', ghost: true }]
    });
    // 绑定点击
    $$('#modalRoot .recipe').forEach(r => r.addEventListener('click', () => {
      const name = r.dataset.recipe;
      const price = +r.dataset.price;
      const ok = RECIPES.find(x => x.name === name).mats.every(([, , has]) => has);
      if (!ok) { toast('error', '材料不足', `「${name}」缺少所需食材，无法烹制。`); return; }
      closeModal();
      addFunds(price);
      changeStat('energy', -6);
      changeStat('stress', -3);
      toast('success', '烹制完成', `「${name}」出锅！收入 ${price} 银，香气引得引力微涨。`);
      addNarrative('guest', '灶事', `苏半夏在灶前忙碌片刻，一碗热腾腾的<span class="hl">${name}</span>端上了桌。薄荷蓝的蒸汽在烛光里盘旋，旅人眼睛一亮。`);
      burst(window.innerWidth / 2, window.innerHeight * 0.7);
    }));
  }

  function modalQuickWater() {
    const plots = [
      { name: '后院菜畦 (0,2)', crop: '紫胡萝卜', dry: true },
      { name: '林缘隙地 (3,-1)', crop: '霜叶菜', dry: false },
    ];
    const dryOnes = plots.filter(p => p.dry);
    const body = plots.map(p => `
      <div class="crop-plot" style="margin-bottom:var(--space-2)">
        <div class="crop-plot__head"><span class="ic" data-i="${p.dry ? 'water' : 'carrot'}" style="color:${p.dry ? 'var(--color-text-faint)' : 'var(--color-success)'};--ic:18px"></span><span class="crop-plot__name">${p.name}</span><span class="pill ${p.dry ? 'pill--red' : 'pill--green'}">${p.dry ? '待浇水' : '已浇'}</span></div>
        <div class="faint" style="font-size:var(--font-size-2xs)">作物：${p.crop}</div>
      </div>`).join('');
    openModal({
      icon: 'water', title: '一键浇灌',
      body: `<div class="notice notice--info"><span class="ic notice__icon" data-i="info"></span><div>共 ${plots.length} 片种植区，其中 ${dryOnes.length} 片待浇水。</div></div>${body}`,
      actions: [
        { label: '取消', ghost: true },
        { label: `浇灌全部 (${dryOnes.length})`, primary: true, onClick: () => {
          if (!dryOnes.length) { toast('info', '无需浇灌', '所有种植区都已湿润。'); closeModal(); return; }
          closeModal();
          changeStat('energy', -3);
          toast('magic', '浇灌完成', '井水沿渠而下，菜畦泛起淡淡薄荷蓝光。作物长势加快。');
          addNarrative('magic', '农事', `你提着木桶逐一浇灌，<span class="magic">净井水</span>渗入泥土，紫胡萝卜的叶尖凝起细小的水珠。`);
        } }
      ]
    });
  }

  function modalEndDay() {
    openModal({
      icon: 'moon', title: '结束今天',
      body: `<div class="notice--stamp"><span class="ic" data-i="moon" style="--ic:24px"></span><div style="margin-top:6px">天色已晚，是否结束今天？</div></div>
        <div class="row" style="gap:var(--space-2);margin-top:var(--space-3)">
          <span class="pill pill--green">精力 回复 +40</span>
          <span class="pill pill--amber">压力 缓解 -15</span>
          <span class="pill">推进至 次日</span>
        </div>
        <p class="faint center" style="font-size:var(--font-size-2xs);margin-top:var(--space-3)">结算后将扣除建筑维护费，并迎来新的访客与可能。</p>`,
      actions: [
        { label: '再忙一会儿', ghost: true },
        { label: '就寝，结束今天', primary: true, onClick: () => { closeModal(); settleDay(); } }
      ]
    });
  }

  function settleDay() {
    // 维护费
    const maintain = 3;
    addFunds(-maintain);
    // 恢复
    changeStat('energy', +40);
    changeStat('stress', -15);
    // 推进日期
    advanceDate();
    toast('success', '新的一天', `第${GAME.year}年 · ${GAME.season}第${GAME.day}天开始了。精力已恢复。`);
    addNarrative('system', '晨记', `夜风掠过屋脊，烛火次第熄灭。你合上账本，沉沉睡去。再睁眼时，晨光已铺满大堂——<span class="hl">第${GAME.year}年·${GAME.season}第${GAME.day}天</span>，新的故事正在发生。`);
    burst(window.innerWidth / 2, window.innerHeight / 2);
  }

  function advanceDate() {
    const seasons = ['春季', '夏季', '秋季', '冬季'];
    GAME.day += 1;
    if (GAME.day > 30) { GAME.day = 1; GAME.seasonIdx = (GAME.seasonIdx + 1) % 4; }
    GAME.season = seasons[GAME.seasonIdx];
    GAME.weekday = WEEKDAYS[(GAME.day - 1) % 7];
    $('#dateText').textContent = `第${GAME.year}年 · ${GAME.season}第${GAME.day}天`;
    $('#weekdayText').textContent = `${GAME.weekday} · 晴朗`;
    // 声望条略增
    GAME.prestige = Math.min(100, GAME.prestige + 2);
    $('#prestigeFill').style.setProperty('--p', GAME.prestige + '%');
  }

  function modalRecruit() {
    const body = CHANNELS.map(ch => `
      <div class="channel-card" data-channel="${ch.key}">
        <div class="channel-card__head">
          <span class="ic channel-card__icon" data-i="${ch.icon}"></span>
          <span class="channel-card__name">${ch.name}</span>
          <span class="pill ${ch.tag}">${ch.cost}</span>
        </div>
        <p class="faint" style="font-size:var(--font-size-xs);line-height:1.6">${ch.desc}</p>
      </div>`).join('');
    openModal({
      icon: 'person', title: '招募渠道',
      body: `<div class="notice notice--info"><span class="ic notice__icon" data-i="info"></span><div>选择一种渠道寻找帮手。不同渠道的耗时、花费与来人品质各异。</div></div>${body}`,
      actions: [{ label: '关闭', ghost: true }]
    });
    $$('#modalRoot .channel-card').forEach(c => c.addEventListener('click', () => {
      const ch = CHANNELS.find(x => x.key === c.dataset.channel);
      closeModal();
      toast(ch.key === 'special' ? 'magic' : 'success', '已发布招募', `经由「${ch.name}」寻人……请耐心等候回音。`);
      addNarrative('system', '人事', `你在「${ch.name}」处留下了招募的口信，<span class="hl">${ch.cost}</span>。或许明日便有人上门。`);
    }));
  }

  function modalSettings() {
    openModal({
      icon: 'settings', title: '设置',
      body: `
        <div class="set-row">
          <div><div class="set-row__title">打字机叙事</div><div class="faint" style="font-size:var(--font-size-2xs)">新文字逐字浮现，如鹅毛笔落墨。</div></div>
          <button class="toggle ${GAME.typewriter ? 'is-on' : ''}" id="toggleType" role="switch" aria-checked="${GAME.typewriter}"><span class="toggle__knob"></span></button>
        </div>
        <div class="set-row">
          <div><div class="set-row__title">昼夜主题</div><div class="faint" style="font-size:var(--font-size-2xs)">切换羊皮纸昼景与靛蓝烛夜。</div></div>
          <button class="btn btn--ghost btn--sm" id="toggleThemeBtn">${document.documentElement.getAttribute('data-theme') === 'night' ? '当前：夜' : '当前：昼'}</button>
        </div>
        <div class="notice notice--info" style="margin-top:var(--space-3)"><span class="ic notice__icon" data-i="info"></span><div>本作为前端原型，所有数据存于本地，无后端连接。</div></div>`,
      actions: [{ label: '完成', primary: true, onClick: closeModal }]
    });
    $('#toggleType').addEventListener('click', function () {
      GAME.typewriter = !GAME.typewriter;
      this.classList.toggle('is-on', GAME.typewriter);
      this.setAttribute('aria-checked', GAME.typewriter);
      toast('info', '已调整', `打字机叙事已${GAME.typewriter ? '开启' : '关闭'}。`);
    });
    $('#toggleThemeBtn').addEventListener('click', function () {
      toggleTheme();
      this.textContent = document.documentElement.getAttribute('data-theme') === 'night' ? '当前：夜' : '当前：昼';
    });
  }

  function buildConfirm(name) {
    openModal({
      icon: 'hammer', title: `建造 · ${name}`,
      body: `<div class="notice notice--info"><span class="ic notice__icon" data-i="info"></span><div>即将建造「<strong>${name}</strong>」，将消耗 40银、青石板×8、干柴火×5。</div></div>
        <div class="row" style="gap:var(--space-2)"><span class="cost-item">40 银</span><span class="cost-item">青石板 ×8</span><span class="cost-item">干柴火 ×5</span></div>`,
      actions: [
        { label: '取消', ghost: true },
        { label: '确认建造', primary: true, onClick: () => {
          if (GAME.funds < 40) { toast('error', '资金不足', '铜币不够，无法开工。'); return; }
          addFunds(-40);
          changeStat('energy', -15);
          changeStat('stress', +8);
          closeModal();
          toast('success', '开工建造', `「${name}」开始营建，预计次日完工。`);
          addNarrative('event', '营造', `你与阿苔搬来青石板，在主灶房旁垒起<span class="hl">${name}</span>的基座。柴火噼啪作响，一座新的可能正在成型。`);
          burst(window.innerWidth / 2, window.innerHeight / 2);
        } }
      ]
    });
  }

  /* ============================================================
     库存搜索
     ============================================================ */
  function wireInventorySearch() {
    const input = $('#invSearch');
    if (!input) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      $$('#invList .item-row').forEach(row => {
        const name = row.querySelector('.item-row__name').textContent.toLowerCase();
        row.style.display = !q || name.includes(q) ? '' : 'none';
      });
    });
  }

  /* ============================================================
     初始化
     ============================================================ */
  const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  GAME.year = 1; GAME.seasonIdx = 0; GAME.season = '春季'; GAME.day = 3; GAME.weekday = '周三';
  window.WEEKDAYS = WEEKDAYS;

  function init() {
    Icon.render(document);
    renderFunds(false);
    updateStatBars();
    initRadarOverview();
    initStaffRadar('radarStaff1', STAFF[0]);
    initStaffRadar('radarStaff2', STAFF[1]);
    buildMap();
    wireTabs($('#invTabs'));
    wireTabs($('#buildTabs'));
    wireTabs($('#questTabs'));
    wireInventorySearch();

    // 左栏面板
    $$('.rail-btn[data-panel]').forEach(b =>
      b.addEventListener('click', () => openPanel(b.dataset.panel)));
    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#drawerBackdrop').addEventListener('click', closeDrawer);
    $('#modalRoot').addEventListener('click', (e) => { if (e.target.id === 'modalRoot') closeModal(); });

    // 主题 / 设置
    $('#themeToggle').addEventListener('click', toggleTheme);
    $('#settingsBtn').addEventListener('click', modalSettings);

    // 时段
    $$('.time-node').forEach(n => n.addEventListener('click', () => setTime(n.dataset.time)));

    // 底部休息
    $('#restBtn').addEventListener('click', () => {
      if (GAME.energy >= 95) { toast('info', '精力充沛', '掌柜精神正好，无需歇息。'); return; }
      changeStat('energy', +20); changeStat('stress', -6);
      toast('success', '小憩片刻', '精力恢复 20，压力缓解 6。');
    });

    // 右栏快捷
    $('#quickCook').addEventListener('click', modalQuickCook);
    $('#quickWater').addEventListener('click', modalQuickWater);
    $('#endDayBtn').addEventListener('click', modalEndDay);

    // 行动轴 chips
    $$('.chip[data-action]').forEach(c => c.addEventListener('click', () => {
      const a = c.dataset.action;
      const map = { cook: modalQuickCook, build: () => openPanel('building'), plant: () => openPanel('farm'), explore: () => openPanel('map'), social: () => openPanel('visitor'), rest: () => $('#restBtn').click() };
      (map[a] || function(){})();
    }));

    // 库存配方烹制
    document.addEventListener('click', (e) => {
      const cookBtn = e.target.closest('[data-cook]');
      if (cookBtn) {
        const name = cookBtn.dataset.cook;
        const r = RECIPES.find(x => x.name === name) || { name, price: 10, mats: [] };
        addFunds(r.price);
        changeStat('energy', -6);
        toast('success', '烹制完成', `「${name}」出锅！收入 ${r.price} 银。`);
        burst(window.innerWidth / 2, window.innerHeight * 0.7);
        addNarrative('guest', '灶事', `一碗<span class="hl">${name}</span>热气升腾地端上了桌。`);
      }
      const buildBtn = e.target.closest('[data-build]');
      if (buildBtn) buildConfirm(buildBtn.dataset.build);
      // 引力公式项
      const gTerm = e.target.closest('.g-term');
      if (gTerm) {
        const g = GRAVITY.find(x => x.key === gTerm.dataset.g);
        if (g) toast('info', g.label, `当前贡献引力 ${g.val} 点。`);
      }
      // 满意度环（演示）
      const visCard = e.target.closest('.visitor-card');
      if (visCard && !e.target.closest('button')) {
        toast('info', '访客印象', '点击右侧仪表盘可查看其满意度来源。');
      }
    });

    // 初始打字机：最后一条叙事
    const lastBody = $$('#narrative .msg__body');
    if (lastBody.length) typewriter(lastBody[lastBody.length - 1], lastBody[lastBody.length - 1].innerHTML, 14);

    // 欢迎吐司
    setTimeout(() => toast('magic', '暮归旅店 · 开张志', '愿这盏烛火，照亮你重建家业的路。'), 600);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
