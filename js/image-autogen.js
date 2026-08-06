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
   * 触发 st-chatu8 的操作面板（图片生成/角色设计等）：
   * 1. 临时取消隐藏目标楼层
   * 2. 桌面端 → dblclick；移动端 → 模拟三连击 touchstart/touchend
   * 3. 等待面板弹出后恢复隐藏（面板由用户自行操作）
   */
  function triggerFloorLLMImageGen(messageId) {
    var d = parentDoc();
    if (!d) { toast('warn', '无法触发', '未检测到父窗口，请在酒馆环境中使用。'); return; }

    var mesEl = d.querySelector('div.mes[mesid="' + messageId + '"]');
    if (!mesEl) { toast('warn', '楼层未找到', '父窗口中未找到第 ' + messageId + ' 楼。'); return; }

    var mesText = mesEl.querySelector('.mes_text');
    if (!mesText) { toast('warn', '内容未找到', '第 ' + messageId + ' 楼缺少 .mes_text 元素。'); return; }

    var parentWin = d.defaultView || window.parent;

    // 判断是否被 Host CSS 隐藏
    var computedDisplay = 'none';
    try { computedDisplay = parentWin.getComputedStyle(mesEl).display; } catch (e) { /* cross-origin */ }
    var wasHidden = mesEl.style.display === 'none' || computedDisplay === 'none';

    // 临时取消隐藏 — 放在视口中央，让 getBoundingClientRect 返回有效坐标
    if (wasHidden) {
      mesEl.style.setProperty('display', 'block', 'important');
      mesEl.style.setProperty('position', 'fixed', 'important');
      mesEl.style.setProperty('left', '50%', 'important');
      mesEl.style.setProperty('top', '50%', 'important');
      mesEl.style.setProperty('transform', 'translate(-50%,-50%)', 'important');
      mesEl.style.setProperty('opacity', '0', 'important');
      mesEl.style.setProperty('pointer-events', 'none', 'important');
      mesEl.style.setProperty('z-index', '-1', 'important');
      mesEl.style.setProperty('max-height', '1px', 'important');
      mesEl.style.setProperty('overflow', 'hidden', 'important');
    }

    // 恢复隐藏的辅助函数
    function restoreHidden() {
      if (!wasHidden) return;
      ['display','position','left','top','transform','opacity','pointer-events','z-index','max-height','overflow'].forEach(function (p) {
        mesEl.style.removeProperty(p);
      });
    }

    // 计算坐标
    var rect = mesText.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    if (!cx || !cy || cx < 0 || cy < 0) {
      cx = (parentWin.innerWidth || 800) / 2;
      cy = (parentWin.innerHeight || 600) / 2;
    }

    // 检测移动端
    var isMobile = ('ontouchstart' in parentWin) || (parentWin.navigator && parentWin.navigator.maxTouchPoints > 0);

    try {
      if (isMobile) {
        // 移动端：模拟三连击 touchstart → touchend × 3
        // st-chatu8 要求 timeSinceLastTap > 0 且 < 350ms，所以需要间隔发送
        var fireTap = function (n) {
          var touchObj = new Touch({
            identifier: Date.now(),
            target: mesText,
            clientX: cx, clientY: cy,
            pageX: cx, pageY: cy
          });
          mesText.dispatchEvent(new TouchEvent('touchstart', {
            bubbles: true, cancelable: true, view: parentWin,
            touches: [touchObj], targetTouches: [touchObj], changedTouches: [touchObj]
          }));
          mesText.dispatchEvent(new TouchEvent('touchend', {
            bubbles: true, cancelable: true, view: parentWin,
            touches: [], targetTouches: [], changedTouches: [touchObj]
          }));
          if (n < 3) {
            setTimeout(function () { fireTap(n + 1); }, 50);
          }
        };
        fireTap(1);
      } else {
        // 桌面端：dblclick
        mesText.dispatchEvent(new MouseEvent('dblclick', {
          bubbles: true, cancelable: true, view: parentWin,
          clientX: cx, clientY: cy
        }));
      }
    } catch (e) {
      toast('error', '触发失败', String(e && e.message || e));
      restoreHidden();
      return;
    }

    // 等待面板弹出后延迟恢复隐藏（不自动点击，让用户自行选择操作）
    var attempts = 0;
    var maxAttempts = 20;
    var pollTimer = setInterval(function () {
      attempts++;
      var bubble = d.querySelector('.st-chatu8-click-trigger-bubble');
      if (bubble) {
        clearInterval(pollTimer);
        // 沉浸模式下临时降低 iframe z-index，让父窗口面板可见
        var frame = null;
        try { frame = window.frameElement; } catch (e) { /* cross-origin */ }
        if (!frame) {
          try {
            var frames = d.querySelectorAll('iframe');
            for (var fi = 0; fi < frames.length; fi++) {
              if (frames[fi].contentWindow === window) { frame = frames[fi]; break; }
            }
          } catch (e) { /* ignore */ }
        }
        var hadZIndex = false;
        var origZIndex = '';
        if (frame && frame.classList.contains('pastoral-immersive')) {
          hadZIndex = true;
          origZIndex = frame.style.zIndex || '';
          frame.style.setProperty('z-index', '1', 'important');
        }
        toast('info', 'LLM 生图', '第 ' + messageId + ' 楼的操作面板已打开。');
        // 面板关闭后再恢复隐藏
        var closeAttempts = 0;
        var closeTimer = setInterval(function () {
          closeAttempts++;
          if (!d.querySelector('.st-chatu8-click-trigger-bubble')) {
            clearInterval(closeTimer);
            // 恢复 iframe z-index
            if (hadZIndex && frame) {
              if (origZIndex) frame.style.zIndex = origZIndex;
              else frame.style.removeProperty('z-index');
            }
            setTimeout(restoreHidden, 2000);
          }
          if (closeAttempts > 300) { // 30 秒超时
            clearInterval(closeTimer);
            if (hadZIndex && frame) {
              if (origZIndex) frame.style.zIndex = origZIndex;
              else frame.style.removeProperty('z-index');
            }
            restoreHidden();
          }
        }, 100);
        return;
      }
      if (attempts >= maxAttempts) {
        clearInterval(pollTimer);
        toast('warn', '面板未弹出', 'st-chatu8 操作面板未出现，请确认已启用点击触发功能。');
        restoreHidden();
      }
    }, 100);
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

    // 为每条 AI 气泡注入"LLM生图"按钮（仅酒馆环境 + 父窗口有对应楼层时）
    injectLLMButtons();
  }

  /** 在每条 AI 气泡底部注入 LLM 生图按钮 */
  function injectLLMButtons() {
    if (!hasEventApi() || !parentDoc()) return;
    var bubbles = document.querySelectorAll('.bub--ai');
    bubbles.forEach(function (bub) {
      var mid = Number(bub.dataset.mid);
      if (!mid || mid === 0) return; // 跳过 0 楼
      var body = bub.querySelector('.bub__body');
      if (!body) return;
      // 已经注入过 → 跳过
      if (body.querySelector('.llm-gen-btn')) return;
      // 父窗口有对应楼层才显示
      if (!findParentMesText(mid)) return;

      var btn = document.createElement('button');
      btn.className = 'imgslot-btn imgslot-btn--llm llm-gen-btn';
      btn.type = 'button';
      btn.innerHTML = '<span class="ic" data-i="sparkles"></span><span>LLM生图</span>';
      if (window.Icon) Icon.render(btn);
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        triggerFloorLLMImageGen(mid);
      });
      body.appendChild(btn);
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
