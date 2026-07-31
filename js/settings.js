/* ============================================================
   设置存储（mrfz_settings）
   保留宿主/其他脚本写入的未知字段，只管理本项目所需配置。
   ============================================================ */
const Settings = (function () {
  'use strict';

  const KEY = 'mrfz_settings';
  const DEFAULT_PROMPTS = {
    normal: '根据最新剧情执行常规变量更新。只更新剧情明确影响的变量，不续写剧情，不重复脚本已经确定的设施引力计算。',
    endday: '完成归寝日结：脚本已结算员工薪资、建筑维护费、作物剩余天数和设施引力；请勿重复这些结算。依据变量规则更新日期、天气、潜在访客池、注意事项及其余未由脚本确定的每日状态。'
  };
  const VARIABLE_CONTEXT_DEFAULTS = {
    worldInfoBefore: true,
    personaDescription: true,
    charDescription: true,
    charPersonality: true,
    scenario: true,
    worldInfoAfter: true,
    dialogueExamples: true,
    chatHistory: true
  };
  const variablePresetDefaults = () => ({
    mode: 'none',
    presetName: '',
    context: Object.assign({}, VARIABLE_CONTEXT_DEFAULTS)
  });
  const DEFAULTS = {
    apiMode: 'single',
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

  function normalizeVariablePreset(value) {
    const preset = merge(variablePresetDefaults(), object(value));
    preset.mode = ['none', 'current', 'fixed'].includes(preset.mode) ? preset.mode : 'none';
    preset.presetName = String(preset.presetName == null ? '' : preset.presetName).trim();
    preset.context = merge(VARIABLE_CONTEXT_DEFAULTS, object(preset.context));
    Object.keys(VARIABLE_CONTEXT_DEFAULTS).forEach((key) => { preset.context[key] = !!preset.context[key]; });
    return preset;
  }

  function normalize(value) {
    const cfg = merge(DEFAULTS, object(value));
    cfg.apiMode = cfg.apiMode === 'multi' ? 'multi' : 'single';
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

  function load() { return normalize(raw()); }

  function save(patch) {
    const next = normalize(merge(raw(), patch));
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch (e) { throw new Error('设置保存失败：' + (e && e.message || e)); }
    return next;
  }

  function promptFor(kind, config) {
    const key = kind === 'endday' ? 'endday' : 'normal';
    const custom = String(object(config && config.prompts)[key] || '').trim();
    return custom || DEFAULT_PROMPTS[key];
  }

  function isSecondApiComplete(config) {
    const api = object(config && config.secondApi);
    return !!(String(api.url || '').trim() && String(api.key || '').trim() && String(api.model || '').trim());
  }

  return { KEY, DEFAULTS, DEFAULT_PROMPTS, VARIABLE_CONTEXT_DEFAULTS, load, save, normalize, promptFor, isSecondApiComplete };
})();
window.Settings = Settings;
