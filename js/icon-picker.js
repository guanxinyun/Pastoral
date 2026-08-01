/* ============================================================
   玩家图标选择器 · 系统预设 / IndexedDB 个人图片
   桌面右键、触摸长按、ContextMenu 键或 Shift+F10 打开。
   ============================================================ */
const IconPicker = (function () {
  'use strict';

  const LONG_PRESS_MS = 550;
  const MOVE_TOLERANCE = 12;
  const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  let bindings = {};
  let readyPromise = null;
  let initialized = false;
  let press = null;
  let suppressClickUntil = 0;

  function targets(root = document) { return Array.from(root.querySelectorAll('[data-icon-target]')); }
  function keysFor(el) { return [el.dataset.iconTarget, el.dataset.iconShared].filter(Boolean); }
  function resolve(keys, fallback) {
    const ordered = Array.isArray(keys) ? keys : [keys];
    for (const key of ordered) if (key && bindings[key]) return { id: bindings[key], key, fallback };
    return { id: '', key: '', fallback };
  }

  async function loadBindings() {
    bindings = window.Assets ? await Assets.getIconBindings() : {};
    return bindings;
  }

  function renderSlot(el) { return el.querySelector('[data-icon-slot]') || el; }

  async function renderTarget(el) {
    if (!el || !el.isConnected) return;
    const slot = renderSlot(el);
    const fallback = el.dataset.iconFallback || slot.dataset.i || 'sparkle';
    const found = resolve(keysFor(el), fallback);
    slot.dataset.i = fallback;
    slot.innerHTML = Icon.get(fallback);
    el.classList.remove('has-custom-icon');
    if (!found.id) return;
    if (found.id.startsWith('preset:')) {
      slot.innerHTML = Icon.get(found.id.slice(7));
      el.classList.add('has-custom-icon');
      return;
    }
    if (!window.Assets) return;
    const url = await Assets.customIconUrl(found.id);
    if (!url || !el.isConnected || resolve(keysFor(el), fallback).id !== found.id) return;
    const img = document.createElement('img');
    img.className = 'custom-icon-image'; img.alt = ''; img.src = url; img.draggable = false;
    img.addEventListener('error', () => { el.classList.remove('has-custom-icon'); slot.innerHTML = Icon.get(fallback); }, { once: true });
    slot.replaceChildren(img); el.classList.add('has-custom-icon');
  }

  function prepareTarget(el) {
    const interactiveParent = el.closest('button, a');
    if (interactiveParent && interactiveParent !== el) {
      ['iconTarget', 'iconShared', 'iconFallback', 'iconLabel', 'iconTargetLabel', 'iconSharedLabel', 'iconPresetGroup'].forEach((key) => {
        if (el.dataset[key]) interactiveParent.dataset[key] = el.dataset[key];
      });
      Array.from(el.attributes).filter((attr) => attr.name.startsWith('data-icon-') && attr.name !== 'data-icon-slot').forEach((attr) => el.removeAttribute(attr.name));
      prepareTarget(interactiveParent);
      return;
    }
    if (!el.dataset.iconLabel) el.dataset.iconLabel = '此项目';
    if (!/^(BUTTON|A)$/.test(el.tagName) && !el.hasAttribute('tabindex')) { el.tabIndex = 0; el.setAttribute('role', 'button'); }
    const existing = el.getAttribute('aria-label');
    if (!existing || !existing.includes('更换图标')) el.setAttribute('aria-label', `${existing ? existing + '；' : ''}${el.dataset.iconLabel}，右键或长按更换图标`);
    el.classList.add('replaceable-icon');
    renderTarget(el);
  }

  function decorate(root = document) { targets(root).forEach(prepareTarget); }
  async function refresh(root = document) { await loadBindings(); decorate(root); }

  function targetFromEvent(event) { return event.target && event.target.closest ? event.target.closest('[data-icon-target]') : null; }
  function cancelPress() { if (press && press.timer) clearTimeout(press.timer); press = null; }

  function onPointerDown(event) {
    const el = targetFromEvent(event);
    if (!el || event.button !== 0 || event.pointerType === 'mouse') return;
    cancelPress();
    press = { el, pointerId: event.pointerId, x: event.clientX, y: event.clientY, timer: setTimeout(() => {
      if (!press || press.el !== el) return;
      suppressClickUntil = Date.now() + 700;
      if (navigator.vibrate) navigator.vibrate(20);
      open(el); cancelPress();
    }, LONG_PRESS_MS) };
  }

  function onPointerMove(event) {
    if (!press || event.pointerId !== press.pointerId) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_TOLERANCE) cancelPress();
  }

  function closeDialog(backdrop, previous) {
    if (!backdrop || !backdrop.isConnected) return;
    backdrop.remove();
    if (previous && previous.focus) previous.focus();
  }

  function focusables(root) {
    return Array.from(root.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
  }

  function trap(event, backdrop, dialog, previous) {
    if (event.key === 'Escape') { event.preventDefault(); closeDialog(backdrop, previous); return; }
    if (event.key !== 'Tab') return;
    const list = focusables(dialog); if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function iconButton(entry, selected) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'icon-picker__choice';
    button.dataset.iconChoice = entry.id || entry.name;
    button.dataset.iconKind = entry.id ? 'custom' : 'preset';
    button.setAttribute('aria-label', entry.label || entry.name);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (entry.id) {
      const img = document.createElement('img'); img.className = 'custom-icon-image'; img.alt = '';
      Assets.customIconUrl(entry.id).then((url) => { if (url && img.isConnected) img.src = url; });
      button.append(img);
    } else {
      const icon = document.createElement('span'); icon.className = 'ic'; icon.innerHTML = Icon.get(entry.name); button.append(icon);
    }
    const label = document.createElement('span'); label.className = 'icon-picker__choice-label'; label.textContent = entry.label || entry.name; button.append(label);
    return button;
  }

  function setStatus(dialog, text, type) {
    const status = dialog.querySelector('[data-icon-picker-status]');
    if (!status) return; status.textContent = text || ''; status.className = 'icon-picker__status' + (type ? ` is-${type}` : '');
  }

  async function imageDecodes(file) {
    if (file.type === 'image/svg+xml') return true;
    if (typeof createImageBitmap === 'function') {
      try { const bitmap = await createImageBitmap(file); if (bitmap.close) bitmap.close(); return true; } catch (e) { return false; }
    }
    return true;
  }

  function presetGroupsFor(el) {
    const scope = el.dataset.iconPresetGroup;
    if (scope === '资源') return ['作物', '农牧', '通用'];
    return scope && ['地图', '作物', '农牧'].includes(scope) ? [scope, '通用'] : ['地图', '作物', '农牧', '通用'];
  }

  async function open(el) {
    if (!el || document.getElementById('iconPickerBackdrop')) return;
    await (readyPromise || loadBindings());
    const previous = document.activeElement;
    const current = resolve(keysFor(el), el.dataset.iconFallback || 'sparkle');
    let selected = current.id
      ? (current.id.startsWith('preset:') ? { kind: 'preset', value: current.id.slice(7) } : { kind: 'custom', value: current.id })
      : { kind: 'preset', value: el.dataset.iconFallback || 'sparkle' };
    let library = window.Assets ? await Assets.listCustomIcons() : [];

    const backdrop = document.createElement('div'); backdrop.id = 'iconPickerBackdrop'; backdrop.className = 'modal-backdrop icon-picker-backdrop';
    const dialog = document.createElement('section'); dialog.className = 'icon-picker'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'iconPickerTitle');
    dialog.innerHTML = `
      <header class="icon-picker__head"><span class="ic" data-i="sparkle"></span><div><h2 id="iconPickerTitle">更换图标</h2><p>${escapeHtml(el.dataset.iconLabel || '当前项目')}</p></div><button type="button" class="settings-pop__close" data-icon-picker-close aria-label="关闭"><span class="ic" data-i="close"></span></button></header>
      <div class="icon-picker__tabs" role="tablist" aria-label="图标来源"><button type="button" class="is-active" role="tab" aria-selected="true" data-icon-picker-tab="preset">系统预设</button><button type="button" role="tab" aria-selected="false" data-icon-picker-tab="custom">我的图标</button></div>
      <div class="icon-picker__panel" data-icon-picker-panel="preset"></div>
      <div class="icon-picker__panel" data-icon-picker-panel="custom" hidden></div>
      <fieldset class="icon-picker__scope"><legend>应用范围</legend>${el.dataset.iconForceShared === 'true' && el.dataset.iconShared ? `<label><input type="radio" name="iconScope" value="shared" checked> ${escapeHtml(el.dataset.iconSharedLabel || '应用到所有同名资源')}</label>` : `<label><input type="radio" name="iconScope" value="target" checked> ${escapeHtml(el.dataset.iconTargetLabel || '仅当前项目')}</label>${el.dataset.iconShared ? `<label><input type="radio" name="iconScope" value="shared"> ${escapeHtml(el.dataset.iconSharedLabel || '应用到同名项目')}</label>` : ''}`}</fieldset>
      <div class="icon-picker__status" data-icon-picker-status role="status" aria-live="polite"></div>
      <footer class="icon-picker__foot"><button type="button" class="btn btn--ghost" data-icon-restore>恢复系统默认</button><span class="icon-picker__spacer"></span><button type="button" class="btn btn--ghost" data-icon-picker-close>取消</button><button type="button" class="btn btn--primary" data-icon-save>保存</button></footer>`;
    backdrop.append(dialog); document.body.append(backdrop); Icon.render(dialog);

    const renderPanels = () => {
      const presetPanel = dialog.querySelector('[data-icon-picker-panel="preset"]'); presetPanel.innerHTML = '';
      presetGroupsFor(el).forEach((group) => {
        const section = document.createElement('section'); section.className = 'icon-picker__group';
        const title = document.createElement('h3'); title.textContent = group; section.append(title);
        const grid = document.createElement('div'); grid.className = 'icon-picker__grid'; grid.setAttribute('role', 'listbox');
        Icon.catalog(group).forEach((entry) => grid.append(iconButton(entry, selected.kind === 'preset' && selected.value === entry.name)));
        section.append(grid); presetPanel.append(section);
      });
      const customPanel = dialog.querySelector('[data-icon-picker-panel="custom"]'); customPanel.innerHTML = '';
      const actions = document.createElement('div'); actions.className = 'icon-picker__library-actions';
      const upload = document.createElement('label'); upload.className = 'btn btn--primary icon-picker__upload'; upload.innerHTML = '<span class="ic" data-i="plus"></span>上传新图标';
      const input = document.createElement('input'); input.type = 'file'; input.dataset.iconUpload = ''; input.accept = ALLOWED_MIME.join(','); upload.append(input); actions.append(upload); customPanel.append(actions); Icon.render(actions);
      if (!window.Assets || !Assets.available()) {
        const empty = document.createElement('div'); empty.className = 'empty-state'; empty.innerHTML = '<div class="empty-state__title">当前浏览器无法保存个人图标</div><div class="empty-state__desc">仍可使用全部系统预设。</div>'; customPanel.append(empty); input.disabled = true;
      } else if (!library.length) {
        const empty = document.createElement('div'); empty.className = 'empty-state'; empty.innerHTML = '<span class="ic empty-state__icon" data-i="seedbag"></span><div class="empty-state__title">个人图标库为空</div><div class="empty-state__desc">上传 PNG、JPG、WebP 或 SVG，之后可在不同格子间复用。</div>'; customPanel.append(empty); Icon.render(empty);
      } else {
        const grid = document.createElement('div'); grid.className = 'icon-picker__grid'; grid.setAttribute('role', 'listbox');
        library.forEach((entry) => {
          const wrap = document.createElement('div'); wrap.className = 'icon-picker__custom-item'; wrap.append(iconButton({ ...entry, label: entry.name }, selected.kind === 'custom' && selected.value === entry.id));
          const manage = document.createElement('div'); manage.className = 'icon-picker__manage'; manage.dataset.iconManage = entry.id; manage.innerHTML = `<button type="button" data-icon-rename="${entry.id}">重命名</button><button type="button" data-icon-delete="${entry.id}" data-icon-delete-refs="${Object.values(bindings).filter((value) => value === entry.id).length}">删除</button>`; wrap.append(manage); grid.append(wrap);
        }); customPanel.append(grid);
      }
    };
    renderPanels();

    dialog.addEventListener('click', async (event) => {
      const close = event.target.closest('[data-icon-picker-close]'); if (close) { closeDialog(backdrop, previous); return; }
      const tab = event.target.closest('[data-icon-picker-tab]');
      if (tab) {
        dialog.querySelectorAll('[data-icon-picker-tab]').forEach((button) => { const active = button === tab; button.classList.toggle('is-active', active); button.setAttribute('aria-selected', active ? 'true' : 'false'); });
        dialog.querySelectorAll('[data-icon-picker-panel]').forEach((panel) => { panel.hidden = panel.dataset.iconPickerPanel !== tab.dataset.iconPickerTab; }); return;
      }
      const choice = event.target.closest('[data-icon-choice]');
      if (choice) { selected = { kind: choice.dataset.iconKind, value: choice.dataset.iconChoice }; renderPanels(); return; }
      const rename = event.target.closest('[data-icon-rename]');
      if (rename) {
        const entry = library.find((item) => item.id === rename.dataset.iconRename); if (!entry) return;
        const manage = rename.closest('[data-icon-manage]');
        manage.innerHTML = `<label class="sr-only" for="iconRenameInput">新的图标名称</label><input class="set-input" id="iconRenameInput" value="${escapeHtml(entry.name)}" maxlength="80"><button type="button" data-icon-rename-save="${entry.id}">保存名称</button><button type="button" data-icon-manage-cancel>取消</button>`;
        manage.querySelector('input').focus(); return;
      }
      const renameSave = event.target.closest('[data-icon-rename-save]');
      if (renameSave) {
        const value = renameSave.closest('[data-icon-manage]').querySelector('input').value;
        if (await Assets.renameCustomIcon(renameSave.dataset.iconRenameSave, value)) { library = await Assets.listCustomIcons(); renderPanels(); setStatus(dialog, '名称已更新。', 'success'); }
        else setStatus(dialog, '请输入有效名称。', 'error'); return;
      }
      if (event.target.closest('[data-icon-manage-cancel]')) { renderPanels(); return; }
      const remove = event.target.closest('[data-icon-delete]');
      if (remove) {
        const id = remove.dataset.iconDelete; const refs = Object.values(bindings).filter((value) => value === id).length;
        const manage = remove.closest('[data-icon-manage]');
        manage.innerHTML = `<p class="icon-picker__delete-copy">此图标正用于 ${refs} 个位置。删除后将恢复下一优先级。</p><button type="button" data-icon-delete-confirm="${id}" class="is-danger">确认删除</button><button type="button" data-icon-manage-cancel>取消</button>`; return;
      }
      const removeConfirm = event.target.closest('[data-icon-delete-confirm]');
      if (removeConfirm) {
        const id = removeConfirm.dataset.iconDeleteConfirm; await Assets.removeCustomIcon(id);
        if (selected.value === id) selected = { kind: 'preset', value: el.dataset.iconFallback || 'sparkle' };
        await loadBindings(); library = await Assets.listCustomIcons(); renderPanels(); setStatus(dialog, '图标已删除，引用位置已安全回退。', 'success'); dispatchChanged(); return;
      }
      if (event.target.closest('[data-icon-restore]')) {
        const scope = dialog.querySelector('[name="iconScope"]:checked').value;
        delete bindings[scope === 'shared' && el.dataset.iconShared ? el.dataset.iconShared : el.dataset.iconTarget];
        if (await Assets.setIconBindings(bindings)) { dispatchChanged(); closeDialog(backdrop, previous); } else setStatus(dialog, '恢复默认失败，请重试。', 'error');
        return;
      }
      if (event.target.closest('[data-icon-save]')) {
        const scope = dialog.querySelector('[name="iconScope"]:checked').value;
        const key = scope === 'shared' && el.dataset.iconShared ? el.dataset.iconShared : el.dataset.iconTarget;
        bindings[key] = selected.kind === 'preset' ? `preset:${selected.value}` : selected.value;
        if (await Assets.setIconBindings(bindings)) { dispatchChanged(); closeDialog(backdrop, previous); } else setStatus(dialog, '图标保存失败，请检查浏览器存储。', 'error');
      }
    });

    dialog.addEventListener('change', async (event) => {
      const input = event.target.closest('[data-icon-upload]'); if (!input || !input.files || !input.files[0]) return;
      const file = input.files[0];
      if (!ALLOWED_MIME.includes(file.type) || file.size > Assets.ICON_MAX_BYTES || !(await imageDecodes(file))) { setStatus(dialog, '文件不是受支持且可读取的图片，或超过 2 MiB。', 'error'); input.value = ''; return; }
      input.disabled = true; setStatus(dialog, '正在保存个人图标…', 'loading');
      const name = file.name.replace(/\.[^.]+$/, '') || '我的图标'; const saved = await Assets.putCustomIcon(file, name);
      input.disabled = false; input.value = '';
      if (!saved) { setStatus(dialog, '保存失败，可能已达到 100 个上限。', 'error'); return; }
      library = await Assets.listCustomIcons(); selected = { kind: 'custom', value: saved.id }; renderPanels();
      const customTab = dialog.querySelector('[data-icon-picker-tab="custom"]'); customTab.click(); setStatus(dialog, '图标已加入个人库。', 'success');
    });
    dialog.addEventListener('keydown', (event) => trap(event, backdrop, dialog, previous));
    backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop) closeDialog(backdrop, previous); });
    const first = dialog.querySelector('[data-icon-picker-close]'); if (first) first.focus();
  }

  function escapeHtml(value) {
    const div = document.createElement('div'); div.textContent = String(value == null ? '' : value); return div.innerHTML;
  }

  function dispatchChanged() {
    window.dispatchEvent(new CustomEvent('pastoral:icons-changed'));
  }

  function init() {
    if (initialized) return readyPromise;
    initialized = true; readyPromise = loadBindings().then(() => decorate(document));
    document.addEventListener('contextmenu', (event) => { const el = targetFromEvent(event); if (!el) return; event.preventDefault(); open(el); });
    document.addEventListener('keydown', (event) => { const el = targetFromEvent(event); if (!el || !(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return; event.preventDefault(); open(el); });
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    ['pointerup', 'pointercancel', 'pointerleave', 'scroll'].forEach((name) => document.addEventListener(name, cancelPress, true));
    document.addEventListener('click', (event) => { if (Date.now() < suppressClickUntil && targetFromEvent(event)) { event.preventDefault(); event.stopPropagation(); } }, true);
    window.addEventListener('pastoral:icons-changed', () => refresh(document));
    return readyPromise;
  }

  return { LONG_PRESS_MS, MOVE_TOLERANCE, init, decorate, refresh, resolve, open };
})();
window.IconPicker = IconPicker;
