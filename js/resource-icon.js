/* ============================================================
   同名资源图标
   - 规范化库存、种子、作物共享键
   - 安全识别并美化食谱材料，不改变原始文本或业务判断
   ============================================================ */
const ResourceIcon = (function () {
  'use strict';

  function normalizeName(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }

  function baseCropName(value) {
    return normalizeName(value).replace(/种子$/u, '').trim();
  }

  function key(value) {
    const name = baseCropName(value);
    return name ? `resource:${name}` : '';
  }

  function fallback(value) {
    const name = baseCropName(value);
    if (/菇|菌|茸/.test(name)) return 'mushroom';
    if (/麦|粉|谷|米|面/.test(name)) return 'grain';
    if (/蛋/.test(name)) return 'egg';
    if (/草|药|香|薄荷/.test(name)) return 'herb';
    if (/鱼/.test(name)) return 'fish';
    if (/蜜|糖/.test(name)) return 'honey';
    if (/木|柴|板|梁/.test(name)) return 'wood';
    if (/石|矿|砖/.test(name)) return 'stone';
    if (/花|兰|菊|薇/.test(name)) return 'flower';
    if (/符石|宝石|晶|魔石|露/.test(name)) return 'gem';
    return 'bag';
  }

  function entries(value) {
    return value && typeof value === 'object' ? Object.entries(value) : [];
  }

  function knownNames(state) {
    const names = new Set();
    const add = (value) => { const name = normalizeName(value); if (name) names.add(name); };
    entries(state && state.旅店 && state.旅店.库存).forEach(([name]) => add(name));
    entries(state && state.农牧 && state.农牧.种子图鉴).forEach(([name]) => { add(name); add(baseCropName(name)); });
    ['农田网格', '魔法农田网格'].forEach((field) => {
      entries(state && state.农牧 && state.农牧[field]).forEach(([, plot]) => add(plot && plot.作物));
    });
    return Array.from(names).sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh-CN'));
  }

  function tokens(materials, state) {
    const source = String(materials == null ? '' : materials);
    const names = knownNames(state);
    const out = [];
    let index = 0, text = '';
    const flush = () => { if (text) { out.push({ type: 'text', value: text }); text = ''; } };
    while (index < source.length) {
      const found = names.find((name) => source.startsWith(name, index));
      if (found) {
        flush();
        out.push({ type: 'resource', value: found, key: key(found) });
        index += found.length;
      } else {
        text += source[index];
        index++;
      }
    }
    flush();
    return out.map((token) => token.value).join('') === source ? out : [{ type: 'text', value: source }];
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function markup(name, options = {}) {
    const display = normalizeName(name);
    const base = baseCropName(display);
    const resourceKey = key(display);
    if (!resourceKey) return '';
    const className = ['resource-icon', options.className || ''].filter(Boolean).join(' ');
    const label = options.label || `资源 ${display}`;
    const group = options.group || '资源';
    return `<button type="button" class="${esc(className)}" data-icon-target="${esc(resourceKey)}" data-icon-shared="${esc(resourceKey)}" data-icon-force-shared="true" data-icon-fallback="${esc(fallback(base))}" data-icon-label="${esc(label)}" data-icon-target-label="所有同名资源“${esc(base)}”" data-icon-shared-label="所有同名资源“${esc(base)}”" data-icon-preset-group="${esc(group)}" aria-label="${esc(label)}；右键、长按或按菜单键更换同名资源图标" title="右键、长按或按菜单键更换同名资源图标"><span class="icon-slot" data-icon-slot data-i="${esc(fallback(base))}"></span></button>`;
  }

  function materialMarkup(materials, state) {
    const body = tokens(materials, state).map((token) => token.type === 'resource'
      ? `<span class="recipe-material">${markup(token.value, { className: 'recipe-material__icon', label: `食谱材料 ${token.value}`, group: '资源' })}<span>${esc(token.value)}</span></span>`
      : esc(token.value)).join('');
    return `<span class="recipe-materials">${body}</span>`;
  }

  return { normalizeName, baseCropName, key, fallback, knownNames, tokens, markup, materialMarkup };
})();
window.ResourceIcon = ResourceIcon;
