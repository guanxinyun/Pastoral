/* ============================================================
   伪同层宿主层（Host）
   1) 唯一宿主判定：仅 0 楼卡片渲染；非 0 楼自我销毁释放性能
   2) 首层共存：不覆盖宿主楼层、边框、输入框或功能按钮
   3) 沉浸视口：仅当前 iframe 页面进入/退出全屏
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

  /** 只注入全屏所需样式；非全屏不改动宿主页面。 */
  function injectTakeover() {
    const d = parentDoc();
    if (!d) return false;
    if (d.getElementById(STYLE_ID)) return true;

    const css = `
/* ===== 暮归旅店 · 第 0 层接管与页面级沉浸 ===== */
/* 仅隐藏父页面其余聊天楼层；保留第 0 层与酒馆原生输入区。 */
#chat > .mes:not([mesid="0"]),
#chat > .mes:not([messageid="0"]):not([mesid]) {
  display: none !important;
}

/* 沉浸模式：只将当前页面 iframe 钉满视口 */
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
    // 只请求当前页面 iframe；不让父页面根节点（连同楼层边框）进入全屏。
    const frame = selfFrame();
    const el = frame || document.documentElement;
    try {
      const fn = el.requestFullscreen || el.webkitRequestFullscreen;
      if (fn) { const p = fn.call(el); if (p && p.catch) p.catch(() => {}); return true; }
    } catch (e) { /* fixed 定位仍作为沉浸降级 */ }
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
