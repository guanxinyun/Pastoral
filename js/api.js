/* ============================================================
   双轨 API / MVU 后处理引擎
   主模型负责剧情；可选第二 API 负责 UpdateVariable 计算。
   ============================================================ */
const ApiEngine = (function () {
  'use strict';

  const PREFIX_MAIN = '[Pastoral][MainAPI]';
  const PREFIX_SECOND = '[Pastoral][SecondAPI]';
  const MAX_SOURCE_LENGTH = 60000;
  // 旧版本会自建这个空白预设；现在不带预设走 generateRaw，仅用于从列表中过滤掉遗留项。
  const LEGACY_PRESET_NAME = '【Pastoral 内部】空白变量更新';
  // 不带预设时可选携带的酒馆内置占位符，顺序与酒馆默认顺序一致。
  const CONTEXT_PLACEHOLDERS = [
    ['worldInfoBefore', 'world_info_before'],
    ['personaDescription', 'persona_description'],
    ['charDescription', 'char_description'],
    ['charPersonality', 'char_personality'],
    ['scenario', 'scenario'],
    ['worldInfoAfter', 'world_info_after'],
    ['dialogueExamples', 'dialogue_examples'],
    ['chatHistory', 'chat_history']
  ];
  let sequence = 0;
  let lastFailure = null;

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function log(prefix, stage, detail) { console.info(prefix, stage, detail || ''); }
  function error(prefix, stage, value) { console.error(prefix, stage, value && value.message || value); }
  function hostOf(url) { try { return new URL(url).host || url; } catch (e) { return String(url || '未知地址'); } }
  function status(stage, message, loading, detail) {
    window.dispatchEvent(new CustomEvent('pastoral:api-status', { detail: Object.assign({ stage, message, loading: !!loading }, detail || {}) }));
  }

  function textResult(result) {
    if (typeof result === 'string') return result;
    if (result && typeof result.content === 'string') return result.content;
    return '';
  }

  function latestMessages(limit) {
    if (typeof getChatMessages !== 'function' || typeof getLastMessageId !== 'function') return [];
    const end = getLastMessageId();
    const start = Math.max(0, end - Math.max(1, limit || 3) + 1);
    const list = getChatMessages(start + '-' + end);
    return (Array.isArray(list) ? list : [])
      .filter((m) => m && String(m.message || '').length <= MAX_SOURCE_LENGTH)
      .slice(-Math.max(1, limit || 3));
  }

  // 等用户补充“最近三层之外”的输入时，只需扩展这里。
  function buildAdditionalContext() { return ''; }

  /** 本阶段实际使用的更新指导：玩家在设置里保存的文本优先，留空用内置默认。 */
  function updateGuide(kind, config) {
    if (window.Settings && typeof Settings.promptFor === 'function') {
      const text = String(Settings.promptFor(kind, config) || '').trim();
      if (text) return text;
    }
    const stored = String((config && config.prompts || {})[kind === 'endday' ? 'endday' : 'normal'] || '').trim();
    if (stored) return stored;
    if (window.Rules && typeof Rules.defaultGuide === 'function') return Rules.defaultGuide(kind);
    return '';
  }

  function outputFormat() {
    if (window.Rules && typeof Rules.outputFormat === 'function') return String(Rules.outputFormat() || '').trim();
    return '';
  }

  function buildDailyPurpose(config) {
    return updateGuide('endday', config || Settings.load());
  }

  function buildPrompt(context) {
    const history = latestMessages(3).map((m) => {
      const role = m.role === 'user' ? '玩家' : (m.role === 'assistant' ? '主模型' : '系统');
      return role + ' #' + m.message_id + ':\n' + Extract.stripUpdateVariable(m.message || '');
    }).join('\n\n');
    const config = context.config || Settings.load();
    const kind = context.purpose === 'endday' ? 'endday' : 'normal';
    const guide = context.rules || updateGuide(kind, config);
    const format = outputFormat();
    const extra = buildAdditionalContext(context);
    const calculated = context.calculated
      ? '【脚本已确定事实（不得重算或重复应用）】\n' + JSON.stringify(context.calculated)
      : '';
    const stage = kind === 'endday' ? '归寝日结' : '日常更新';
    return [
      '你是暮归旅店的变量计算引擎，不续写剧情。',
      '【当前阶段：' + stage + '】\n只处理本阶段规则允许的变化，排除另一阶段职责。所有金额的基础单位是整数铜币：1金币=100银币=10000铜币。',
      '【本阶段变量更新指导】\n' + guide,
      format ? '【变量更新输出格式】\n' + format : '',
      '【最近三层正文】\n' + (history || '（无）'),
      '【主生成前当前变量数据】\n' + JSON.stringify(context.baseline && context.baseline.stat_data || {}),
      calculated,
      extra ? '【附加信息】\n' + extra : '',
      '【输出要求】\n必须输出且只输出一个完整的 <UpdateVariable><Analysis>...</Analysis><JSONPatch>[...]</JSONPatch></UpdateVariable> 标签；JSONPatch 必须是合法 JSON 数组，无变化时输出 []。不得输出 lodash 命令或 Markdown 代码围栏。归寝日结不得覆盖脚本已确定事实。'
    ].filter(Boolean).join('\n\n');
  }

  function timeoutCall(factory, timeout, generationId) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { if (typeof stopGenerationById === 'function') stopGenerationById(generationId); } catch (e) { /* ignore */ }
        reject(new Error('第二 API 请求超时（' + timeout + 'ms）'));
      }, timeout);
    });
    return Promise.race([Promise.resolve().then(factory), timeoutPromise]).finally(() => clearTimeout(timer));
  }

  function clone(value) {
    if (value == null) return value;
    try { if (typeof structuredClone === 'function') return structuredClone(value); } catch (e) { /* JSON fallback */ }
    return JSON.parse(JSON.stringify(value));
  }

  function variablePresetConfig(kind, config) {
    const key = kind === 'endday' ? 'endday' : 'normal';
    const value = config && config.variablePresets && config.variablePresets[key];
    return value && typeof value === 'object' ? value : { mode: 'none', presetName: '', context: {} };
  }

  function availablePresetNames() {
    try { return typeof getPresetNames === 'function' ? getPresetNames().filter((name) => name !== LEGACY_PRESET_NAME) : []; }
    catch (e) { return []; }
  }

  /** 不带预设时按勾选拼出 ordered_prompts；未勾选的上下文一律不发送。 */
  function orderedPrompts(context) {
    const selected = context && typeof context === 'object' ? context : {};
    return CONTEXT_PLACEHOLDERS
      .filter(([key]) => selected[key] === true)
      .map(([, placeholder]) => placeholder)
      .concat(['user_input']);
  }

  /**
   * 解析本次变量请求的预设策略。
   * - none：完全不使用酒馆预设，走 generateRaw + ordered_prompts
   * - current：generate + 'in_use'
   * - fixed：generate + 指定预设名；预设已删除时本次降级为 none
   */
  function resolvePreset(kind, config) {
    const selected = variablePresetConfig(kind, config);
    if (selected.mode === 'current') return { mode: 'current', presetName: 'in_use' };
    if (selected.mode === 'fixed') {
      if (availablePresetNames().includes(selected.presetName)) return { mode: 'fixed', presetName: selected.presetName };
      if (typeof toast === 'function') {
        toast('warn', '变量预设不存在', '“' + selected.presetName + '”已不存在，本次改用不带预设。');
      }
    }
    return { mode: 'none', presetName: '', context: selected.context || {} };
  }

  async function generateVariable(config, kind, settings) {
    const preset = resolvePreset(kind, settings);
    if (preset.mode === 'none') {
      // generateRaw 才能完全绕开酒馆预设；只发我们指定的占位符和本次任务提示。
      if (typeof generateRaw !== 'function') throw new Error('当前环境缺少 generateRaw，无法发送不带预设的变量请求');
      return generateRaw(Object.assign({}, config, {
        max_chat_history: config.max_chat_history == null ? 0 : config.max_chat_history,
        ordered_prompts: orderedPrompts(preset.context)
      }));
    }
    if (typeof generate !== 'function') throw new Error('当前环境不支持按酒馆预设生成');
    return generate(Object.assign({}, config, { preset_name: preset.presetName }));
  }

  async function callSecondApiForVariable(context) {
    const cfg = Settings.load();
    if (cfg.apiMode !== 'multi') throw new Error('当前未启用多 API 模式');
    if (!Settings.isSecondApiComplete(cfg)) throw new Error('第二 API 配置不完整');
    const prompt = buildPrompt(Object.assign({}, context, { config: cfg }));
    const api = cfg.secondApi;
    let failure;
    for (let attempt = 0; attempt <= api.maxRetries; attempt++) {
      const id = 'pastoral-second-' + (++sequence);
      const started = now();
      const target = hostOf(api.url);
      log(PREFIX_SECOND, '开始', { id, purpose: context.purpose, attempt: attempt + 1, messageId: context.messageId, target });
      status('第二 API', `正在请求 ${target} · 第 ${attempt + 1} 次`, true, { id, attempt: attempt + 1, target, purpose: context.purpose });
      try {
        const raw = textResult(await timeoutCall(() => generateVariable({
          generation_id: id,
          user_input: prompt,
          should_stream: false,
          should_silence: true,
          max_chat_history: 0,
          custom_api: { apiurl: api.url, key: api.key, model: api.model, source: 'openai' }
        }, context.purpose, cfg), api.timeout, id));
        const updateTag = Extract.normalizeUpdateVariable(raw);
        if (!updateTag) throw new Error('第二 API 未返回包含 Analysis 与合法 JSONPatch 数组的 UpdateVariable');
        const elapsedMs = Math.round(now() - started);
        log(PREFIX_SECOND, '完成', { id, attempt: attempt + 1, elapsedMs, target });
        status('第二 API 已响应', `${target} · ${elapsedMs}ms，正在写回变量…`, true, { id, elapsedMs, target, purpose: context.purpose });
        return { raw, updateTag, summary: Extract.stripUpdateVariable(raw).trim(), source: 'second', id, target, elapsedMs };
      } catch (e) {
        failure = e;
        error(PREFIX_SECOND, '失败（尝试 ' + (attempt + 1) + '）', e);
        status('第二 API 失败', `${target} · ${e && e.message || e}`, attempt < api.maxRetries, { id, target, attempt: attempt + 1, purpose: context.purpose });
      }
    }
    throw failure || new Error('第二 API 调用失败');
  }

  function messageById(messageId) {
    if (typeof getChatMessages !== 'function') return null;
    const found = getChatMessages(messageId);
    return Array.isArray(found) && found[0] ? found[0] : null;
  }

  async function applyUpdate(messageId, original, baseline, generated) {
    if (typeof Mvu === 'undefined' || typeof Mvu.parseMessage !== 'function' || typeof Mvu.replaceMvuData !== 'function') {
      throw new Error('MVU 接口未就绪');
    }
    const commands = Extract.patchToMvuCommands(generated.updateTag);
    const parsed = await Mvu.parseMessage(commands, baseline);
    if (!parsed) throw new Error('MVU 未解析出有效变量更新');
    const merged = Extract.replaceUpdateVariable(original, generated.updateTag);
    if (typeof setChatMessages !== 'function') throw new Error('当前环境无法写回聊天楼层');
    await setChatMessages([{ message_id: messageId, message: merged }], { refresh: 'none' });
    await Mvu.replaceMvuData(parsed, { type: 'message', message_id: messageId });
    return merged;
  }

  async function processAfterMain(context) {
    const messageId = Number(context.messageId == null ? MVU.latestMessageId() : context.messageId);
    const message = messageById(messageId);
    if (!message) return { ok: false, skipped: true, reason: '找不到主模型最新楼层' };
    try {
      const generated = await ApiEngine.callSecondApiForVariable(Object.assign({}, context, { messageId }));
      await applyUpdate(messageId, message.message || '', context.baseline, generated);
      if (window.MVU && typeof MVU.syncFacilityGravity === 'function') await MVU.syncFacilityGravity(messageId);
      lastFailure = null;
      status('变量更新完成', `已写回第 ${messageId} 楼`, false, { id: generated.id, messageId, purpose: context.purpose });
      return { ok: true, source: generated.source, summary: generated.summary, messageId };
    } catch (e) {
      lastFailure = Object.assign({}, context, { messageId });
      error(PREFIX_SECOND, '降级保留主模型变量', e);
      if (typeof toast === 'function') toast('error', '第二 API 失败', (e && e.message || String(e)) + '；已保留主模型结果，可手动重试。');
      return { ok: false, source: 'main', error: e, messageId };
    }
  }

  async function callMainApiForDaily(context) {
    if (typeof generate !== 'function' && typeof generateRaw !== 'function') throw new Error('当前环境不支持主 API 静默日结');
    const prompt = buildPrompt(Object.assign({}, context, { purpose: 'endday' }));
    const id = 'pastoral-daily-main-' + (++sequence);
    const started = now();
    log(PREFIX_MAIN, '日结开始', { messageId: context.messageId });
    const raw = textResult(await timeoutCall(() => generateVariable({
      generation_id: id,
      user_input: prompt,
      should_stream: false,
      should_silence: true,
      max_chat_history: 0
    }, 'endday', Settings.load()), 30000, id));
    const updateTag = Extract.normalizeUpdateVariable(raw);
    if (!updateTag) throw new Error('主 API 日结未返回包含 Analysis 与合法 JSONPatch 数组的 UpdateVariable');
    log(PREFIX_MAIN, '日结完成', { elapsedMs: Math.round(now() - started) });
    return { raw, updateTag, summary: Extract.stripUpdateVariable(raw).trim(), source: 'main' };
  }

  async function appendDailyUpdate(messageId, original, baseline, generated) {
    if (typeof Mvu === 'undefined' || typeof Mvu.parseMessage !== 'function' || typeof Mvu.replaceMvuData !== 'function') {
      throw new Error('MVU 接口未就绪');
    }
    const commands = Extract.patchToMvuCommands(generated.updateTag);
    const parsed = await Mvu.parseMessage(commands, baseline);
    if (!parsed) throw new Error('MVU 未解析出有效日结更新');
    const addition = [generated.summary, generated.updateTag].filter(Boolean).join('\n\n');
    const merged = String(original || '').trim() + (original ? '\n\n' : '') + addition;
    if (typeof setChatMessages === 'function') {
      await setChatMessages([{ message_id: messageId, message: merged }], { refresh: 'none' });
    }
    await Mvu.replaceMvuData(parsed, { type: 'message', message_id: messageId });
  }

  async function processEndday(context) {
    const messageId = Number(context.messageId == null ? MVU.latestMessageId() : context.messageId);
    const message = messageById(messageId);
    if (!message) return { ok: false, skipped: true, reason: '找不到归寝剧情楼层' };
    const cfg = Settings.load();
    // 多 API 模式下归寝也必须由第二 API 完成；失败就报告失败，不静默改用主 API。
    if (cfg.apiMode === 'multi') {
      try {
        const generated = await ApiEngine.callSecondApiForVariable(Object.assign({}, context, { messageId, purpose: 'endday' }));
        await applyUpdate(messageId, message.message || '', context.baseline, generated);
        if (window.MVU && typeof MVU.syncFacilityGravity === 'function') await MVU.syncFacilityGravity(messageId);
        return { ok: true, source: 'second', summary: generated.summary, messageId };
      } catch (secondError) {
        error(PREFIX_SECOND, '归寝日结失败', secondError);
        if (typeof toast === 'function') {
          toast('error', '第二 API 日结失败', (secondError && secondError.message || String(secondError)) + '；已保留确定性结算，可在设置中重试。');
        }
        lastFailure = Object.assign({}, context, { messageId, purpose: 'endday' });
        return { ok: false, source: 'second', error: secondError, messageId };
      }
    }
    try {
      // 主剧情的 MVU 已由酒馆处理，单 API 日结从此刻最新快照继续计算。
      const baseline = MVU.getDataSnapshot ? MVU.getDataSnapshot() : context.baseline;
      const generated = await callMainApiForDaily({ baseline, messageId, purpose: 'endday', calculated: context.calculated });
      await appendDailyUpdate(messageId, message.message || '', baseline, generated);
      if (window.MVU && typeof MVU.syncFacilityGravity === 'function') await MVU.syncFacilityGravity(messageId);
      return { ok: true, source: 'main', summary: generated.summary, messageId };
    } catch (e) {
      error(PREFIX_MAIN, '日结失败', e);
      if (typeof toast === 'function') toast('error', '每日结算失败', e && e.message || String(e));
      return { ok: false, source: 'main', error: e, messageId };
    }
  }

  async function testSecondApi(candidate) {
    if (typeof generate !== 'function' && typeof generateRaw !== 'function') throw new Error('当前环境缺少变量生成接口，未发送请求');
    const api = Object.assign({}, Settings.load().secondApi, candidate || {});
    if (!api.url || !api.key || !api.model) throw new Error('请填写 URL、API Key 和模型名');
    const id = 'pastoral-second-test-' + (++sequence);
    const target = hostOf(api.url);
    const started = now();
    status('测试第二 API', `正在请求 ${target}…`, true, { id, target, purpose: 'test' });
    log(PREFIX_SECOND, '连接测试开始', { id, target, model: api.model });
    try {
      const raw = textResult(await timeoutCall(() => generateVariable({
        generation_id: id,
        user_input: '只回复 PASTORAL_API_OK，不要输出其他内容。',
        should_stream: false,
        should_silence: true,
        max_chat_history: 0,
        custom_api: { apiurl: api.url, key: api.key, model: api.model, source: 'openai' }
      }, 'normal', Settings.load()), Math.max(1000, Number(api.timeout) || 30000), id));
      const elapsedMs = Math.round(now() - started);
      status('第二 API 测试成功', `${target} · ${elapsedMs}ms · ${raw.slice(0, 80) || '收到空文本'}`, false, { id, target, elapsedMs, purpose: 'test' });
      log(PREFIX_SECOND, '连接测试完成', { id, target, elapsedMs });
      return { ok: true, id, target, elapsedMs, raw };
    } catch (e) {
      status('第二 API 测试失败', `${target} · ${e && e.message || e}`, false, { id, target, purpose: 'test' });
      throw e;
    }
  }

  async function retryLastFailure() {
    if (!lastFailure) throw new Error('没有可重试的第二 API 请求');
    return lastFailure.purpose === 'endday' ? processEndday(lastFailure) : processAfterMain(lastFailure);
  }

  return {
    LEGACY_PRESET_NAME,
    availablePresetNames,
    orderedPrompts,
    resolvePreset,
    updateGuide,
    outputFormat,
    buildAdditionalContext,
    buildDailyPurpose,
    buildPrompt,
    callSecondApiForVariable,
    processAfterMain,
    processEndday,
    testSecondApi,
    retryLastFailure,
    get lastFailure() { return lastFailure; }
  };
})();
window.ApiEngine = ApiEngine;
