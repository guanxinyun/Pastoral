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

    // 注册 prompt（不自动触发，等用户点击）
    blocks.forEach(function (b) {
      promptRegistry.set(b.slotId, b.prompt);
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
    slot.appendChild(btn);
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
        if (!slot.querySelector('.imgslot-btn')) showButton(slot, slotId);
        return;
      }
    });
  }

  /* ---------- 用户点击按钮触发生成 ---------- */
  function requestGenerate(slotId) {
    if (!hasEventApi()) { toast('error', '无法绘图', '未检测到酒馆事件系统。'); return; }
    var prompt = promptRegistry.get(slotId);
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
    get pending() { return pending.size; }
  };
})();
window.ImageAutoGen = ImageAutoGen;
