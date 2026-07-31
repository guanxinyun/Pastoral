/* ============================================================
   全局消息接管（Chat）
   - 0 楼宿主用 getChatMessages('0-' + lastMessageId) 抓取全局对话
   - Hash 机制（消息数_最后一楼字符数_生成状态）避免无效 DOM 重绘
   - 气泡右键菜单：编辑 / 复制 / 删除，直接操作对应 message_id
   - composer：/send + /trigger 接管原生输入框
   ============================================================ */
const Chat = (function () {
  'use strict';

  const POLL_MS = 400;
  const MAX_RAW = 60000; // 单楼原文超长（如 0 楼卡片源码）跳过渲染

  let lastHash = null;
  let timer = null;
  let generating = false;
  let busy = false;
  let composedKind = 'normal';
  let requestSeq = 0;
  let generationCycle = 0;
  let completedMessageId = null;
  const generationWaiters = [];
  let messages = [];

  /* ---------- 酒馆 API 探测 ---------- */
  function hasApi() {
    return typeof getChatMessages === 'function' && typeof getLastMessageId === 'function';
  }

  function lastId() {
    try {
      if (typeof getLastMessageId === 'function') return getLastMessageId();
    } catch (e) { /* ignore */ }
    return 0;
  }

  /* ---------- 生成状态 ---------- */
  function bindGenerationEvents() {
    if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined') return;
    try {
      eventOn(tavern_events.GENERATION_STARTED, () => { generating = true; });
      const finish = (messageId) => {
        generating = false;
        if (Number.isFinite(Number(messageId))) completedMessageId = Number(messageId);
        generationCycle++;
        generationWaiters.splice(0).forEach((resolve) => resolve(generationCycle));
      };
      eventOn(tavern_events.GENERATION_ENDED, finish);
      eventOn(tavern_events.GENERATION_STOPPED, () => finish(null));
    } catch (e) { /* ignore */ }
  }

  /* ---------- 抓取全局对话 ---------- */
  function fetchAll() {
    if (!hasApi()) return [];
    try {
      const arr = getChatMessages('0-' + lastId());
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  /** Hash：消息数_最后一楼字符数_生成状态 */
  function hashOf(list) {
    const n = list.length;
    const tail = n ? (list[n - 1].message || '').length : 0;
    return n + '_' + tail + '_' + (generating ? 1 : 0);
  }

  /* ---------- 渲染 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 单条消息 -> 气泡 DOM */
  function bubble(msg) {
    const role = msg.role === 'user' ? 'user' : (msg.role === 'system' ? 'system' : 'ai');
    const el = document.createElement('article');
    el.className = 'bub bub--' + role;
    el.dataset.mid = String(msg.message_id);
    if (msg.is_hidden) el.classList.add('is-hidden-msg');

    const body = document.createElement('div');
    body.className = 'bub__body';
    const raw = msg.message || '';

    if (role === 'ai') {
      if (raw.length > MAX_RAW) {
        body.innerHTML = '<p class="muted">（本楼内容为界面源码，已折叠）</p>';
      } else {
        const html = Extract.extractCleanContent(raw);
        body.innerHTML = (html && html.trim())
          ? html
          : '<p class="muted">（本楼无可显示正文）</p>';
      }
    } else {
      body.innerHTML = '<p>' + esc(raw).replace(/\n/g, '<br>') + '</p>';
    }

    const meta = document.createElement('div');
    meta.className = 'bub__meta';
    meta.innerHTML = '<span class="bub__who">' + esc(msg.name || (role === 'user' ? '我' : '旅店')) +
      '</span><span class="bub__id">#' + msg.message_id + '</span>';

    el.appendChild(meta);
    el.appendChild(body);
    return el;
  }

  function nearBottom(box) {
    return box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  }

  function renderStream(list) {
    const box = document.getElementById('stream');
    if (!box) return;
    const stick = nearBottom(box);
    box.innerHTML = '';
    list.forEach((m) => box.appendChild(bubble(m)));
    if (generating) {
      const t = document.createElement('div');
      t.className = 'bub bub--ai bub--typing';
      t.innerHTML = '<div class="bub__body"><span class="typing"><i></i><i></i><i></i></span></div>';
      box.appendChild(t);
    }
    if (stick) box.scrollTop = box.scrollHeight;
  }

  /* ---------- 右键菜单：编辑 / 复制 / 删除 ---------- */
  function closeMenu() {
    const m = document.getElementById('bubMenu');
    if (m) m.remove();
  }

  function openMenu(x, y, mid) {
    closeMenu();
    const isHostFloor = mid === 0;
    const menu = document.createElement('div');
    menu.className = 'bub-menu';
    menu.id = 'bubMenu';
    menu.setAttribute('role', 'menu');

    const item = (icon, label, fn, danger) => {
      const b = document.createElement('button');
      b.className = 'bub-menu__item' + (danger ? ' is-danger' : '');
      b.setAttribute('role', 'menuitem');
      b.innerHTML = '<span class="ic" data-i="' + icon + '"></span><span>' + label + '</span>';
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); });
      return b;
    };

    menu.appendChild(item('copy', '复制原文', () => { copyMsg(mid); closeMenu(); }));

    if (!isHostFloor) {
      menu.appendChild(item('pencil', '编辑本楼', () => { closeMenu(); editMsg(mid); }));
      // 删除：两步确认（不可逆操作）
      const del = item('trash', '删除本楼', (btn) => {
        if (btn.dataset.armed === '1') { closeMenu(); deleteMsg(mid); return; }
        btn.dataset.armed = '1';
        btn.innerHTML = '<span class="ic" data-i="trash"></span><span>确认删除 #' + mid + '？</span>';
        Icon.render(btn);
      }, true);
      menu.appendChild(del);
    } else {
      const note = document.createElement('div');
      note.className = 'bub-menu__note';
      note.textContent = '0 楼为界面宿主，不可编辑/删除';
      menu.appendChild(note);
    }

    document.body.appendChild(menu);
    Icon.render(menu);

    // 视口内定位
    const r = menu.getBoundingClientRect();
    const px = Math.min(x, window.innerWidth - r.width - 8);
    const py = Math.min(y, window.innerHeight - r.height - 8);
    menu.style.left = Math.max(8, px) + 'px';
    menu.style.top = Math.max(8, py) + 'px';

    setTimeout(() => {
      const off = (e) => {
        if (!menu.contains(e.target)) { closeMenu(); document.removeEventListener('mousedown', off); }
      };
      document.addEventListener('mousedown', off);
    }, 0);
  }

  function msgById(mid) {
    return messages.find((m) => m.message_id === mid);
  }

  function copyMsg(mid) {
    const m = msgById(mid);
    if (!m) return;
    const text = m.message || '';
    const done = () => toast('success', '已复制', '第 ' + mid + ' 楼原文已进剪贴板。');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
      } else fallbackCopy(text, done);
    } catch (e) { fallbackCopy(text, done); }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('warn', '复制失败', '请手动选择文本。'); }
    ta.remove();
  }

  /** 原地编辑：气泡换成 textarea，保存写回对应 message_id */
  function editMsg(mid) {
    const m = msgById(mid);
    if (!m) return;
    const el = document.querySelector('.bub[data-mid="' + mid + '"]');
    if (!el) return;

    el.classList.add('is-editing');
    const body = el.querySelector('.bub__body');
    if (!body) return;

    const ta = document.createElement('textarea');
    ta.className = 'bub-edit';
    ta.value = m.message || '';
    ta.rows = Math.min(18, Math.max(4, (m.message || '').split('\n').length + 1));

    const bar = document.createElement('div');
    bar.className = 'bub-edit__bar';
    const save = document.createElement('button');
    save.className = 'btn btn--sm';
    save.textContent = '保存';
    const cancel = document.createElement('button');
    cancel.className = 'btn btn--ghost btn--sm';
    cancel.textContent = '取消';
    bar.appendChild(save);
    bar.appendChild(cancel);

    body.innerHTML = '';
    body.appendChild(ta);
    body.appendChild(bar);
    ta.focus();

    const restore = () => { el.classList.remove('is-editing'); lastHash = null; poll(); };
    cancel.addEventListener('click', restore);
    save.addEventListener('click', async () => {
      const val = ta.value;
      save.disabled = true;
      try {
        if (typeof setChatMessages === 'function') {
          await setChatMessages([{ message_id: mid, message: val }], { refresh: 'none' });
          toast('success', '已保存', '第 ' + mid + ' 楼已更新。');
        } else {
          toast('warn', '未连接酒馆', '独立预览无法写回。');
        }
      } catch (e) {
        toast('error', '保存失败', String(e && e.message || e));
      }
      restore();
    });
  }

  async function deleteMsg(mid) {
    try {
      if (typeof deleteChatMessages === 'function') {
        await deleteChatMessages([mid]);
        toast('success', '已删除', '第 ' + mid + ' 楼已移除。');
      } else {
        toast('warn', '未连接酒馆', '独立预览无法删除。');
      }
    } catch (e) {
      toast('error', '删除失败', String(e && e.message || e));
    }
    lastHash = null;
    poll();
  }

  /* ---------- composer：接管原生输入 ---------- */

  /** 转义 slash 命令里的管道与花括号 */
  function escSlash(s) {
    return String(s).replace(/\|/g, '\\|').replace(/\{\{/g, '\\{\\{');
  }

  /** 执行 slash 命令（酒馆原生 triggerSlash 优先） */
  function exec(cmd) {
    try {
      if (typeof triggerSlash === 'function') return triggerSlash(cmd);
      if (typeof executeSlashCommandsWithOptions === 'function') return executeSlashCommandsWithOptions(cmd);
      if (typeof executeSlashCommands === 'function') return executeSlashCommands(cmd);
    } catch (e) { /* ignore */ }
    return null;
  }

  /** 把文本填入卡内 composer（不发送），可附带归寝等请求类型。 */
  function compose(text, kind) {
    const ta = document.getElementById('composerInput');
    if (!ta) return false;
    const current = String(ta.value || '').trimEnd();
    const addition = String(text || '').trim();
    ta.value = current && addition ? current + '\n' + addition : (addition || current);
    composedKind = kind || composedKind || 'normal';
    ta.focus();
    autoGrow(ta);
    return true;
  }

  function setRequestStatus(title, message, loading) {
    const status = document.getElementById('requestStatus');
    if (!status) return;
    status.hidden = false;
    status.classList.toggle('is-loading', !!loading);
    status.classList.toggle('is-error', title.includes('失败'));
    const titleNode = status.querySelector('[data-request-status-title]');
    const messageNode = status.querySelector('[data-request-status-message]');
    if (titleNode) titleNode.textContent = title;
    if (messageNode) messageNode.textContent = message || '';
  }

  function setBusy(on) {
    busy = !!on;
    const ta = document.getElementById('composerInput');
    const btn = document.getElementById('composerSend');
    if (ta) ta.disabled = busy;
    if (btn) { btn.disabled = busy; btn.setAttribute('aria-busy', busy ? 'true' : 'false'); }
  }

  function waitForGenerationEnd(startCycle, timeout) {
    if (generationCycle > startCycle) return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); resolve(true); };
      const timer = setTimeout(() => {
        const index = generationWaiters.indexOf(done);
        if (index >= 0) generationWaiters.splice(index, 1);
        resolve(false);
      }, timeout || 120000);
      generationWaiters.push(done);
    });
  }

  async function waitForMainReply(beforeId, token, startCycle, generationAlreadyAwaited) {
    const ended = generationAlreadyAwaited ? true : await waitForGenerationEnd(startCycle, 120000);
    const started = Date.now();
    while (token === requestSeq && Date.now() - started < 5000) {
      const id = completedMessageId != null ? completedMessageId : lastId();
      if (id > beforeId) {
        const latest = (typeof getChatMessages === 'function' ? getChatMessages(id) : [])[0];
        if (latest && latest.role !== 'user') return id;
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    throw new Error(ended ? '主模型生成完成，但未找到新的 AI 楼层' : '等待主模型生成结束超时');
  }

  /** 唯一发送入口：主剧情完成后按模式执行变量后处理。 */
  async function handleUnifiedRequest(text, options) {
    const body = String(text || '').trim();
    if (!body || busy) return false;
    if (!hasApi()) {
      toast('warn', '未连接酒馆', body);
      return false;
    }
    const purpose = options && options.kind || composedKind || 'normal';
    composedKind = 'normal';
    const token = ++requestSeq;
    const beforeId = lastId();
    const startCycle = generationCycle;
    completedMessageId = null;
    const baseline = window.MVU && MVU.getDataSnapshot ? MVU.getDataSnapshot() : null;
    const mode = window.Settings ? Settings.load().apiMode : 'single';
    setBusy(true);
    generating = true;
    lastHash = null;
    console.info('[Pastoral][MainAPI]', '开始', { beforeId, purpose });
    try {
      setRequestStatus('发送主剧情', '正在添加玩家行动…', false);
      const sent = await exec('/send ' + escSlash(body));
      if (sent === undefined && typeof triggerSlash !== 'function') throw new Error('酒馆发送接口不可用');
      poll();
      setRequestStatus('等待主模型', '主模型正在生成回复…', true);
      if (typeof triggerSlash !== 'function') throw new Error('当前酒馆不支持可等待的 triggerSlash');
      await exec('/trigger await=true');
      const messageId = await waitForMainReply(beforeId, token, startCycle, true);
      console.info('[Pastoral][MainAPI]', '完成', { messageId, purpose });
      let calculated = null, settledData = null;
      if (purpose === 'endday' && mode === 'multi' && window.ApiEngine) {
        await ApiEngine.processAfterMain({ baseline, messageId, purpose: 'normal', calculated: null });
      }
      if (window.MVU) {
        if (purpose === 'endday' && typeof MVU.settleAndWrite === 'function') {
          setRequestStatus('执行确定性结算', '正在扣除薪资与维护费、推进作物并重算引力…', true);
          const settled = await MVU.settleAndWrite(messageId, 'endday-message-' + messageId);
          settledData = settled.data;
          calculated = Object.assign({}, settled.report, { facilityGravity: settled.calculated && settled.calculated.dimensions });
          window.dispatchEvent(new CustomEvent('pastoral:request-stage', { detail: { stage: 'settled', calculated } }));
          window.dispatchEvent(new CustomEvent('pastoral:daily-summary', { detail: Object.assign({ summary: '确定性结算已完成，正在等待跨日变量更新…', source: 'script', pending: true }, calculated) }));
        } else if (typeof MVU.syncFacilityGravity === 'function') {
          const synced = await MVU.syncFacilityGravity(messageId);
          calculated = { facilityGravity: synced.calculated.dimensions, totalGravity: synced.calculated.total };
        }
      }
      if (window.ApiEngine) {
        let outcome = null;
        if (purpose === 'endday') {
          setRequestStatus('归寝日结', '正在执行跨日变量更新…', true);
          outcome = await ApiEngine.processEndday({ baseline: window.MVU ? MVU.getDataSnapshot() : baseline, messageId, purpose, calculated });
        } else if (mode === 'multi') {
          setRequestStatus('第二 API', '正在计算本轮变量更新…', true);
          outcome = await ApiEngine.processAfterMain({ baseline, messageId, purpose, calculated });
        }
        if (purpose === 'endday' && settledData) {
          if (window.MVU && typeof MVU.enforceAndWrite === 'function') await MVU.enforceAndWrite(settledData, messageId);
          window.dispatchEvent(new CustomEvent('pastoral:daily-summary', { detail: Object.assign({ summary: outcome && outcome.summary, source: outcome && outcome.source, updateOk: !!(outcome && outcome.ok), updateError: outcome && outcome.error ? String(outcome.error.message || outcome.error) : '' }, calculated || {}) }));
          setRequestStatus(outcome && outcome.ok ? '归寝完成' : '归寝结算完成，变量更新失败', outcome && outcome.ok ? '账簿已更新。' : '确定性结算已保留，请检查第二 API 或主 API。', false);
        }
      }
      const composer = document.getElementById('composerInput');
      if (composer && String(composer.value || '').trim() === body) { composer.value = ''; autoGrow(composer); }
      return true;
    } catch (e) {
      console.error('[Pastoral][MainAPI]', '发送失败', e);
      toast('error', '发送失败', String(e && e.message || e));
      return false;
    } finally {
      generating = false;
      lastHash = null;
      setBusy(false);
      poll();
    }
  }

  const send = handleUnifiedRequest;

  function autoGrow(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
  }

  /* ---------- 轮询 ---------- */
  function poll() {
    if (!hasApi()) {
      // 独立预览：用样例原文渲染单条气泡
      if (lastHash === 'sample') return;
      lastHash = 'sample';
      messages = [{ message_id: 0, role: 'assistant', name: '暮归旅店', message: window.SAMPLE_RAWTEXT || '' }];
      renderStream(messages);
      window.dispatchEvent(new CustomEvent('pastoral:chat', { detail: { messages } }));
      return;
    }
    const list = fetchAll();
    const h = hashOf(list);
    if (h === lastHash) return;
    lastHash = h;
    messages = list;
    renderStream(list);
    window.dispatchEvent(new CustomEvent('pastoral:chat', { detail: { messages: list } }));
  }

  /** 最新一楼原文（供选项提取） */
  function latestRaw() {
    if (!messages.length) return window.SAMPLE_RAWTEXT || '';
    return messages[messages.length - 1].message || '';
  }

  function init() {
    bindGenerationEvents();

    const box = document.getElementById('stream');
    if (box) {
      box.addEventListener('contextmenu', (e) => {
        const b = e.target.closest ? e.target.closest('.bub') : null;
        if (!b || b.classList.contains('is-editing')) return;
        e.preventDefault();
        openMenu(e.clientX, e.clientY, Number(b.dataset.mid));
      });
    }

    const ta = document.getElementById('composerInput');
    const btn = document.getElementById('composerSend');
    if (ta) {
      ta.addEventListener('input', () => autoGrow(ta));
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const v = ta.value;
          handleUnifiedRequest(v);
        }
      });
    }
    if (btn && ta) {
      btn.addEventListener('click', () => {
        const v = ta.value;
        send(v);
      });
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

    poll();
    if (!timer) timer = setInterval(poll, POLL_MS);
  }

  return { init, poll, send, handleUnifiedRequest, compose, latestRaw, get messages() { return messages; }, get generating() { return generating; }, get busy() { return busy; } };
})();
window.Chat = Chat;
