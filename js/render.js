/* ============================================================
   暮归旅店 · 数据驱动渲染器
   stat_data -> 左页八面板 / 右页 HUD / 正文 / 选项
   - 子标签（建筑 已建成/蓝图、库存分类、任务分类）数据驱动
   - 烹饪只展示材料文本，不判断够不够、不禁用
   - 一切玩家动作经 /setinput 发给 AI，前端不本地改状态
   ============================================================ */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 通用 DOM ---------- */
  function h(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
    });
    return e;
  }
  function sh(tag, attrs = {}, children = []) {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      if (k === 'class') e.setAttribute('class', v);
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
    });
    return e;
  }

  /* ---------- 数值 / 对象工具 ---------- */
  const num = (v, d = 0) => { const n = Number(v); return isNaN(n) ? d : n; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const entries = (o) => (o && typeof o === 'object' ? Object.entries(o) : []);
  const HAS_LODASH = (typeof _ !== 'undefined') && _ && typeof _.get === 'function';
  function get(o, p, d) {
    if (HAS_LODASH) { const r = _.get(o, p); return r === undefined ? d : r; }
    let x = o;
    for (const part of String(p).split('.')) {
      if (x == null || typeof x !== 'object') { x = undefined; break; }
      x = x[part];
    }
    return x === undefined ? d : x;
  }

  /* ---------- 品质 / 主题色 ---------- */
  const QUALITY = ['粗糙', '普通', '优良', '精品', '传说'];
  const qClass = (q) => (QUALITY.includes(q) ? 'q-tag--' + q : '');
  const DIM_KEYS = ['美食', '知识', '舒适', '冒险', '文化', '自然'];
  const DIM_COLOR = {
    美食: 'var(--dim-food)', 知识: 'var(--dim-lore)', 舒适: 'var(--dim-comfort)',
    冒险: 'var(--dim-adventure)', 文化: 'var(--dim-culture)', 自然: 'var(--dim-nature)',
  };
  const DIM_NAME = { 美食: '美食', 知识: '知识', 舒适: '舒适', 冒险: '冒险', 文化: '文化', 自然: '自然' };

  /* ---------- 图标推断 ---------- */
  function itemIcon(name) {
    name = name || '';
    if (/菇|菌|茸/.test(name)) return 'mushroom';
    if (/麦|粉|谷|米|面/.test(name)) return 'grain';
    if (/蛋/.test(name)) return 'egg';
    if (/草|药|香/.test(name)) return 'herb';
    if (/鱼/.test(name)) return 'fish';
    if (/蜜|糖/.test(name)) return 'honey';
    if (/木|柴|板|梁/.test(name)) return 'wood';
    if (/石|矿|砖|板/.test(name)) return 'stone';
    if (/花|兰|菊|薇/.test(name)) return 'flower';
    if (/符石|宝石|晶|魔石|露/.test(name)) return 'gem';
    return 'bag';
  }
  function buildingIcon(name) {
    name = name || '';
    if (/灶|厨/.test(name)) return 'kitchen';
    if (/烤|炉/.test(name)) return 'oven';
    if (/酿|酒/.test(name)) return 'brewery';
    if (/菜|畦|田|园|圃/.test(name)) return 'garden';
    if (/书|阁|典|图/.test(name)) return 'library';
    if (/井/.test(name)) return 'well';
    if (/台|前台|接待|柜/.test(name)) return 'house';
    return 'hammer';
  }
  function tileIcon(type) {
    const m = { 旅店: 'house', 田地: 'garden', 森林: 'tree', 溪流: 'lake', 山岩: 'mountain', 洞穴: 'cave', 遗迹: 'ruin', 矿: 'mountain' };
    return m[type] || 'compass';
  }
  function visitorIcon(type) {
    type = type || '';
    if (/术士|法师|巫|魔/.test(type)) return 'mage';
    if (/贵族|特殊|王|侯|贵/.test(type)) return 'noble';
    if (/商|贩/.test(type)) return 'merchant';
    return 'person';
  }

  /* ---------- 格式化 ---------- */
  function formatFunds(silver) {
    silver = num(silver, 0);
    const g = Math.floor(silver / 100), s = silver % 100;
    return g > 0 ? `${g}金${s}银` : `${s}银`;
  }
  const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const weekday = (n) => WEEKDAYS[clamp(num(n, 1) - 1, 0, 6)];
  function weatherIcon(w) {
    w = (w || '') + '';
    if (/晴/.test(w)) return 'sun';
    if (/雨/.test(w)) return 'rain';
    if (/雪/.test(w)) return 'snow';
    if (/云|阴|雾/.test(w)) return 'cloud';
    return 'sun';
  }
  function prestigeTier(p) {
    p = num(p, 0);
    if (p >= 100) return '日耀';
    if (p >= 50) return '月华';
    if (p >= 20) return '星辉';
    if (p > 0) return '萤火';
    return '初启';
  }
  function normalizeRes(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res.filter(Boolean).map((r) => ({ name: r[0], qty: r[1] }));
    if (typeof res === 'object') return Object.entries(res).map(([name, qty]) => ({ name, qty }));
    return [];
  }
  function collectCount(c) {
    if (c == null) return 0;
    if (typeof c === 'number') return c;
    if (typeof c === 'object') return Object.values(c).reduce((a, b) => a + num(b, 0), 0);
    return 0;
  }

  /* ---------- 吐司 / 粒子 / 指令（共享） ---------- */
  const TOAST_ICONS = { success: 'check', warn: 'warning', error: 'warning', magic: 'sparkle', info: 'info' };
  function toast(type, title, msg) {
    const stack = document.getElementById('toastStack'); if (!stack) return;
    const t = h('div', { class: `toast toast--${type}`, role: 'status' }, [
      h('span', { class: 'ic toast__icon', html: Icon.get(TOAST_ICONS[type] || 'info') }),
      h('div', { class: 'toast__body' }, [
        h('div', { class: 'toast__title' }, title),
        msg ? h('div', { class: 'toast__msg' }, msg) : null
      ])
    ]);
    stack.appendChild(t);
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 280); }, 3600);
  }
  function burst(x, y) {
    if (reduceMotion) return;
    const layer = document.getElementById('burstLayer'); if (!layer) return;
    for (let i = 0; i < 7; i++) {
      const s = h('span', { class: 'star-burst', html: Icon.get('sparkle') });
      const ang = (Math.PI * 2 * i) / 7, dist = 26 + Math.random() * 42;
      s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      layer.appendChild(s); setTimeout(() => s.remove(), 900);
    }
  }
  /** 把意图写入酒馆输入框（/setinput），不在本地改状态 */
  function triggerSlash(cmd) {
    let ok = false;
    try {
      if (typeof executeSlashCommandsWithOptions === 'function') { executeSlashCommandsWithOptions(cmd); ok = true; }
      else if (typeof executeSlashCommands === 'function') { executeSlashCommands(cmd); ok = true; }
    } catch (e) { ok = false; }
    const intent = cmd.replace(/^\/setinput\s*/, '');
    toast('info', ok ? '已写入输入框' : '意图', intent);
    return ok;
  }
  window.toast = toast; window.burst = burst; window.triggerSlash = triggerSlash;

  /* ---------- 六维雷达 ---------- */
  function polar(cx, cy, r, deg) {
    const a = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function drawRadar(svg, axes, vals, max, opts = {}) {
    const size = opts.size || 220, cx = size / 2, cy = size / 2;
    const R = size / 2 - (opts.pad || 38), n = axes.length;
    const ang = (i) => (360 / n) * i;
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.innerHTML = '';
    for (let g = 1; g <= 4; g++) {
      const rr = (R * g) / 4, pts = [];
      for (let i = 0; i < n; i++) { const [x, y] = polar(cx, cy, rr, ang(i)); pts.push(`${x.toFixed(1)},${y.toFixed(1)}`); }
      svg.appendChild(sh('polygon', { class: 'radar__grid', points: pts.join(' '), style: g === 4 ? 'stroke:var(--color-border-strong)' : '' }));
    }
    axes.forEach((ax, i) => {
      const [x, y] = polar(cx, cy, R, ang(i));
      svg.appendChild(sh('line', { class: 'radar__axis', x1: cx, y1: cy, x2: x.toFixed(1), y2: y.toFixed(1) }));
      if (opts.showLabels !== false) {
        const [lx, ly] = polar(cx, cy, R + (opts.labelPad || 16), ang(i));
        svg.appendChild(sh('text', { class: 'radar__label', x: lx.toFixed(1), y: ly.toFixed(1), fill: ax.color || 'var(--color-text-soft)' }, ax.name || ax));
      }
    });
    const area = sh('polygon', { class: 'radar__area', points: '' });
    svg.appendChild(area);
    const verts = [];
    vals.forEach((v, i) => {
      const vt = sh('circle', { class: 'radar__vertex', cx, cy, r: opts.vertexR || 3.4 });
      if (axes[i].color) vt.style.fill = axes[i].color;
      svg.appendChild(vt); verts.push(vt);
      if (opts.showVals !== false) {
        const [tx, ty] = polar(cx, cy, R + (opts.labelPad || 16) - 4, ang(i));
        svg.appendChild(sh('text', { class: 'radar__val', x: tx.toFixed(1), y: (ty + 7).toFixed(1) }, String(v)));
      }
      if (opts.onVertex) {
        vt.addEventListener('mouseenter', () => opts.onVertex(axes[i], i));
        vt.addEventListener('click', () => opts.onVertex(axes[i], i));
      }
    });
    const start = performance.now(), dur = reduceMotion ? 1 : (opts.dur || 850);
    function frame(now) {
      const t = Math.min(1, (now - start) / dur), ease = 1 - Math.pow(1 - t, 3);
      const pts = vals.map((v, i) => { const r = R * clamp(v / max, 0, 1) * ease; const [x, y] = polar(cx, cy, r, ang(i)); return `${x.toFixed(1)},${y.toFixed(1)}`; });
      area.setAttribute('points', pts.join(' '));
      verts.forEach((vt, i) => { const r = R * clamp(vals[i] / max, 0, 1) * ease; const [x, y] = polar(cx, cy, r, ang(i)); vt.setAttribute('cx', x.toFixed(1)); vt.setAttribute('cy', y.toFixed(1)); });
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- 通用片段 ---------- */
  function panelH(text, right) {
    return `<div class="panel-h">${text}${right ? `<span class="list-h__count">${right}</span>` : ''}</div>`;
  }
  function emptyState(icon, title, desc) {
    return `<div class="empty-state"><span class="ic empty-state__icon" data-i="${icon}"></span><div class="empty-state__title">${title}</div><div class="empty-state__desc">${desc}</div></div>`;
  }
  function dimBars(inf, max = 10) {
    return `<div class="dim-bars">${DIM_KEYS.map((k) => {
      const v = num(inf && inf[k], 0);
      const neg = v < 0;
      const pct = neg ? 0 : clamp(v / max * 100, 0, 100);
      return `<div class="dim-bar"><div class="dim-bar__track"><div class="dim-bar__fill" style="width:${pct}%;background:${DIM_COLOR[k]}"></div></div><span class="dim-bar__label">${DIM_NAME[k]} ${v}</span></div>`;
    }).join('')}</div>`;
  }
  function pillsFrom(arr, cls = '') {
    return (arr || []).filter(Boolean).map((t) => `<span class="pill ${cls}">${t}</span>`).join('');
  }

  /* ============================================================
     HUD（右页顶栏 + 底栏状态）
     ============================================================ */
  function renderHud(s) {
    const t = get(s, '世界.时间', {});
    const inn = get(s, '旅店', {});
    const me = get(s, '大掌柜', {});
    const energy = clamp(num(get(me, '精力', 0), 0), 0, 100);
    const stress = clamp(num(get(me, '压力', 0), 0), 0, 100);
    const fame = num(get(inn, '声望', 0), 0);

    $('#hudWeather') && (Icon.set($('#hudWeather'), weatherIcon(get(t, '天气', '晴'))));
    $('#hudDate') && ($('#hudDate').textContent = `第${num(get(t, '年', 1), 1)}年 · ${get(t, '季节', '春')}季第${num(get(t, '天数', 1), 1)}天`);
    $('#hudWeekday') && ($('#hudWeekday').textContent = `${weekday(get(t, '星期', 1))} · ${get(t, '天气', '晴')}`);
    $('#hudInn') && ($('#hudInn').textContent = '暮归旅店');
    $('#hudLevel') && ($('#hudLevel').textContent = `声望 · ${prestigeTier(fame)}`);
    $('#hudFunds') && ($('#hudFunds').textContent = formatFunds(get(inn, '资金', 0)));
    $('#hudPrestigeFill') && ($('#hudPrestigeFill').style.setProperty('--p', clamp(fame, 0, 100) + '%'));

    const eFill = $('#energyFill');
    if (eFill) {
      eFill.style.setProperty('--p', energy + '%');
      eFill.classList.toggle('low', energy < 20);
      const ebar = eFill.closest('.bar'); if (ebar) ebar.classList.toggle('low', energy < 20);
      $('#energyVal') && ($('#energyVal').textContent = `${energy}/100`);
    }
    const sFill = $('#stressFill');
    if (sFill) {
      sFill.style.setProperty('--p', stress + '%');
      const sbar = sFill.closest('.bar');
      if (sbar) { sbar.classList.toggle('warn', stress >= 50 && stress < 80); sbar.classList.toggle('critical', stress >= 80); }
      $('#stressVal') && ($('#stressVal').textContent = `${stress}/100`);
    }
  }

  /* ============================================================
     左页各面板
     ============================================================ */

  /* ---- 总览 ---- */
  function renderOverview(container, s) {
    const ec = get(s, '访客生态', {});
    const fc = get(s, '当日预报', {});
    const inf = get(ec, '设施引力', {});
    const axes = DIM_KEYS.map((k) => ({ name: DIM_NAME[k], key: k, color: DIM_COLOR[k] }));
    const vals = DIM_KEYS.map((k) => num(inf[k], 0));
    const maxV = Math.max(10, ...vals, 1);
    const total = num(get(ec, '总引力值', 0), 0);

    container.innerHTML =
      panelH('六维引力', `总引力 ${total}`) +
      `<div class="radar-wrap">
         <svg class="radar" id="radarOverview" role="img" aria-label="六维引力雷达"></svg>
         <div class="dim-bubble" id="dimBubble" style="display:none"><div class="dim-bubble__title" id="dimBubbleTitle"></div><div id="dimBubbleBody"></div></div>
       </div>` +
      panelH('引力公式') +
      `<div class="gravity-formula">
         <div class="g-term" data-g="声望引力"><span class="g-term__label">声望</span><span class="g-term__val">${num(get(ec, '声望引力', 0), 0)}</span></div>
         <span class="g-plus">+</span>
         <div class="g-term" data-g="设施引力"><span class="g-term__label">设施</span><span class="g-term__val">${vals.reduce((a, b) => a + b, 0)}</span></div>
         <span class="g-plus">+</span>
         <div class="g-term" data-g="服务引力"><span class="g-term__label">服务</span><span class="g-term__val">${num(get(ec, '服务引力', 0), 0)}</span></div>
         <span class="g-plus">+</span>
         <div class="g-term" data-g="环境引力"><span class="g-term__label">环境</span><span class="g-term__val">${num(get(ec, '环境引力', 0), 0)}</span></div>
         <span class="g-eq">=</span>
         <div class="g-total"><span class="g-term__label">总引力</span><span class="g-total__val">${total}</span></div>
       </div>` +
      panelH('当日预报') +
      `<div class="card">
         <div class="row row--between" style="margin-bottom:6px"><span class="card__sub"><span class="ic" data-i="${weatherIcon(get(fc, '天气', get(s, '世界.时间.天气', '晴')))}" style="--ic:16px;color:var(--color-primary)"></span> 天气 · ${get(fc, '天气', '—')}</span><span class="card__sub">引力 · <span class="num" style="color:var(--color-primary)">${num(get(fc, '引力值', total), 0)}</span></span></div>
         <div class="card__sub" style="margin-bottom:6px">访客池：${get(fc, '访客池', '—')}</div>
         <div class="list-h"><span>注意事项</span></div>
         ${(get(fc, '注意事项', []) || []).map((x) => `<div class="card__sub" style="margin:3px 0;line-height:1.6">· ${x}</div>`).join('') || '<div class="faint" style="font-size:var(--font-size-xs)">今日无事须记。</div>'}
       </div>`;
    Icon.render(container);

    const svg = $('#radarOverview', container);
    const bubble = $('#dimBubble', container);
    drawRadar(svg, axes, vals, maxV, {
      size: 220, pad: 40, labelPad: 18,
      onVertex: (ax) => {
        $('#dimBubbleTitle', container).textContent = `${ax.name} · 设施引力 ${num(inf[ax.key], 0)}`;
        $('#dimBubbleTitle', container).style.color = ax.color;
        $('#dimBubbleBody', container).innerHTML = dimBars({ [ax.key]: inf[ax.key] }, 10);
        bubble.style.display = 'block';
      }
    });
    $$('.g-term', container).forEach((el) => {
      el.addEventListener('click', () => {
        const k = el.dataset.g;
        toast('info', k, `当前贡献引力 ${num(get(ec, k, 0), 0)} 点。`);
      });
    });
  }

  /* ---- 库存 + 食谱 ---- */
  function renderInventory(container, s) {
    const inn = get(s, '旅店', {});
    const stock = get(inn, '库存', {});
    const recipes = get(inn, '配方', {});
    const all = entries(stock);
    const cats = ['全部', ...Array.from(new Set(all.map(([, v]) => v && v.分类).filter(Boolean)))];
    const cat = UI.invCat && cats.includes(UI.invCat) ? UI.invCat : '全部';
    const q = (UI.invSearch || '').trim().toLowerCase();
    const filtered = all.filter(([name, v]) => {
      const okCat = cat === '全部' || (v && v.分类 === cat);
      const okSearch = !q || String(name).toLowerCase().includes(q);
      return okCat && okSearch;
    });

    const segHtml = `<div class="seg">${cats.map((c) => `<button class="seg__item ${c === cat ? 'is-active' : ''}" data-cat="${c}">${c}</button>`).join('')}</div>`;
    const searchHtml = `<div class="search"><span class="ic search__icon" data-i="search"></span><input id="invSearch" type="text" placeholder="搜索物品……" value="${UI.invSearch || ''}" /></div>`;
    const listHtml = filtered.length
      ? filtered.map(([name, v]) => {
          const qty = num(v && v.数量, 0);
          const q2 = (v && v.品质) || '普通';
          return `<div class="item-row" data-item="${name}">
            <span class="ic item-row__icon" data-i="${itemIcon(name)}"></span>
            <div class="item-row__main"><div class="item-row__name">${name}</div><div class="item-row__meta">${(v && v.分类) || '杂项'} · ${(v && v.描述) || ''}</div></div>
            <span class="q-tag ${qClass(q2)}">${q2}</span>
            <span class="item-row__qty">×${qty}</span>
          </div>`;
        }).join('')
      : emptyState('bag', '行囊空空', '尚无此类物品。');

    const recArr = entries(recipes);
    const recHtml = recArr.length
      ? recArr.map(([name, r]) => {
          const price = num(r && r.售价, 0), diff = num(r && r.难度, 0), fac = (r && r.需要设施) || '厨房';
          return `<div class="recipe" data-recipe="${name}">
            <div class="recipe__head"><span class="ic" data-i="pot" style="--ic:16px;color:var(--color-primary)"></span><span class="recipe__name">${name}</span><span class="pill pill--amber">难度 ${diff}</span></div>
            <div class="recipe__mats">材料：${(r && r.材料) || '随性发挥'}</div>
            <div class="recipe__foot"><span class="card__sub">设施 · ${fac}</span><span class="num" style="color:var(--color-primary)">${price} 银</span></div>
          </div>`;
        }).join('')
      : emptyState('scroll', '尚无食谱', '获得配方后将显示于此。');

    container.innerHTML = segHtml + searchHtml +
      panelH('物品', `${filtered.length} / ${all.length}`) + listHtml +
      panelH('食谱', `${recArr.length}`) + recHtml;
    Icon.render(container);

    $$('.seg__item', container).forEach((b) => b.addEventListener('click', () => {
      UI.invCat = b.dataset.cat; renderInventory(container, Render.state);
    }));
    const search = $('#invSearch', container);
    if (search) search.addEventListener('input', () => { UI.invSearch = search.value; renderInventory(container, Render.state); });
    $$('.recipe', container).forEach((r) => r.addEventListener('click', () => {
      triggerSlash(`/setinput 烹制：${r.dataset.recipe}`);
      burst(window.innerWidth / 2, window.innerHeight * 0.7);
    }));
  }

  /* ---- 建筑 ---- */
  function renderBuilding(container, s) {
    const b = get(s, '建筑', {});
    const built = entries(get(b, '已建成', {}));
    const blue = entries(get(b, '蓝图', {}));
    const tab = UI.buildTab || 'built';
    const seg = `<div class="seg">
      <button class="seg__item ${tab === 'built' ? 'is-active' : ''}" data-bt="built">已建成 · ${built.length}</button>
      <button class="seg__item ${tab === 'blue' ? 'is-active' : ''}" data-bt="blue">蓝图 · ${blue.length}</button>
    </div>`;

    let body = '';
    if (tab === 'built') {
      body = built.length ? built.map(([name, v]) => {
        const lv = num(v && v.等级, 1), st = (v && v.工作状态) || '正常';
        const produce = (v && v.产出) || '—', cd = num(v && v.产出倒计时, 0), maint = num(v && v.维护费用, 0);
        const rune = (v && v.符文升级) || '无';
        const ready = cd === 0 && produce && produce !== '—';
        return `<div class="building ${ready ? 'is-ready' : ''}" data-build="${name}">
          <div class="building__head">
            <span class="ic building__icon" data-i="${buildingIcon(name)}"></span>
            <span class="building__name">${name}</span>
            <span class="building__lv">Lv.${lv}</span>
            <span class="building__status ${st}">${st}</span>
          </div>
          <div class="card__sub" style="margin-bottom:4px">${(v && v.描述) || ''}</div>
          ${dimBars(v && v.影响力, 10)}
          <div class="row row--between" style="margin-top:4px">
            <span class="card__sub">产出 · ${produce}${cd > 0 ? `（${cd}日）` : (ready ? '（就绪）' : '')}</span>
            <span class="card__sub">维护 · <span class="num">${maint} 银</span></span>
          </div>
          ${rune && rune !== '无' ? `<div class="row" style="margin-top:4px"><span class="pill pill--mint"><span class="ic" data-i="sparkle" style="--ic:12px"></span>符文 · ${rune}</span></div>` : ''}
        </div>`;
      }).join('') : emptyState('hammer', '尚未营建', '前往「蓝图」择一开工。');
    } else {
      body = blue.length ? blue.map(([name, v]) => {
        const cost = (v && v.建造成本) || {};
        const mat = cost.物资 || '—', cash = num(cost.现金, 0);
        const cond = (v && v.解锁条件) || '';
        const neg = (v && v.负面描述) || '';
        return `<div class="building" data-blue="${name}">
          <div class="building__head">
            <span class="ic building__icon" data-i="${buildingIcon(name)}"></span>
            <span class="building__name">${name}</span>
          </div>
          <div class="card__sub" style="margin-bottom:4px">${(v && v.功能描述) || ''}</div>
          ${dimBars(v && v.影响力, 10)}
          ${cond ? `<div class="cond-list">解锁：${cond}</div>` : ''}
          <div class="cost-list"><span class="cost-item">${cash} 银</span><span class="cost-item">${mat}</span></div>
          ${neg ? `<div class="card__sub" style="color:var(--color-danger);margin-top:4px">⚠ ${neg}</div>` : ''}
          <button class="btn btn--primary btn--sm btn--block" data-build-btn="${name}" style="margin-top:6px"><span class="ic btn__icon" data-i="hammer"></span>建造</button>
        </div>`;
      }).join('') : emptyState('scroll', '暂无蓝图', '随声望与剧情推进，新蓝图将逐步显现。');
    }

    container.innerHTML = seg + body;
    Icon.render(container);
    $$('.seg__item', container).forEach((b) => b.addEventListener('click', () => {
      UI.buildTab = b.dataset.bt; renderBuilding(container, Render.state);
    }));
    $$('[data-build-btn]', container).forEach((btn) => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerSlash(`/setinput 建造：${btn.dataset.buildBtn}`);
      burst(window.innerWidth / 2, window.innerHeight * 0.7);
    }));
  }

  /* ---- 地图 ---- */
  function renderMap(container, s) {
    const tiles = get(s, '世界.地块', {});
    const explored = new Set(entries(tiles).map(([k]) => k));
    const N = 15, C = 7;
    const neighbors = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => explored.has(`${x + dx},${y + dy}`));

    let cells = '';
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const x = c - C, y = r - C, key = `${x},${y}`;
        if (explored.has(key)) {
          const t = tiles[key];
          const center = x === 0 && y === 0;
          cells += `<div class="map-cell explored ${center ? 'center' : ''}" data-x="${x}" data-y="${y}" title="${get(t, '类型', '地块')} (${x},${y})"><span class="ic" data-i="${tileIcon(get(t, '类型', ''))}"></span></div>`;
        } else {
          const adj = neighbors(x, y);
          cells += `<div class="map-cell fog ${adj ? 'adjacent' : ''}" data-x="${x}" data-y="${y}">${adj ? '<span class="faint" style="font-size:8px">?</span>' : ''}</div>`;
        }
      }
    }

    container.innerHTML =
      panelH('疆域图志', '探索约耗 15 精力') +
      `<div class="notice notice--info"><span class="ic notice__icon" data-i="info"></span><div>点击已探明地块查看详情；点击迷雾边缘探索新地。</div></div>` +
      `<div class="map-grid" style="grid-template-columns:repeat(${N},1fr)">${cells}</div>` +
      `<div id="tileDetail"></div>`;
    Icon.render(container);

    $$('.map-cell.explored', container).forEach((cell) => {
      cell.addEventListener('click', () => showTile(container, tiles, +cell.dataset.x, +cell.dataset.y));
    });
    $$('.map-cell.fog.adjacent', container).forEach((cell) => {
      cell.addEventListener('click', () => {
        triggerSlash(`/setinput 探索：(${cell.dataset.x},${cell.dataset.y})`);
        burst(window.innerWidth / 2, window.innerHeight * 0.7);
      });
    });
  }
  function showTile(container, tiles, x, y) {
    const t = tiles[`${x},${y}`] || {};
    const res = normalizeRes(get(t, '资源', []));
    const cnt = collectCount(get(t, '本季采集次数', 0));
    const box = $('#tileDetail', container);
    if (!box) return;
    const resHtml = res.length ? res.map((r) => `<div class="dim-source"><span>${r.name}</span><span>×${r.qty}</span></div>`).join('')
      : '<div class="faint" style="font-size:var(--font-size-xs)">此地暂无可采资源。</div>';
    box.innerHTML =
      `<div class="card tile-detail">
        <div class="building__head">
          <span class="ic building__icon" data-i="${tileIcon(get(t, '类型', ''))}" style="color:var(--color-primary)"></span>
          <span class="building__name">${get(t, '类型', '地块')} · (${x},${y})</span>
          <span class="pill">本季已采 ${cnt}</span>
        </div>
        <p class="card__sub" style="line-height:1.7;margin:4px 0 8px">${get(t, '描述', '')}</p>
        <div class="list-h"><span>当前可采集</span></div>
        <div>${resHtml}</div>
        <button class="btn btn--primary btn--sm btn--block" data-gather="${x},${y}" style="margin-top:8px"><span class="ic btn__icon" data-i="bag"></span>前往采集</button>
      </div>`;
    Icon.render(box);
    $('[data-gather]', box).addEventListener('click', () => {
      triggerSlash(`/setinput 采集：(${x},${y})`);
      burst(window.innerWidth / 2, window.innerHeight * 0.7);
    });
  }

  /* ---- 员工 ---- */
  function renderStaff(container, s) {
    const staff = entries(get(s, '旅店.员工', {}));
    if (!staff.length) { container.innerHTML = emptyState('person', '尚无雇员', '经由招募渠道寻访帮手。'); Icon.render(container); return; }
    container.innerHTML = panelH('员工名册', `${staff.length}`) + staff.map(([name, m], i) => {
      const attr = get(m, '属性', {}), st = get(m, '状态', {}), job = get(m, '职业信息', {}), gem = get(m, '心之宝石', {});
      const skills = get(m, '技能', []) || [];
      const axes = ['技艺', '悟性', '体力', '亲和', '专注'];
      const vals = axes.map((k) => num(attr[k], 0));
      const morale = clamp(num(get(st, '士气', 0), 0), 0, 100);
      const loyal = clamp(num(get(st, '忠诚度', 0), 0), 0, 100);
      const ener = clamp(num(get(st, '精力', 0), 0), 0, 100);
      const light = (gem.闪光圣岩 || []), dark = (gem.暗影原石 || []);
      return `<div class="staff-card ${morale < 30 ? 'low-morale' : ''}">
        <div class="staff-card__head">
          <div class="staff-avatar">${(name || '?').slice(0, 1)}</div>
          <div style="flex:1"><div class="staff-card__name">${name}</div><div class="staff-card__role">${get(job, '职业', '帮工')} · <span class="class-badge">${get(job, '阶级', 'T1')}</span></div></div>
          <svg class="mini-radar" id="radarStaff${i}" viewBox="0 0 50 50"></svg>
        </div>
        <div class="staff-card__stats">
          <div class="stat-line"><span class="stat-line__label">精力 ${ener}</span><div class="stat-line__bar"><div class="stat-line__fill" style="width:${ener}%;background:var(--color-primary)"></div></div></div>
          <div class="stat-line"><span class="stat-line__label">士气 ${morale}</span><div class="stat-line__bar"><div class="stat-line__fill" style="width:${morale}%;background:var(--color-success)"></div></div></div>
          <div class="stat-line"><span class="stat-line__label">忠诚 ${loyal}</span><div class="stat-line__bar"><div class="stat-line__fill" style="width:${loyal}%;background:var(--color-accent)"></div></div></div>
        </div>
        <div class="row" style="gap:4px;flex-wrap:wrap;margin-top:6px">
          <span class="pill">日薪 ${num(get(job, '日薪', 0), 0)} 银</span>
          ${skills.map((sk) => `<span class="pill pill--mint">${sk}</span>`).join('')}
        </div>
        ${(light.length || dark.length) ? `<div class="row" style="gap:4px;flex-wrap:wrap;margin-top:4px">
          ${light.map((x) => `<span class="gem-tag gem-tag--light">◈ ${x}</span>`).join('')}
          ${dark.map((x) => `<span class="gem-tag gem-tag--dark">◈ ${x}</span>`).join('')}
        </div>` : ''}
        ${get(m, '描述', '') ? `<div class="card__sub" style="margin-top:4px;line-height:1.6">${m.描述}</div>` : ''}
      </div>`;
    }).join('');
    Icon.render(container);
    staff.forEach(([, m], i) => {
      const svg = $(`#radarStaff${i}`, container); if (!svg) return;
      const attr = get(m, '属性', {});
      const axes = ['技艺', '悟性', '体力', '亲和', '专注'].map((k) => ({ name: k }));
      const vals = axes.map(() => 0);
      const realVals = ['技艺', '悟性', '体力', '亲和', '专注'].map((k) => num(attr[k], 0));
      drawRadar(svg, axes, realVals, Math.max(15, ...realVals, 1), { size: 50, pad: 4, labelPad: 0, showLabels: false, showVals: false, vertexR: 1.6, dur: 600 });
    });
  }

  /* ---- 访客 ---- */
  function renderVisitor(container, s) {
    const vis = entries(get(s, '旅店.当前访客', {}));
    if (!vis.length) { container.innerHTML = emptyState('key', '堂内无人', '今日尚无访客登门。'); Icon.render(container); return; }
    container.innerHTML = panelH('堂上宾客', `${vis.length}`) + vis.map(([name, v]) => {
      const sat = clamp(num(get(v, '满意度', 0), 0), 0, 100);
      const r = 16, c = 2 * Math.PI * r, off = c * (1 - sat / 100);
      const col = sat >= 70 ? 'var(--color-success)' : sat >= 40 ? 'var(--color-warning)' : 'var(--color-danger)';
      const special = /特殊|贵族|稀有/.test(get(v, '类型', ''));
      const pref = pillsFrom(get(v, '需求偏好', []), 'pill--mint');
      const resist = (get(v, '抗性标签', []) || []).map((t) => `<span class="pill resist-tag" style="border-style:dashed;color:var(--color-danger)">${t}</span>`).join('');
      const seed = pillsFrom(get(v, '携带种子', []), 'pill--amber');
      return `<div class="visitor-card ${special ? 'special' : ''}">
        <div class="visitor-card__head">
          <span class="ic" data-i="${visitorIcon(get(v, '类型', ''))}" style="--ic:20px;color:var(--color-primary)"></span>
          <span class="visitor-card__name">${name}</span>
          <span class="pill">${get(v, '类型', '访客')}</span>
          <div class="satisfaction"><svg width="40" height="40"><circle class="satisfaction__track" cx="20" cy="20" r="${r}"></circle><circle class="satisfaction__fill" cx="20" cy="20" r="${r}" stroke="${col}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"></circle></svg><span class="satisfaction__val" style="color:${col}">${sat}</span></div>
        </div>
        <div class="row" style="gap:4px;flex-wrap:wrap;margin:4px 0"><span class="card__sub">消费 · ${get(v, '消费能力', '中')}</span><span class="card__sub">状态 · ${get(v, '状态', '在店')}</span></div>
        <div class="visitor-card__tags">${pref}${resist}${seed}</div>
      </div>`;
    }).join('');
    Icon.render(container);
  }

  /* ---- 任务 ---- */
  function renderQuest(container, s) {
    const eng = get(s, '叙事引擎', {});
    const tab = UI.questTab || 'commission';
    const seg = `<div class="seg">
      <button class="seg__item ${tab === 'commission' ? 'is-active' : ''}" data-qt="commission">委托</button>
      <button class="seg__item ${tab === 'bond' ? 'is-active' : ''}" data-qt="bond">羁绊</button>
      <button class="seg__item ${tab === 'seed' ? 'is-active' : ''}" data-qt="seed">种子</button>
    </div>`;
    let body = '';
    if (tab === 'commission') {
      const arr = entries(get(eng, '委托任务', {}));
      body = arr.length ? arr.map(([name, q]) => {
        const st = (q && q.状态) || '进行中';
        return `<div class="quest-card">
          <div class="quest-card__head"><span class="ic" data-i="scroll" style="--ic:16px;color:var(--color-primary)"></span><span class="quest-card__name">${name}</span><span class="pill ${st === '已完成' ? 'pill--green' : st === '已失败' || st === '已过期' ? 'pill--red' : ''}">${st}</span></div>
          <div class="quest-card__desc">${(q && q.描述) || ''}</div>
          <div class="row row--between"><span class="card__sub">时限 · ${(q && q.时限) || '不限'}</span><span class="card__sub">报酬 · <span style="color:var(--color-primary)">${(q && q.报酬) || '—'}</span></span></div>
        </div>`;
      }).join('') : emptyState('scroll', '暂无委托', '随着故事推进，委托将接踵而至。');
    } else if (tab === 'bond') {
      const arr = entries(get(eng, '羁绊故事', {}));
      body = arr.length ? arr.map(([name, q]) => `<div class="quest-card" style="border-left-color:var(--color-accent)">
        <div class="quest-card__head"><span class="ic" data-i="key" style="--ic:16px;color:var(--color-accent)"></span><span class="quest-card__name">${name}</span><span class="pill pill--mint">${(q && q.当前阶段) || '未开启'}</span></div>
        <div class="quest-card__desc">${(q && q.描述) || ''}</div>
        ${q && q.触发条件 ? `<div class="card__sub">触发 · ${q.触发条件}</div>` : ''}
      </div>`).join('') : emptyState('key', '尚无羁绊', '与人往复交心，方结羁绊。');
    } else {
      const arr = entries(get(eng, '任务种子', {}));
      body = arr.length ? arr.map(([name, q]) => `<div class="quest-card" style="border-left-color:var(--dim-lore)">
        <div class="quest-card__head"><span class="ic" data-i="sparkle" style="--ic:16px;color:hsl(280 45% 58%)"></span><span class="quest-card__name">${name}</span><span class="pill">${(q && q.状态) || '潜伏中'}</span></div>
        <div class="quest-card__desc">来源 · ${(q && q.来源) || '—'}　潜在任务 · ${(q && q.潜在任务) || '—'}</div>
        <div class="row row--between"><span class="card__sub">优先级 ${num(q && q.优先级, 0)}</span><span class="card__sub">报酬 · ${(q && q.报酬) || '—'}</span></div>
      </div>`).join('') : emptyState('sparkle', '无埋设种子', '事件种子将在交互中埋下。');
    }
    container.innerHTML = seg + body;
    Icon.render(container);
    $$('.seg__item', container).forEach((b) => b.addEventListener('click', () => { UI.questTab = b.dataset.qt; renderQuest(container, Render.state); }));
  }

  /* ---- 农牧 ---- */
  function renderFarm(container, s) {
    const farm = get(s, '农牧', {});
    const plots = entries(get(farm, '农田网格', {}));
    const comp = get(farm, '堆肥箱', {});
    const live = entries(get(farm, '畜牧', {}));
    let html = panelH('农田', `${plots.length} 块`);
    html += plots.length ? plots.map(([key, p]) => {
      const state = (p && p.状态) || '荒地';
      const crop = (p && p.作物) || '';
      const days = num(p && p.剩余天数, 0);
      const watered = p && p.今日已浇水, fert = p && p.已施肥;
      const total = days > 0 ? days : 1;
      // 估算生长进度：状态种植中时，无明确总期，用剩余天数反推不可靠，仅作展示
      const pct = state === '种植中' ? (crop ? clamp(100 - days * 18, 5, 100) : 0) : 0;
      const ripe = state === '种植中' && days <= 0;
      const x = num(p && p.x, 0), y = num(p && p.y, 0);
      return `<div class="crop-plot" data-plot="${x},${y}">
        <div class="crop-plot__head">
          <span class="ic" data-i="${state === '荒地' ? 'stone' : crop ? 'wheat' : 'carrot'}" style="--ic:18px;color:${ripe ? 'var(--color-primary)' : 'var(--color-success)'}"></span>
          <span class="crop-plot__name">(${x},${y}) · ${state}${crop ? ' · ' + crop : ''}</span>
          <span class="ic status-icon ${watered ? '已浇水' : '未浇水'}" data-i="${watered ? 'water' : 'herb'}" title="${watered ? '已浇水' : '未浇水'}"></span>
          ${fert ? '<span class="ic status-icon 已施肥" data-i="fertilize" title="已施肥"></span>' : ''}
        </div>
        ${state === '种植中' && crop ? `<div class="row row--between" style="margin:3px 0"><span class="card__sub">${ripe ? '已成熟' : `约 ${days} 日后成熟`}</span>${p && p.品质修正 ? `<span class="card__sub">品质修正 ${p.品质修正}</span>` : ''}</div><div class="grow-bar"><div class="grow-bar__fill" style="width:${pct}%"></div></div>` : ''}
        <div class="row" style="gap:6px;margin-top:6px">
          ${state === '种植中' && crop ? (ripe ? `<button class="btn btn--primary btn--sm" data-harvest="${x},${y}"><span class="ic btn__icon" data-i="bag"></span>收获</button>` : `<button class="btn btn--sm" data-water="${x},${y}"><span class="ic btn__icon" data-i="water"></span>浇水</button>`) : ''}
          ${state === '荒地' ? `<button class="btn btn--sm" data-till="${x},${y}"><span class="ic btn__icon" data-i="hammer"></span>开垦</button>` : ''}
          ${state === '已开垦' ? `<button class="btn btn--sm" data-plant="${x},${y}"><span class="ic btn__icon" data-i="grain"></span>播种</button>` : ''}
        </div>
      </div>`;
    }).join('') : emptyState('wheat', '无农田', '前往地图开垦新田。');

    html += panelH('堆肥箱');
    html += `<div class="card"><div class="row row--between"><span class="card__sub">状态 · ${(comp && comp.状态) || '空'}</span><span class="card__sub">倒计时 · <span class="num">${num(comp && comp.倒计时, 0)}</span></span></div></div>`;

    html += panelH('畜牧', `${live.length}`);
    html += live.length ? live.map(([name, l]) => {
      const hp = clamp(num(get(l, '健康度', 0), 0), 0, 100);
      const col = hp >= 50 ? 'var(--color-success)' : 'var(--color-danger)';
      return `<div class="livestock-card"><div class="building__head"><span class="ic building__icon" data-i="garden"></span><span class="building__name">${name}</span></div>
        <div class="row row--between"><span class="card__sub">饲料 · ${num(get(l, '饲料倒计时', 0), 0)} 日</span><span class="card__sub">产出 · ${num(get(l, '产出倒计时', 0), 0)} 日</span></div>
        <div class="stat-line" style="margin-top:4px"><span class="stat-line__label">健康 ${hp}</span><div class="stat-line__bar"><div class="stat-line__fill" style="width:${hp}%;background:${col}"></div></div></div>
      </div>`;
    }).join('') : emptyState('garden', '无牲畜', '建造畜牧设施后将显示于此。');

    container.innerHTML = html;
    Icon.render(container);
    // 农事动作（各自指令不同）
    $$('[data-water]', container).forEach((b) => b.addEventListener('click', () => { triggerSlash(`/setinput 浇水：(${b.dataset.water})`); }));
    $$('[data-harvest]', container).forEach((b) => b.addEventListener('click', () => { triggerSlash(`/setinput 收获：(${b.dataset.harvest})`); }));
    $$('[data-till]', container).forEach((b) => b.addEventListener('click', () => { triggerSlash(`/setinput 开垦：(${b.dataset.till})`); }));
    $$('[data-plant]', container).forEach((b) => b.addEventListener('click', () => { triggerSlash(`/setinput 播种：(${b.dataset.plant})`); }));
  }

  /* ============================================================
     对外接口
     ============================================================ */
  const PANELS = {
    overview: renderOverview,
    inventory: renderInventory,
    building: renderBuilding,
    map: renderMap,
    staff: renderStaff,
    visitor: renderVisitor,
    quest: renderQuest,
    farm: renderFarm,
  };
  const SLICE = {
    overview: (s) => JSON.stringify({ ec: get(s, '访客生态'), fc: get(s, '当日预报') }),
    inventory: (s) => JSON.stringify({ inv: get(s, '旅店.库存'), rec: get(s, '旅店.配方') }),
    building: (s) => JSON.stringify(get(s, '建筑')),
    map: (s) => JSON.stringify(get(s, '世界.地块')),
    staff: (s) => JSON.stringify(get(s, '旅店.员工')),
    visitor: (s) => JSON.stringify(get(s, '旅店.当前访客')),
    quest: (s) => JSON.stringify(get(s, '叙事引擎')),
    farm: (s) => JSON.stringify(get(s, '农牧')),
  };
  const UI = { invCat: '全部', invSearch: '', buildTab: 'built', questTab: 'commission' };
  const panelSig = {};

  const Render = {
    state: {},
    raw: '',

    hud(s) { try { renderHud(s); } catch (e) { console.error('hud', e); } },

    panel(name, s, force) {
      const fn = PANELS[name]; if (!fn) return;
      const container = document.querySelector(`.panel[data-panel="${name}"]`);
      if (!container) return;
      const sig = SLICE[name] ? SLICE[name](s) : '';
      if (!force && sig === panelSig[name]) return;
      panelSig[name] = sig;
      try { fn(container, s); } catch (e) { console.error('panel ' + name, e); }
    },

    narrative(rawText) {
      const el = document.getElementById('narrative');
      if (!el) return;
      const html = Extract.extractCleanContent(rawText);
      if (html && html.trim()) el.innerHTML = html;
      else el.innerHTML = '<p class="muted">展卷静待故事浮现……</p>';
    },

    choices(rawText) {
      const box = document.getElementById('choices');
      if (!box) return;
      const opts = Extract.extractOptions(rawText);
      if (!opts.length) { box.innerHTML = ''; return; }
      box.innerHTML = opts.map((o, i) => {
        const plain = String(o).replace(/<[^>]+>/g, '').trim();
        return `<button class="choice" data-choice="${i}" data-plain="${plain.replace(/"/g, '&quot;')}">
          <span class="choice__mark">${['◇', '◈', '✦', '❖', '✧'][i % 5]}</span>
          <span class="choice__text">${o}</span>
        </button>`;
      }).join('');
      $$('.choice', box).forEach((b) => b.addEventListener('click', () => {
        triggerSlash(`/setinput ${b.dataset.plain}`);
        burst(window.innerWidth / 2, window.innerHeight * 0.7);
      }));
    }
  };

  window.Render = Render;
})();
