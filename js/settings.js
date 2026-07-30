/* ============================================================
   设置存储（mrfz_settings）
   保留宿主/其他脚本写入的未知字段，只管理本项目所需配置。
   ============================================================ */
const Settings = (function () {
  'use strict';

  const KEY = 'mrfz_settings';
  const DEFAULTS = {
    apiMode: 'single',
    secondApi: {
      url: '',
      key: '',
      model: '',
      timeout: 30000,
      maxRetries: 3
    }
  };

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function object(value) { return isObject(value) ? value : {}; }

  function merge(base, patch) {
    const out = Object.assign({}, object(base));
    Object.entries(object(patch)).forEach(([key, value]) => {
      out[key] = isObject(value) && isObject(out[key])
        ? merge(out[key], value)
        : value;
    });
    return out;
  }

  function raw() {
    try { return object(JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch (e) { return {}; }
  }

  function normalize(value) {
    const cfg = merge(DEFAULTS, object(value));
    cfg.apiMode = cfg.apiMode === 'multi' ? 'multi' : 'single';
    cfg.secondApi.url = String(cfg.secondApi.url || '').trim();
    cfg.secondApi.key = String(cfg.secondApi.key || '').trim();
    cfg.secondApi.model = String(cfg.secondApi.model || '').trim();
    cfg.secondApi.timeout = Math.max(1000, Number(cfg.secondApi.timeout) || DEFAULTS.secondApi.timeout);
    cfg.secondApi.maxRetries = Math.max(0, Math.floor(Number(cfg.secondApi.maxRetries) || 0));
    return cfg;
  }

  function load() { return normalize(raw()); }

  function save(patch) {
    const next = normalize(merge(raw(), patch));
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch (e) { throw new Error('设置保存失败：' + (e && e.message || e)); }
    return next;
  }

  function isSecondApiComplete(config) {
    const api = object(config && config.secondApi);
    return !!(String(api.url || '').trim() && String(api.key || '').trim() && String(api.model || '').trim());
  }

  return { KEY, DEFAULTS, load, save, normalize, isSecondApiComplete };
})();
window.Settings = Settings;
