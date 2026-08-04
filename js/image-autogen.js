/* ============================================================
   暮归旅店 · 自动文生图模块（ImageAutoGen）
   从 AI 消息中提取 <image>...</image> 标签，在对应位置显示
   "生成图片"按钮，玩家点击后触发生成，图片缓存至 IndexedDB。
   ============================================================ */
const ImageAutoGen = (function () {
  'use strict';

  var STORE_NAME     = 'ImageCache';
  var EVENT_REQUEST  = 'generate-image-request';
  var EVENT_RESPONSE = 'generate-image-response';
  var TIMEOUT_MS     = 90000;
  var MAX_CACHE      = 200;

  /* slotId → { prompt, messageId, status, requestId, error } */
  var pending  = new Map();
  /* slotId → base64Data */
  var memCache = new Map();
  /* slotId → prompt（注册表，用于按钮点击时取 prompt） */
  var promptRegistry = new Map();
  var counter  = 0;

  /* ---------- FNV-1a 哈希（稳定 slotId） ---------- */
  function fnv32(text) {
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  /* ---------- 环境检测 ---------- */
  function hasEventApi() {
    return typeof eventOn === 'function'
        && typeof eventEmit === 'function'
        && typeof eventRemoveListener === 'function';
  }

  /* ---------- 父窗口 DOM 操作（楼层伪装） ---------- */
  function parentDoc() {
    try {
      if (window.parent === window) return null;
      var d = window.parent.document;
      return d && d.body ? d : null;
    } catch (e) { return null; }
  }

  /**
   * 在父窗口 DOM 中找到指定 message_id 对应的 .mes[mesid] .mes_text 元素。
   * Pastoral 的 Host CSS 隐藏了非 0 楼，但 DOM 元素仍然存在。
   */
  function findParentMesText(messageId) {
    var d = parentDoc();
    if (!d) return null;
    var mes = d.querySelector('div.mes[mesid="' + messageId + '"]');
    if (!mes) return null;
    return mes.querySelector('.mes_text') || null;
  }

  /**
   * 触发 st-chatu8 的 LLM 图片生成流程：
   * 1. 临时取消隐藏目标楼层（st-chatu8 的 getElContext 需要元素可见）
   * 2. 在目标 .mes_text 上触发 dblclick 事件（st-chatu8 的 clickTrigger 绑定）
   * 3. 恢复隐藏
   *
   * 这样 st-chatu8 会弹出操作面板（图片生成/角色设计等），
   * 且操作的是正确的楼层而非 0 楼。
   */
  function triggerFloorLLMImageGen(messageId) {
    var d = parentDoc();
    if (!d) { toast('warn', '无法触发', '未检测到父窗口，请在酒馆环境中使用。'); return; }

    var mesEl = d.querySelector('div.mes[mesid="' + messageId + '"]');
    if (!mesEl) { toast('warn', '楼层未找到', '父窗口中未找到第 ' + messageId + ' 楼。'); return; }

    var mesText = mesEl.querySelector('.mes_text');
    if (!mesText) { toast('warn', '内容未找到', '第 ' + messageId + ' 楼缺少 .mes_text 元素。'); return; }

    // 临时取消隐藏，让 st-chatu8 能正确读取元素
    var parentWin = d.defaultView || window.parent;
    var computedDisplay = 'none';
    try { computedDisplay = parentWin.getComputedStyle(mesEl).display; } catch (e) { /* cross-origin fallback */ }
    var wasHidden = mesEl.style.display === 'none' || computedDisplay === 'none';
    if (wasHidden) {
      mesEl.style.setProperty('display', 'block', 'important');
      mesEl.style.setProperty('position', 'fixed', 'important');
      mesEl.style.setProperty('left', '-9999px', 'important');
      mesEl.style.setProperty('top', '-9999px', 'important');
      mesEl.style.setProperty('opacity', '0', 'important');
      mesEl.style.setProperty('pointer-events', 'none', 'important');
    }

    // 触发 dblclick 让 st-chatu8 的 clickTrigger 捕获
    try {
      var rect = mesText.getBoundingClientRect();
      var evt = new MouseEvent('dblclick', {
        bubbles: true, cancelable: true, view: d.defaultView,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      });
      mesText.dispatchEvent(evt);
      toast('info', 'LLM 生图', '已触发第 ' + messageId + ' 楼的图片生成面板。');
    } catch (e) {
      toast('error', '触发失败', String(e && e.message || e));
    }

    // 延迟恢复隐藏（给 st-chatu8 时间读取 DOM）
    if (wasHidden) {
      setTimeout(function () {
        mesEl.style.removeProperty('display');
        mesEl.style.removeProperty('position');
        mesEl.style.removeProperty('left');
        mesEl.style.removeProperty('top');
        mesEl.style.removeProperty('opacity');
        mesEl.style.removeProperty('pointer-events');
      }, 3000);
    }
  }

  /* ---------- IndexedDB 操作 ---------- */
  function getDB() {
    if (window.Assets && typeof Assets._db === 'function') return Assets._db();
    return Promise.resolve(null);
  }

  function loadFromDB(slotId) {
    return getDB().then(function (db) {
      if (!db || !db.objectStoreNames.contains(STORE_NAME)) return null;
      return new Promise(function (resolve) {
        try {
          var tx  = db.transaction(STORE_NAME, 'readonly');
          var req = tx.objectStore(STORE_NAME).get(slotId);
          req.onsuccess = function () { resolve(req.result ? req.result.data : null); };
          req.onerror   = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    }).catch(function () { return null; });
  }

  function saveToDB(slotId, base64Data, prompt) {
    return getDB().then(function (db) {
      if (!db || !db.objectStoreNames.contains(STORE_NAME)) return;
      try {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({
          slotId: slotId,
          data: base64Data,
          prompt: prompt,
          createdAt: Date.now()
        });
      } catch (e) { console.error('[Pastoral][ImageAutoGen]', e); }
    }).catch(function () {});
  }

  function pruneCache() {
    return getDB().then(function (db) {
      if (!db || !db.objectStoreNames.contains(STORE_NAME)) return;
      return new Promise(function (resolve) {
        try {
          var tx  = db.transaction(STORE_NAME, 'readonly');
          var req = tx.objectStore(STORE_NAME).getAll();
          req.onsuccess = function () { resolve(req.result || []); };
          req.onerror   = function () { resolve([]); };
        } catch (e) { resolve([]); }
      }).then(function (all) {
        if (!all || all.length <= MAX_CACHE) return;
        all.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
        var toRemove = all.slice(0, all.length - MAX_CACHE);
        return getDB().then(function (db2) {
          if (!db2) return;
          try {
            var tx2   = db2.transaction(STORE_NAME, 'readwrite');
            var store = tx2.objectStore(STORE_NAME);
            toRemove.forEach(function (item) { store.delete(item.slotId); });
          } catch (e) { /* ignore */ }
        });
      });
    }).catch(function () {});
  }

  /* ---------- 核心：提取 <image> 标签并替换为占位符 ---------- */
  function extractAndReplace(rawText, messageId) {
    var RE = /<image>([\s\S]*?)<\/image>/gi;
    var result = rawText;
    var blocks = [];
    var match;

    while ((match = RE.exec(rawText)) !== null) {
      var prompt = match[1].trim();
      if (!prompt) continue;
      var idx = blocks.length;
      var slotId = fnv32(String(messageId) + '#' + idx + '#' + prompt);
      blocks.push({ slotId: slotId, prompt: prompt, messageId: messageId, fullMatch: match[0] });
    }

    if (!blocks.length) return result;

    // 从后往前替换，避免偏移量错位
    for (var i = blocks.length - 1; i >= 0; i--) {
      var b = blocks[i];
      var placeholder = '<span data-imgslot="' + b.slotId + '" class="imgslot"></span>';
      var pos = result.lastIndexOf(b.fullMatch);
      if (pos >= 0) {
        result = result.slice(0, pos) + placeholder + result.slice(pos + b.fullMatch.length);
      }
    }

    // 注册 prompt + messageId（不自动触发，等用户点击）
    blocks.forEach(function (b) {
      promptRegistry.set(b.slotId, { prompt: b.prompt, messageId: b.messageId });
    });

    return result;
  }

  /* ---------- 工具：构建图片 src ---------- */
  function toDataUri(raw) {
    if (!raw) return '';
    if (raw.indexOf('data:') === 0) return raw;
    if (raw.indexOf('http') === 0 || raw.indexOf('blob:') === 0) return raw;
    if (raw.indexOf('/9j/') === 0) return 'data:image/jpeg;base64,' + raw;
    if (raw.indexOf('UklGR') === 0) return 'data:image/webp;base64,' + raw;
    if (raw.indexOf('R0lGO') === 0) return 'data:image/gif;base64,' + raw;
    return 'data:image/png;base64,' + raw;
  }

  /* ---------- DOM 注入 ---------- */
  function injectImage(slot, base64Data) {
    slot.innerHTML = '';
    var figure = document.createElement('figure');
    figure.className = 'imagegen-result';
    var img = document.createElement('img');
    img.src = toDataUri(base64Data);
    img.alt = '场景绘图';
    img.loading = 'lazy';
    img.addEventListener('click', function () {
      if (window.ImageGen) ImageGen.openLightbox(img.src);
    });
    figure.appendChild(img);
    slot.appendChild(figure);
  }

  function showButton(slot, slotId) {
    slot.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'imgslot-actions';

    // 主按钮：直接用 <image> 标签里的 prompt 生图
    var btn = document.createElement('button');
    btn.className = 'imgslot-btn';
    btn.type = 'button';
    btn.innerHTML = '<span class="ic" data-i="paintbrush"></span><span>生成图片</span>';
    if (window.Icon) Icon.render(btn);
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      requestGenerate(slotId);
    });
    wrap.appendChild(btn);

    // 副按钮：触发 st-chatu8 的 LLM 生图（需要父窗口有对应楼层）
    var reg = promptRegistry.get(slotId);
    // 从 registry 获取 messageId
    var messageId = reg && typeof reg === 'object' ? reg.messageId : null;
    // 如果 registry 里没有，从 slot 的 DOM 上下文找 bub[data-mid]
    if (messageId == null) {
      var bub = slot.closest && slot.closest('.bub');
      if (bub && bub.dataset.mid) messageId = Number(bub.dataset.mid);
    }
    if (messageId != null && parentDoc() && findParentMesText(messageId)) {
      var llmBtn = document.createElement('button');
      llmBtn.className = 'imgslot-btn imgslot-btn--llm';
      llmBtn.type = 'button';
      llmBtn.innerHTML = '<span class="ic" data-i="sparkles"></span><span>LLM生图</span>';
      if (window.Icon) Icon.render(llmBtn);
      var mid = messageId; // 闭包捕获
      llmBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        triggerFloorLLMImageGen(mid);
      });
      wrap.appendChild(llmBtn);
    }

    slot.appendChild(wrap);
  }

  function showLoading(slot) {
    slot.innerHTML = '';
    var el = document.createElement('div');
    el.className = 'imagegen-loading';
    el.innerHTML = '<span class="ic" data-i="paintbrush"></span><span>正在绘制场景……</span>';
    if (window.Icon) Icon.render(el);
    slot.appendChild(el);
  }

  function showError(slot, message, slotId) {
    slot.innerHTML = '';
    var el = document.createElement('div');
    el.className = 'imgslot-error';
    var msg = document.createElement('span');
    msg.textContent = '绘图失败：' + (message || '未知错误');
    el.appendChild(msg);
    var retry = document.createElement('button');
    retry.className = 'imgslot-retry';
    retry.type = 'button';
    retry.textContent = '重试';
    retry.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      requestGenerate(slotId);
    });
    el.appendChild(retry);
    slot.appendChild(el);
  }

  /** 每次 DOM 重绘后，根据状态填充所有占位符 */
  function reinjectAll() {
    var slots = document.querySelectorAll('[data-imgslot]');
    slots.forEach(function (slot) {
      var slotId = slot.dataset.imgslot;

      // 已有图片 → 跳过
      if (slot.querySelector('.imagegen-result')) return;

      // 内存缓存命中 → 注入图片
      if (memCache.has(slotId)) {
        injectImage(slot, memCache.get(slotId));
        return;
      }

      // 正在生成 → 显示 loading
      var entry = pending.get(slotId);
      if (entry && entry.status === 'generating') {
        if (!slot.querySelector('.imagegen-loading')) showLoading(slot);
        return;
      }

      // 生成失败 → 显示错误+重试
      if (entry && entry.status === 'error') {
        if (!slot.querySelector('.imgslot-error')) showError(slot, entry.error, slotId);
        return;
      }

      // 默认：显示"生成图片"按钮（仅酒馆环境）
      if (promptRegistry.has(slotId) && hasEventApi()) {
        if (!slot.querySelector('.imgslot-btn') && !slot.querySelector('.imgslot-actions')) showButton(slot, slotId);
        return;
      }
    });
  }

  /* ---------- 用户点击按钮触发生成 ---------- */
  function requestGenerate(slotId) {
    if (!hasEventApi()) { toast('error', '无法绘图', '未检测到酒馆事件系统。'); return; }
    var reg = promptRegistry.get(slotId);
    var prompt = reg && (typeof reg === 'string' ? reg : reg.prompt);
    if (!prompt) { toast('warn', '无可用内容', '未找到该位置的绘图关键词。'); return; }

    // 先检查 IndexedDB 缓存
    loadFromDB(slotId).then(function (cached) {
      if (cached) {
        memCache.set(slotId, cached);
        reinjectAll();
        return;
      }
      // 未缓存 → 发起生成
      pending.set(slotId, {
        prompt: prompt,
        messageId: null,
        status: 'generating',
        requestId: null,
        error: null
      });
      reinjectAll();
      fireRequest(slotId, pending.get(slotId));
    });
  }

  /* ---------- 单个生成请求 ---------- */
  function fireRequest(slotId, entry) {
    var requestId = 'pastoral-auto-' + Date.now() + '-' + (++counter);
    entry.requestId = requestId;

    var timer = setTimeout(function () {
      if (entry.status !== 'generating') return;
      eventRemoveListener(EVENT_RESPONSE, handler);
      entry.status = 'error';
      entry.error = '生成超时（90s）';
      reinjectAll();
    }, TIMEOUT_MS);

    var handler = function (resp) {
      if (!resp || resp.id !== requestId) return;
      eventRemoveListener(EVENT_RESPONSE, handler);
      clearTimeout(timer);

      if (resp.success && resp.imageData) {
        memCache.set(slotId, resp.imageData);
        saveToDB(slotId, resp.imageData, entry.prompt);
        pending.delete(slotId);
        toast('success', '场景绘制完成', '图片已嵌入对话，点击可放大。');
      } else {
        entry.status = 'error';
        entry.error = resp.error || '生成失败';
        toast('error', '绘图失败', entry.error);
      }
      reinjectAll();
    };

    eventOn(EVENT_RESPONSE, handler);
    eventEmit(EVENT_REQUEST, { id: requestId, prompt: entry.prompt, width: null, height: null });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    window.addEventListener('pastoral:chat', reinjectAll);
    pruneCache();
  }

  return {
    extractAndReplace: extractAndReplace,
    init: init,
    triggerFloorLLMImageGen: triggerFloorLLMImageGen,
    get pending() { return pending.size; }
  };
})();
window.ImageAutoGen = ImageAutoGen;
