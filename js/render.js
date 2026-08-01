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
  const expandedStaff = new Set();

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
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]); }
  function iconName(value) { return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').slice(0, 160); }
  function cropIconName(value) { return iconName(value).replace(/种子$/u, '').trim(); }
  function replaceableIcon({ target, shared = '', fallback = 'sparkle', label, targetLabel = '仅当前项目', sharedLabel = '', group = '通用', className = 'ic', wrapper = 'span' }) {
    return `<${wrapper} class="${className}" data-icon-target="${esc(target)}"${shared ? ` data-icon-shared="${esc(shared)}"` : ''} data-icon-fallback="${esc(fallback)}" data-icon-label="${esc(label)}" data-icon-target-label="${esc(targetLabel)}"${sharedLabel ? ` data-icon-shared-label="${esc(sharedLabel)}"` : ''} data-icon-preset-group="${esc(group)}"><span class="icon-slot" data-icon-slot data-i="${esc(fallback)}"></span></${wrapper}>`;
  }
  function decorateIcons(root) { if (window.IconPicker) IconPicker.decorate(root); }
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
  function formatFunds(copper) {
    return Money.formatCopper(copper);
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
  /** 执行 slash 命令；优先用酒馆原生 triggerSlash（勿覆盖同名全局） */
  function runSlash(cmd) {
    try {
      if (typeof triggerSlash === 'function') return triggerSlash(cmd);
      if (typeof executeSlashCommandsWithOptions === 'function') return executeSlashCommandsWithOptions(cmd);
      if (typeof executeSlashCommands === 'function') return executeSlashCommands(cmd);
    } catch (e) { /* ignore */ }
    return null;
  }

  /** 把玩家意图填进卡内 composer（原生输入框已被接管隐藏），由玩家确认后发送 */
  function intend(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (window.Chat && Chat.compose(t)) {
      toast('info', '已填入输入框', t);
      return true;
    }
    runSlash('/setinput ' + t);
    toast('info', '意图', t);
    return false;
  }

  window.toast = toast; window.burst = burst; window.runSlash = runSlash; window.intend = intend;

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
    const calculated = window.MVU && typeof MVU.calculateFacilityGravity === 'function'
      ? MVU.calculateFacilityGravity(s) : null;
    const inf = calculated ? calculated.dimensions : get(ec, '设施引力', {});
    const axes = DIM_KEYS.map((k) => ({ name: DIM_NAME[k], key: k, color: DIM_COLOR[k] }));
    const vals = DIM_KEYS.map((k) => num(inf[k], 0));
    const maxV = Math.max(10, ...vals, 1);
    const total = calculated ? calculated.total : num(get(ec, '总引力值', 0), 0);
    const funds = get(s, '旅店.资金', null), initialFunds = get(fc, '日初资金', null);
    const fundsChange = funds == null || initialFunds == null ? null : num(funds, 0) - num(initialFunds, 0);

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
         <div class="forecast-funds"><span>日初资金 · <strong>${initialFunds == null ? '暂无数据' : formatFunds(initialFunds)}</strong></span><span>当前资金 · <strong>${funds == null ? '暂无数据' : formatFunds(funds)}</strong></span><span>今日变化 · <strong>${fundsChange == null ? '暂无数据' : (fundsChange >= 0 ? '+' : '') + formatFunds(fundsChange)}</strong></span></div>
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
      intend(`烹制：${r.dataset.recipe}`);
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
      intend(`建造：${btn.dataset.buildBtn}`);
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
          const type = iconName(get(t, '类型', '地块')) || '地块';
          const mapIcon = replaceableIcon({ target: `map:${x},${y}`, shared: `map-name:${type}`, fallback: tileIcon(type), label: `${type} (${x},${y})`, targetLabel: '仅当前坐标', sharedLabel: `所有同名地块“${type}”`, group: '地图' });
          cells += `<div class="map-cell explored ${center ? 'center' : ''}" data-x="${x}" data-y="${y}" title="${esc(type)} (${x},${y})">${mapIcon}</div>`;
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
    Icon.render(container); decorateIcons(container);

    $$('.map-cell.explored', container).forEach((cell) => {
      cell.addEventListener('click', () => showTile(container, tiles, +cell.dataset.x, +cell.dataset.y));
    });
    $$('.map-cell.fog.adjacent', container).forEach((cell) => {
      cell.addEventListener('click', () => {
        intend(`探索：(${cell.dataset.x},${cell.dataset.y})`);
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
    const type = iconName(get(t, '类型', '地块')) || '地块';
    box.innerHTML =
      `<div class="card tile-detail">
        <div class="building__head">
          ${replaceableIcon({ target: `map:${x},${y}`, shared: `map-name:${type}`, fallback: tileIcon(type), label: `${type} (${x},${y})`, targetLabel: '仅当前坐标', sharedLabel: `所有同名地块“${type}”`, group: '地图', className: 'ic building__icon' })}
          <span class="building__name">${esc(type)} · (${x},${y})</span>
          <span class="pill">本季已采 ${cnt}</span>
        </div>
        <p class="card__sub" style="line-height:1.7;margin:4px 0 8px">${get(t, '描述', '')}</p>
        <div class="list-h"><span>当前可采集</span></div>
        <div>${resHtml}</div>
        <button class="btn btn--primary btn--sm btn--block" data-gather="${x},${y}" style="margin-top:8px"><span class="ic btn__icon" data-i="bag"></span>前往采集</button>
      </div>`;
    Icon.render(box); decorateIcons(box);
    $('[data-gather]', box).addEventListener('click', () => {
      intend(`采集：(${x},${y})`);
      burst(window.innerWidth / 2, window.innerHeight * 0.7);
    });
  }

  /* ---- 员工 ---- */
  function renderStaff(container, s) {
    const staff = entries(get(s, '旅店.员工', {}));
    const names = new Set(staff.map(([name]) => name));
    Array.from(expandedStaff).forEach((name) => { if (!names.has(name)) expandedStaff.delete(name); });
    if (!staff.length) { container.innerHTML = emptyState('person', '尚无雇员', '经由招募渠道寻访帮手。'); Icon.render(container); return; }
    container.innerHTML = panelH('员工名册', `${staff.length}`) + staff.map(([name, m], i) => {
      const attr = get(m, '属性', {}), st = get(m, '状态', {}), job = get(m, '职业信息', {}), gem = get(m, '心之宝石', {});
      const skills = get(m, '技能', []) || [];
      const axes = ['技艺', '悟性', '体力', '亲和', '专注'];
      const morale = clamp(num(get(st, '士气', 0), 0), 0, 100);
      const loyal = clamp(num(get(st, '忠诚度', 0), 0), 0, 100);
      const ener = clamp(num(get(st, '精力', 0), 0), 0, 100);
      const light = (gem.闪光圣岩 || []), dark = (gem.暗影原石 || []);
      const detailId = `staffDetail${i}`;
      const expanded = expandedStaff.has(name);
      return `<article class="staff-card ${morale < 30 ? 'low-morale' : ''}" data-staff-card="${name}">
        <div class="staff-card__summary-row">
          <div class="staff-avatar-wrap"><div class="staff-avatar" data-avatar-name="${name}">${(name || '?').slice(0, 1)}</div></div>
          <button class="staff-card__toggle ${expanded ? 'is-expanded' : ''}" type="button" data-staff-toggle="${name}" aria-expanded="${expanded}" aria-controls="${detailId}">
            <span><span class="staff-card__name">${name}</span><span class="staff-card__role">${get(job, '职业', '帮工')} · <span class="class-badge">${get(job, '阶级', 'T1')}</span></span></span>
            <span class="ic staff-card__chevron" data-i="chevronD" aria-hidden="true"></span>
          </button>
        </div>
        <div class="staff-card__stats staff-card__quick-stats">
          <div class="stat-line"><span class="stat-line__label">精力 ${ener}</span><div class="stat-line__bar"><div class="stat-line__fill" style="width:${ener}%;background:var(--color-primary)"></div></div></div>
          <div class="stat-line"><span class="stat-line__label">士气 ${morale}</span><div class="stat-line__bar"><div class="stat-line__fill" style="width:${morale}%;background:var(--color-success)"></div></div></div>
          <div class="stat-line"><span class="stat-line__label">忠诚 ${loyal}</span><div class="stat-line__bar"><div class="stat-line__fill" style="width:${loyal}%;background:var(--color-accent)"></div></div></div>
        </div>
        <div class="staff-card__detail" id="${detailId}" data-staff-detail="${name}" ${expanded ? '' : 'hidden'}>
          <div class="staff-card__detail-head">
            <svg class="mini-radar" id="radarStaff${i}" viewBox="0 0 50 50"></svg>
            <div class="staff-card__axes">${axes.map((key) => `<span>${key} <strong>${num(attr[key], 0)}</strong></span>`).join('')}</div>
          </div>
          <div class="row staff-card__tags">
            <span class="pill">日薪 ${Money.formatCopper(num(get(job, '日薪', 0), 0))}</span>
            ${skills.map((skill) => `<span class="pill pill--mint">${skill}</span>`).join('')}
          </div>
          ${(light.length || dark.length) ? `<div class="row staff-card__tags">
            ${light.map((x) => `<span class="gem-tag gem-tag--light">◈ ${x}</span>`).join('')}
            ${dark.map((x) => `<span class="gem-tag gem-tag--dark">◈ ${x}</span>`).join('')}
          </div>` : ''}
          ${get(m, '描述', '') ? `<div class="card__sub staff-card__description">${m.描述}</div>` : ''}
          <div class="staff-card__avatar-actions">
            <label class="btn btn--ghost btn--sm staff-avatar__upload-inline"><span class="sr-only">为 ${name} 上传头像</span><input type="file" accept="image/*" data-avatar-upload="${name}"><span class="ic" data-i="plus"></span>上传头像</label>
            <button class="btn btn--ghost btn--sm" type="button" data-avatar-remove="${name}" aria-label="移除 ${name} 的头像"><span class="ic" data-i="close"></span>移除头像</button>
          </div>
        </div>
      </article>`;
    }).join('');
    Icon.render(container);
    staff.forEach(([name, m], i) => {
      const avatar = $$('[data-avatar-name]', container).find((el) => el.dataset.avatarName === name);
      if (avatar && window.Assets) Assets.avatarUrl(name).then((url) => {
        if (url && avatar.isConnected) { avatar.textContent = ''; avatar.style.backgroundImage = `url("${url}")`; avatar.classList.add('has-image'); }
      });
      const svg = $(`#radarStaff${i}`, container); if (!svg) return;
      const attr = get(m, '属性', {});
      const axes = ['技艺', '悟性', '体力', '亲和', '专注'].map((key) => ({ name: key }));
      const realVals = ['技艺', '悟性', '体力', '亲和', '专注'].map((key) => num(attr[key], 0));
      drawRadar(svg, axes, realVals, Math.max(15, ...realVals, 1), { size: 50, pad: 4, labelPad: 0, showLabels: false, showVals: false, vertexR: 1.6, dur: 600 });
    });
    $$('[data-staff-toggle]', container).forEach((button) => button.addEventListener('click', () => {
      const name = button.dataset.staffToggle;
      const detail = document.getElementById(button.getAttribute('aria-controls'));
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      button.classList.toggle('is-expanded', expanded);
      if (detail) detail.hidden = !expanded;
      if (expanded) expandedStaff.add(name); else expandedStaff.delete(name);
    }));
    $$('[data-avatar-upload]', container).forEach((input) => input.addEventListener('change', async () => {
      const file = input.files && input.files[0]; if (!file) return;
      if (!String(file.type || '').startsWith('image/')) { toast('warn', '头像格式不支持', '请选择图片文件。'); return; }
      const saved = window.Assets && await Assets.putStaffAvatar(input.dataset.avatarUpload, file);
      if (!saved) { toast('error', '头像保存失败', '浏览器本地数据库不可用。'); return; }
      toast('success', '头像已保存', input.dataset.avatarUpload + ' 的头像已存入 IndexedDB。');
      renderStaff(container, Render.state);
    }));
    $$('[data-avatar-remove]', container).forEach((button) => button.addEventListener('click', async () => {
      if (window.Assets) await Assets.removeStaffAvatar(button.dataset.avatarRemove);
      toast('info', '头像已移除', '已恢复姓名首字头像。');
      renderStaff(container, Render.state);
    }));
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
  function farmDetail(key, plot, farm, magic) {
    const p = plot || {}, state = p.状态 || '荒地', crop = iconName(p.作物 || '');
    const days = num(p.剩余天数, 0), ripe = state === '种植中' && days <= 0;
    const pct = state === '种植中' && crop ? clamp(100 - days * 18, 5, 100) : 0;
    const fallback = ripe ? 'ripe' : state === '荒地' ? 'stone' : crop ? itemIcon(crop) : magic ? 'magicfarm' : 'garden';
    const farmIcon = replaceableIcon({ target: `farm:${magic ? 'magic' : 'normal'}:${key}`, shared: crop ? `crop:${crop}` : '', fallback, label: `${magic ? '魔法' : '普通'}田格 ${key}${crop ? ` · ${crop}` : ''}`, targetLabel: '仅当前田格', sharedLabel: `所有同名作物“${crop}”`, group: crop ? '作物' : '农牧', className: 'ic' });
    return `<div class="crop-plot" data-plot-detail="${key}">
      <div class="crop-plot__head">
        ${farmIcon}
        <span class="crop-plot__name">田格 (${key}) · ${state}${crop ? ' · ' + crop : ''}</span>
        <span class="ic status-icon ${p.今日已浇水 ? '已浇水' : '未浇水'}" data-i="${p.今日已浇水 ? 'water' : 'herb'}" title="${p.今日已浇水 ? '已浇水' : '未浇水'}"></span>
        ${p.已施肥 ? '<span class="ic status-icon 已施肥" data-i="fertilize" title="已施肥"></span>' : ''}
      </div>
      ${state === '种植中' && crop ? `<div class="row row--between"><span class="card__sub">${ripe ? '已成熟' : `约 ${days} 日后成熟`}</span><span class="card__sub">品质修正 ${num(p.品质修正, 0)}</span></div><div class="grow-bar"><div class="grow-bar__fill" style="width:${pct}%"></div></div>` : ''}
      ${magic ? `<div class="farm-magic-meta"><span>稳定度 ${clamp(num(p.魔力稳定度, 100), 0, 100)}</span><span>未养护 ${num(p.连续未养护天数, 0)} 日</span><span>变异 · ${p.变异状态 || '无'}</span></div>${p.环境标签 && p.环境标签.length ? `<div class="row">${pillsFrom(p.环境标签, 'pill--mint')}</div>` : ''}` : ''}
      <div class="card__sub">已收获 ${num(p.已收获次数, 0)} 次 · 过熟 ${num(p.过熟天数, 0)} 日</div>
      <div class="row farm-detail__actions">
        ${state === '种植中' && crop ? (ripe ? `<button class="btn btn--primary btn--sm" data-harvest="${key}"><span class="ic btn__icon" data-i="bag"></span>收获</button>` : `<button class="btn btn--sm" data-water="${key}"><span class="ic btn__icon" data-i="water"></span>浇水</button>`) : ''}
        ${state === '荒地' ? `<button class="btn btn--sm" data-till="${key}"><span class="ic btn__icon" data-i="hammer"></span>开垦</button>` : ''}
        ${state === '已开垦' ? `<button class="btn btn--sm" data-plant="${key}"><span class="ic btn__icon" data-i="grain"></span>播种</button>` : ''}
        ${magic && state === '种植中' ? `<button class="btn btn--sm" data-magic-water="${key}">魔力灌溉</button><button class="btn btn--sm" data-tend="${key}">养护</button>` : ''}
      </div>
    </div>`;
  }

  function bindFarmActions(container) {
    $$('[data-water]', container).forEach((b) => b.addEventListener('click', () => intend(`浇水：(${b.dataset.water})`)));
    $$('[data-harvest]', container).forEach((b) => b.addEventListener('click', () => intend(`收获：(${b.dataset.harvest})`)));
    $$('[data-till]', container).forEach((b) => b.addEventListener('click', () => intend(`开垦：(${b.dataset.till})`)));
    $$('[data-plant]', container).forEach((b) => b.addEventListener('click', () => intend(`播种：(${b.dataset.plant})`)));
    $$('[data-magic-water]', container).forEach((b) => b.addEventListener('click', () => intend(`魔力灌溉：(${b.dataset.magicWater})`)));
    $$('[data-tend]', container).forEach((b) => b.addEventListener('click', () => intend(`养护魔法农田：(${b.dataset.tend})`)));
    $$('[data-seed-use]', container).forEach((b) => b.addEventListener('click', () => intend(`准备用${b.dataset.seedUse}播种`)));
    $$('[data-care-livestock]', container).forEach((b) => b.addEventListener('click', () => intend(`照料畜牧设施：${b.dataset.careLivestock}`)));
  }

  function farmGrid(farm, magic) {
    const size = get(farm, magic ? '魔法农田大小' : '农田大小', {});
    const records = get(farm, magic ? '魔法农田网格' : '农田网格', {}) || {};
    const height = clamp(Math.floor(num(size.长, magic ? 2 : 3)), 1, 30);
    const width = clamp(Math.floor(num(size.宽, magic ? 2 : 3)), 1, 30);
    const inRange = new Set(), cells = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const key = `${x},${y}`, p = records[key] || { x, y, 状态: '荒地' };
      inRange.add(key);
      const state = p.状态 || '荒地', crop = iconName(p.作物 || ''), ripe = state === '种植中' && num(p.剩余天数, 0) <= 0;
      const fallback = ripe ? 'ripe' : state === '荒地' ? 'stone' : crop ? itemIcon(crop) : magic ? 'magicfarm' : 'garden';
      const icon = replaceableIcon({ target: `farm:${magic ? 'magic' : 'normal'}:${key}`, shared: crop ? `crop:${crop}` : '', fallback, label: `${magic ? '魔法' : '普通'}田格 ${key}${crop ? ` · ${crop}` : ''}`, targetLabel: '仅当前田格', sharedLabel: `所有同名作物“${crop}”`, group: crop ? '作物' : '农牧', className: 'farm-cell__icon', wrapper: 'span' });
      cells.push(`<button class="farm-cell ${magic ? 'is-magic' : ''} ${state === '种植中' ? 'is-planted' : state === '已开垦' ? 'is-tilled' : 'is-wild'} ${ripe ? 'is-ripe' : ''}" type="button" data-plot="${key}" aria-label="田格${key}，${esc(state)}${crop ? '，' + esc(crop) : ''}"><span class="farm-cell__coord">${x},${y}</span>${icon}<span class="farm-cell__name">${esc(crop || state)}</span></button>`);
    }
    const overflow = entries(records).filter(([key]) => !inRange.has(key));
    return { width, height, records, cells, overflow };
  }

  function renderFarm(container, s) {
    const farm = get(s, '农牧', {}), tab = UI.farmTab || 'normal';
    const tabs = `<div class="seg farm-tabs"><button class="seg__item ${tab === 'normal' ? 'is-active' : ''}" data-farm-tab="normal">普通农田</button><button class="seg__item ${tab === 'magic' ? 'is-active' : ''}" data-farm-tab="magic">魔法农田</button><button class="seg__item ${tab === 'seeds' ? 'is-active' : ''}" data-farm-tab="seeds">种子图鉴</button><button class="seg__item ${tab === 'care' ? 'is-active' : ''}" data-farm-tab="care">畜牧与堆肥</button></div>`;
    let html = tabs;
    if (tab === 'normal' || tab === 'magic') {
      const magic = tab === 'magic';
      if (magic && !get(farm, '魔法农田已解锁', false)) {
        html += emptyState('sparkle', '魔法农田尚未解锁', '通过剧情、设施或变量规则解锁后，魔法田格将在这里展开。');
        container.innerHTML = html; Icon.render(container);
      } else {
        const grid = farmGrid(farm, magic);
        html += panelH(magic ? '魔法农田' : '旅店农田', `${grid.width}×${grid.height}`);
        html += `<div class="notice notice--info"><span class="ic notice__icon" data-i="info"></span><div>点击田格查看状态与农事操作；坐标从 (0,0) 开始。</div></div>`;
        html += `<div class="farm-grid-scroll"><div class="farm-grid" style="grid-template-columns:repeat(${grid.width},minmax(64px,1fr));min-width:${grid.width * 70}px">${grid.cells.join('')}</div></div><div id="farmDetail"></div>`;
        if (grid.overflow.length) html += panelH('范围外田格', `${grid.overflow.length}`) + `<div class="farm-overflow">${grid.overflow.map(([key, p]) => farmDetail(key, p, farm, magic)).join('')}</div>`;
        container.innerHTML = html; Icon.render(container); decorateIcons(container); bindFarmActions(container);
        $$('.farm-cell', container).forEach((cell) => cell.addEventListener('click', () => {
          $$('.farm-cell', container).forEach((x) => x.classList.toggle('is-active', x === cell));
          const detail = $('#farmDetail', container); detail.innerHTML = farmDetail(cell.dataset.plot, grid.records[cell.dataset.plot], farm, magic);
          Icon.render(detail); decorateIcons(detail); bindFarmActions(detail);
        }));
      }
    } else if (tab === 'seeds') {
      const seeds = entries(get(farm, '种子图鉴', {}));
      html += panelH('种子图鉴', seeds.length);
      html += seeds.length ? `<div class="seed-catalog">${seeds.map(([name, seed]) => {
        const cropName = cropIconName(name);
        const seedIcon = replaceableIcon({ target: `crop:${cropName}`, fallback: itemIcon(cropName), label: `${cropName}种子及同名作物`, targetLabel: `应用于“${cropName}”种子及所有同名作物`, group: '作物', className: 'ic building__icon' });
        return `<article class="seed-card"><div class="building__head">${seedIcon}<span class="building__name">${esc(name)}</span><span class="pill ${seed.类型 === '魔法' ? 'pill--mint' : ''}">${esc(seed.类型 || '普通')}</span></div><div class="card__sub">季节 · ${esc((seed.可种季节 || []).join('、') || '未限定')}　生长 · ${num(seed.生长天数, 0)} 日　种子价 · ${num(seed.种子价, 0)}</div><div class="quest-card__desc">产出 · ${esc(seed.产出 || '—')}　获取 · ${esc(seed.获取方式 || '—')}</div><div class="card__sub">连续收获 · ${seed.可连续收获 ? `是 / 间隔 ${num(seed.收获间隔天数, 0)} 日 / 上限 ${num(seed.收获次数上限, 1)}${seed.永续 ? ' / 永续' : ''}` : '否'}</div>${seed.特殊条件 ? `<div class="card__sub">条件 · ${esc(seed.特殊条件)}</div>` : ''}${seed.产出效果 ? `<div class="card__sub">效果 · ${esc(seed.产出效果)}</div>` : ''}${seed.描述 ? `<p class="quest-card__desc">${esc(seed.描述)}</p>` : ''}<button class="btn btn--sm" data-seed-use="${esc(name)}">用于播种</button></article>`;
      }).join('')}</div>` : emptyState('grain', '种子图鉴为空', '获得种子资料后会在这里记录。');
      container.innerHTML = html; Icon.render(container); decorateIcons(container); bindFarmActions(container);
    } else {
      const comp = get(farm, '堆肥箱', {}), live = entries(get(farm, '畜牧', {}));
      html += panelH('堆肥箱') + `<div class="card"><div class="row row--between"><span class="card__sub">状态 · ${(comp && comp.状态) || '空'}</span><span class="card__sub">倒计时 · <span class="num">${num(comp && comp.倒计时, 0)}</span></span></div></div>`;
      html += panelH('畜牧', `${live.length}`) + (live.length ? live.map(([name, l]) => {
        const hp = clamp(num(get(l, '健康度', 0), 0), 0, 100), col = hp >= 50 ? 'var(--color-success)' : 'var(--color-danger)', livestockName = iconName(name);
        const fallback = /鸡|禽/.test(livestockName) ? 'chicken' : /鸭/.test(livestockName) ? 'duck' : /牛/.test(livestockName) ? 'cow' : /羊/.test(livestockName) ? 'sheep' : /猪/.test(livestockName) ? 'pig' : /蜂/.test(livestockName) ? 'beehive' : 'barn';
        return `<div class="livestock-card"><div class="building__head">${replaceableIcon({ target: `livestock:${livestockName}`, fallback, label: livestockName, targetLabel: `所有同名畜牧“${livestockName}”`, group: '农牧', className: 'ic building__icon' })}<span class="building__name">${esc(name)}</span></div><div class="row row--between"><span class="card__sub">饲料 · ${num(get(l, '饲料倒计时', 0), 0)} 日</span><span class="card__sub">产出 · ${num(get(l, '产出倒计时', 0), 0)} 日</span></div><div class="stat-line"><span class="stat-line__label">健康 ${hp}</span><div class="stat-line__bar"><div class="stat-line__fill" style="width:${hp}%;background:${col}"></div></div></div><button class="btn btn--sm" data-care-livestock="${esc(name)}">照料</button></div>`;
      }).join('') : emptyState('garden', '无牲畜', '建造畜牧设施后将显示于此。'));
      container.innerHTML = html; Icon.render(container); decorateIcons(container); bindFarmActions(container);
    }
    $$('[data-farm-tab]', container).forEach((button) => button.addEventListener('click', () => { UI.farmTab = button.dataset.farmTab; renderFarm(container, Render.state); }));
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
  const UI = { invCat: '全部', invSearch: '', buildTab: 'built', questTab: 'commission', farmTab: 'normal' };
  const panelSig = {};

  const Render = {
    state: {},
    raw: '',
    expandedStaff,

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
        // 填入卡内 composer，玩家可改后再发送
        intend(b.dataset.plain);
        burst(window.innerWidth / 2, window.innerHeight * 0.7);
      }));
    }
  };

  window.Render = Render;
})();
