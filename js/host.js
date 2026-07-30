/* ============================================================
   伪同层宿主层（Host）
   1) 唯一宿主判定：仅 0 楼卡片渲染；非 0 楼自我销毁释放性能
   2) 全局样式绝对接管：跨域注入 CSS 隐藏原生输入框 + 0 楼以外所有气泡
   3) 沉浸视口：全屏进入/退出（iframe 钉满视口 + 原生 Fullscreen API）
   本文件必须最先执行（build.js 的 JS 顺序里排第一）
   ============================================================ */
const Host = (function () {
  'use strict';

  const STYLE_ID = 'pastoral-host-takeover';
  const IMMERSIVE_CLASS = 'pastoral-immersive';

  /** 当前楼层号；非酒馆环境返回 null（独立预览） */
  function messageId() {
    try {
      if (typeof getCurrentMessageId === 'function') return getCurrentMessageId();
    } catch (e) { /* ignore */ }
    return null;
  }

  const inTavern = messageId() !== null;
  const floor = messageId();
  /** 唯一宿主：0 楼，或独立预览（无酒馆 API） */
  const isHost = !inTavern || floor === 0;

  /** 非 0 楼：清空 DOM 自我销毁，释放轮询与渲染开销 */
  function selfDestruct() {
    try {
      document.body.innerHTML = '';
      document.body.style.display = 'none';
    } catch (e) { /* ignore */ }
  }

  /* ---------- 跨域样式接管 ---------- */

  /** 取父窗口 document；跨域受限则返回 null */
  function parentDoc() {
    try {
      if (window.parent === window) return null;
      const d = window.parent.document;
      return d && d.body ? d : null;
    } catch (e) {
      return null;
    }
  }

  /** 本卡片所在的 iframe 元素 */
  function selfFrame() {
    const d = parentDoc();
    if (!d) return null;
    try {
      const frames = d.querySelectorAll('iframe');
      for (const f of frames) if (f.contentWindow === window) return f;
    } catch (e) { /* ignore */ }
    return null;
  }

  /**
   * 注入接管 CSS：
   * - 永远只显示 0 楼：#chat > .mes:not([mesid="0"]) 隐藏
   * - 隐藏 0 楼气泡自身的头像/名字/操作条，只留我们的 iframe
   * - 隐藏原生底部输入区
   */
  function injectTakeover() {
    const d = parentDoc();
    if (!d) return false;
    if (d.getElementById(STYLE_ID)) return true;

    const css = `
/* ===== 暮归旅店 · 伪同层接管（由 0 楼卡片注入） ===== */
#chat > .mes:not([mesid="0"]) { display: none !important; }

/* 0 楼气泡：去壳，只留前端卡 */
#chat > .mes[mesid="0"] {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  margin: 0 !important;
}
#chat > .mes[mesid="0"] .mesAvatarWrapper,
#chat > .mes[mesid="0"] .ch_name,
#chat > .mes[mesid="0"] .mes_buttons,
#chat > .mes[mesid="0"] .mesIDDisplay,
#chat > .mes[mesid="0"] .mes_timer,
#chat > .mes[mesid="0"] .tokenCounterDisplay,
#chat > .mes[mesid="0"] .swipe_left,
#chat > .mes[mesid="0"] .swipe_right { display: none !important; }
#chat > .mes[mesid="0"] .mes_block { margin: 0 !important; padding: 0 !important; }
#chat > .mes[mesid="0"] .mes_text { padding: 0 !important; }

/* 原生输入区：完全隐藏，由卡内 composer 接管 */
#send_form, #form_sheld { display: none !important; }
#chat { padding-bottom: 0 !important; }

/* 沉浸模式：iframe 钉满视口 */
iframe.${IMMERSIVE_CLASS} {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  border: none !important;
  border-radius: 0 !important;
  z-index: 2147483600 !important;
  background: transparent !important;
}
body.${IMMERSIVE_CLASS}-lock { overflow: hidden !important; }
`;
    try {
      const style = d.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      (d.head || d.documentElement).appendChild(style);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- 全屏 / 沉浸 ---------- */

  let immersive = false;

  function nativeFullscreenActive() {
    const d = parentDoc() || document;
    return !!(d.fullscreenElement || d.webkitFullscreenElement);
  }

  function requestNativeFullscreen() {
    // 优先让父窗口整页进入全屏（iframe 无 allowfullscreen 时也有效）
    const d = parentDoc();
    const el = d ? d.documentElement : document.documentElement;
    try {
      const fn = el.requestFullscreen || el.webkitRequestFullscreen;
      if (fn) { const p = fn.call(el); if (p && p.catch) p.catch(() => {}); return true; }
    } catch (e) { /* ignore */ }
    return false;
  }

  function exitNativeFullscreen() {
    const d = parentDoc() || document;
    try {
      const fn = d.exitFullscreen || d.webkitExitFullscreen;
      if (fn && (d.fullscreenElement || d.webkitFullscreenElement)) {
        const p = fn.call(d); if (p && p.catch) p.catch(() => {});
      }
    } catch (e) { /* ignore */ }
  }

  /** 进入/退出沉浸（全屏）；返回最终状态 */
  function setImmersive(on) {
    immersive = !!on;
    const frame = selfFrame();
    const d = parentDoc();

    if (frame) frame.classList.toggle(IMMERSIVE_CLASS, immersive);
    if (d && d.body) d.body.classList.toggle(IMMERSIVE_CLASS + '-lock', immersive);
    document.body.classList.toggle('is-immersive', immersive);

    if (immersive) requestNativeFullscreen();
    else exitNativeFullscreen();

    window.dispatchEvent(new CustomEvent('pastoral:immersive', { detail: { on: immersive } }));
    return immersive;
  }

  function toggleImmersive() { return setImmersive(!immersive); }

  /** 监听外部 Esc 退出原生全屏，同步收起钉满状态 */
  function watchFullscreenExit() {
    const d = parentDoc() || document;
    const onChange = () => {
      if (immersive && !nativeFullscreenActive()) setImmersive(false);
    };
    try {
      d.addEventListener('fullscreenchange', onChange);
      d.addEventListener('webkitfullscreenchange', onChange);
    } catch (e) { /* ignore */ }
  }

  /* ---------- 初始化 ---------- */

  function init() {
    if (!isHost) { selfDestruct(); return false; }
    if (inTavern) {
      injectTakeover();
      // 酒馆可能在切换聊天后重建 DOM，补注一次
      setTimeout(injectTakeover, 1500);
      watchFullscreenExit();
      document.body.classList.add('in-tavern');
    } else {
      document.body.classList.add('standalone');
    }
    return true;
  }

  return {
    init,
    isHost,
    inTavern,
    floor,
    toggleImmersive,
    setImmersive,
    get immersive() { return immersive; },
    injectTakeover
  };
})();
window.Host = Host;
