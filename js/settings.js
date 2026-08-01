/* ============================================================
   设置存储（mrfz_settings）
   保留宿主/其他脚本写入的未知字段，只管理本项目所需配置。
   ============================================================ */
const Settings = (function () {
  'use strict';

  const KEY = 'mrfz_settings';
  const SETTINGS_VERSION = 2;
  // 内置指导来自 js/rules.js（由 tools/gen-rules.js 生成），不再读取世界书。
  const BUILTIN_GUIDE = {
    normal: (window.Rules && Rules.DEFAULT_GUIDE && Rules.DEFAULT_GUIDE.normal) || '根据最新剧情执行常规变量更新。',
    endday: (window.Rules && Rules.DEFAULT_GUIDE && Rules.DEFAULT_GUIDE.endday) || '完成归寝日结，不重复脚本已确定的结算。'
  };
  const DEFAULT_PROMPTS = BUILTIN_GUIDE;
  const variablePresetDefaults = () => ({
    mode: 'current',
    presetName: '',
    // 默认沿用酒馆对世界书深度条目与作者注释的处理；玩家可按阶段主动屏蔽。
    blockDepthEntries: false,
    // 变量计算要稳定复现，默认不继承剧情预设的高温。
    temperature: 0
  });
  const DEFAULTS = {
    prompts: {
      normal: '',
      endday: ''
    },
    variablePresets: {
      normal: variablePresetDefaults(),
      endday: variablePresetDefaults()
    },
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

  function migrate(value) {
    const source = merge({}, object(value));
    if (Number(source.variablePresetSettingsVersion) >= SETTINGS_VERSION) return source;
    const presets = object(source.variablePresets);
    source.variablePresets = merge(presets, {
      normal: merge(object(presets.normal), { blockDepthEntries: false }),
      endday: merge(object(presets.endday), { blockDepthEntries: false })
    });
    source.variablePresetSettingsVersion = SETTINGS_VERSION;
    return source;
  }

  function normalizeVariablePreset(value) {
    const preset = merge(variablePresetDefaults(), object(value));
    preset.mode = preset.mode === 'fixed' ? 'fixed' : 'current';
    preset.presetName = String(preset.presetName == null ? '' : preset.presetName).trim();
    // 旧版 none 上下文与 compile/inject 组装路径均不再参与运行。
    delete preset.assembly;
    delete preset.context;
    preset.blockDepthEntries = preset.blockDepthEntries === true;
    const temperature = Number(preset.temperature);
    preset.temperature = Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : 0;
    return preset;
  }

  function normalize(value) {
    const cfg = merge(DEFAULTS, object(value));
    delete cfg.apiMode;
    if (!isObject(cfg.prompts)) cfg.prompts = merge(DEFAULTS.prompts, {});
    if (!isObject(cfg.variablePresets)) cfg.variablePresets = {};
    if (!isObject(cfg.secondApi)) cfg.secondApi = merge(DEFAULTS.secondApi, {});
    cfg.prompts.normal = String(cfg.prompts.normal || '');
    cfg.prompts.endday = String(cfg.prompts.endday || '');
    cfg.variablePresets.normal = normalizeVariablePreset(cfg.variablePresets.normal);
    cfg.variablePresets.endday = normalizeVariablePreset(cfg.variablePresets.endday);
    cfg.secondApi.url = String(cfg.secondApi.url || '').trim();
    cfg.secondApi.key = String(cfg.secondApi.key || '').trim();
    cfg.secondApi.model = String(cfg.secondApi.model || '').trim();
    cfg.secondApi.timeout = Math.max(1000, Number(cfg.secondApi.timeout) || DEFAULTS.secondApi.timeout);
    cfg.secondApi.maxRetries = Math.max(0, Math.floor(Number(cfg.secondApi.maxRetries) || 0));
    return cfg;
  }

  function load() {
    const source = raw();
    const next = normalize(migrate(source));
    if (!(Number(source.variablePresetSettingsVersion) >= SETTINGS_VERSION)) {
      try { localStorage.setItem(KEY, JSON.stringify(next)); }
      catch (e) { console.warn('[Pastoral][Settings]', '迁移设置写回失败', e); }
    }
    return next;
  }

  function save(patch) {
    const next = normalize(merge(migrate(raw()), patch));
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch (e) { throw new Error('设置保存失败：' + (e && e.message || e)); }
    return next;
  }

  /** 本次变量请求真正使用的更新指导：玩家保存的文本优先，留空则用内置默认。 */
  function promptFor(kind, config) {
    const key = kind === 'endday' ? 'endday' : 'normal';
    const custom = String(object(config && config.prompts)[key] || '').trim();
    return custom || builtinGuide(key);
  }

  /** 内置指导原文，供设置页预填与“恢复内置默认”使用。 */
  function builtinGuide(kind) {
    const key = kind === 'endday' ? 'endday' : 'normal';
    if (window.Rules && typeof Rules.defaultGuide === 'function') return Rules.defaultGuide(key);
    return BUILTIN_GUIDE[key];
  }

  function secondApiIssues(config) {
    const api = object(config && config.secondApi);
    const issues = [];
    if (!String(api.url || '').trim()) issues.push('URL');
    if (!String(api.key || '').trim()) issues.push('API Key');
    if (!String(api.model || '').trim()) issues.push('模型');
    return issues;
  }

  function isSecondApiComplete(config) {
    return secondApiIssues(config).length === 0;
  }

  return { KEY, SETTINGS_VERSION, DEFAULTS, DEFAULT_PROMPTS, load, save, normalize, promptFor, builtinGuide, secondApiIssues, isSecondApiComplete };
})();
window.Settings = Settings;
