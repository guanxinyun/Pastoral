/* ============================================================
   暮归旅店 · 文生图模块（ImageGen）
   通过酒馆"前端助手"扩展的事件系统调用图像生成 API。
   玩家手动触发 → 提取最新 AI 叙事 → 生成图片 → 嵌入气泡 + 灯箱
   ============================================================ */
const ImageGen = (function () {
  'use strict';

  const EVENT_REQUEST  = 'generate-image-request';
  const EVENT_RESPONSE = 'generate-image-response';
  const MAX_PROMPT_LEN = 500;
  const TIMEOUT_MS     = 60000;

  let busy = false;
  let requestCounter = 0;
  const imageCache = new Map(); // message_id → { data, prompt }

  /* ---------- 环境检测 ---------- */
  function hasEventApi() {
    return typeof eventOn === 'function'
        && typeof eventEmit === 'function'
        && typeof eventRemoveListener === 'function';
  }

  /* ---------- Prompt 提取 ---------- */
  function htmlToText(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return (temp.textContent || temp.innerText || '').trim();
  }

  function extractPrompt() {
    const messages = Chat.messages;
    if (!messages || !messages.length) return { text: '', messageId: null };
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'user' || Number(msg.message_id) === 0) continue;
      const raw = msg.message || '';
      if (!raw.trim()) continue;
      const html = Extract.extractCleanContent(raw);
      let text = htmlToText(html);
      if (!text) continue;
      if (text.length > MAX_PROMPT_LEN) text = text.slice(0, MAX_PROMPT_LEN);
      return { text, messageId: msg.message_id };
    }
    return { text: '', messageId: null };
  }

  /* ---------- DOM 操作 ---------- */
  function findBubbleBody(messageId) {
    if (messageId == null) return null;
    const bub = document.querySelector('.bub[data-mid="' + messageId + '"]');
    return bub ? bub.querySelector('.bub__body') : null;
  }

  function showLoading(body) {
    removeLoading(body);
    const el = document.createElement('div');
    el.className = 'imagegen-loading';
    el.setAttribute('data-imagegen-loading', '');
    el.innerHTML = '<span class="ic" data-i="paintbrush"></span><span>正在绘制场景……</span>';
    if (window.Icon) Icon.render(el);
    body.appendChild(el);
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function removeLoading(body) {
    if (!body) return;
    const el = body.querySelector('[data-imagegen-loading]');
    if (el) el.remove();
  }

  function doInjectImage(body, base64Data, prompt) {
    if (body.querySelector('.imagegen-result')) return;
    const figure = document.createElement('figure');
    figure.className = 'imagegen-result';
    const img = document.createElement('img');
    img.src = 'data:image/png;base64,' + base64Data;
    img.alt = '场景绘图';
    img.loading = 'lazy';
    img.addEventListener('click', function () { openLightbox(img.src); });
    figure.appendChild(img);
    if (prompt) {
      const caption = document.createElement('figcaption');
      const display = prompt.length > 60 ? prompt.slice(0, 60) + '…' : prompt;
      caption.textContent = display;
      figure.appendChild(caption);
    }
    body.appendChild(figure);
    figure.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function injectImage(body, base64Data, prompt, messageId) {
    removeLoading(body);
    imageCache.set(messageId, { data: base64Data, prompt: prompt });
    doInjectImage(body, base64Data, prompt);
  }

  /** Chat 轮询重绘后，从缓存重新注入图片 */
  function reinjectCachedImages() {
    imageCache.forEach(function (entry, mid) {
      const bub = document.querySelector('.bub[data-mid="' + mid + '"]');
      if (!bub) { imageCache.delete(mid); return; }
      const body = bub.querySelector('.bub__body');
      if (!body) return;
      doInjectImage(body, entry.data, entry.prompt);
    });
  }

  /* ---------- 灯箱 ---------- */
  function openLightbox(src) {
    const box = document.getElementById('imageLightbox');
    const img = document.getElementById('lightboxImg');
    if (!box || !img) return;
    img.src = src;
    box.hidden = false;
  }

  function closeLightbox() {
    const box = document.getElementById('imageLightbox');
    if (box) box.hidden = true;
    const img = document.getElementById('lightboxImg');
    if (img) img.src = '';
  }

  /* ---------- 按钮状态 ---------- */
  function setButtonLoading(on) {
    const btn = document.getElementById('imagegenBtn');
    if (!btn) return;
    btn.classList.toggle('is-loading', !!on);
    btn.disabled = !!on;
  }

  /* ---------- 核心：发起图像生成请求 ---------- */
  function generate() {
    if (busy) { toast('warn', '绘图进行中', '请等待当前绘图完成。'); return; }
    if (!hasEventApi()) { toast('error', '无法绘图', '未检测到酒馆事件系统，请确认已安装前端助手扩展。'); return; }
    if (Chat.generating || Chat.busy) { toast('warn', '请稍候', '主模型正在生成中，请等待完成后再绘图。'); return; }

    var extracted = extractPrompt();
    var prompt = extracted.text;
    var messageId = extracted.messageId;
    if (!prompt) { toast('warn', '无可用内容', '未找到可用的 AI 叙事内容来生成图片。'); return; }

    var body = findBubbleBody(messageId);
    if (!body) { toast('warn', '无可用气泡', '未找到可注入图片的消息气泡。'); return; }

    var requestId = 'pastoral-img-' + Date.now() + '-' + (++requestCounter);
    busy = true;
    setButtonLoading(true);
    showLoading(body);
    toast('info', '开始绘图', '正在根据最新叙事生成场景图……');

    var timeoutTimer = setTimeout(function () {
      if (!busy) return;
      eventRemoveListener(EVENT_RESPONSE, handler);
      busy = false;
      setButtonLoading(false);
      removeLoading(findBubbleBody(messageId));
      toast('error', '绘图超时', '图像生成请求超过 60 秒未响应，请检查前端助手扩展是否正常运行。');
    }, TIMEOUT_MS);

    var handler = function (responseData) {
      if (!responseData || responseData.id !== requestId) return;
      eventRemoveListener(EVENT_RESPONSE, handler);
      clearTimeout(timeoutTimer);
      busy = false;
      setButtonLoading(false);
      var currentBody = findBubbleBody(messageId);
      if (responseData.success && responseData.imageData) {
        if (currentBody) injectImage(currentBody, responseData.imageData, prompt, messageId);
        else imageCache.set(messageId, { data: responseData.imageData, prompt: prompt });
        toast('success', '绘图完成', '场景图已嵌入对话中，点击可放大查看。');
      } else {
        if (currentBody) removeLoading(currentBody);
        toast('error', '绘图失败', responseData.error || '图像生成失败，未返回图片数据。');
      }
    };

    eventOn(EVENT_RESPONSE, handler);
    eventEmit(EVENT_REQUEST, { id: requestId, prompt: prompt, width: null, height: null });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    var btn = document.getElementById('imagegenBtn');
    if (!btn) return;

    // 仅酒馆环境且事件 API 可用时显示按钮
    if (hasEventApi()) btn.hidden = false;
    else { btn.hidden = true; return; }

    // 灯箱事件
    var lightbox = document.getElementById('imageLightbox');
    if (lightbox) lightbox.addEventListener('click', function (e) { if (e.target === lightbox) closeLightbox(); });
    var closeBtn = document.getElementById('lightboxClose');
    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', function (e) {
      var box = document.getElementById('imageLightbox');
      if (e.key === 'Escape' && box && !box.hidden) closeLightbox();
    });

    // Chat 重绘后重新注入缓存图片
    window.addEventListener('pastoral:chat', reinjectCachedImages);
  }

  return { init: init, generate: generate, openLightbox: openLightbox, get busy() { return busy; } };
})();
window.ImageGen = ImageGen;
