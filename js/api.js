/* ============================================================
   双轨 API / MVU 后处理引擎
   主模型负责剧情；可选第二 API 负责 UpdateVariable 计算。
   ============================================================ */
const ApiEngine = (function () {
  'use strict';

  const RULE_ENTRY_NAME = '[mvu_update]变量更新规则';
  const RULE_ENTRY_NAMES = [RULE_ENTRY_NAME, '变量更新指导', '变量更新规则', '目前待定'];
  const FORMAT_ENTRY_NAMES = ['[mvu_update]变量输出格式', '变量更新输出格式', '变量输出格式'];
  const PREFIX_MAIN = '[Pastoral][MainAPI]';
  const PREFIX_SECOND = '[Pastoral][SecondAPI]';
  const MAX_SOURCE_LENGTH = 60000;
  let sequence = 0;
  let lastFailure = null;

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function log(prefix, stage, detail) { console.info(prefix, stage, detail || ''); }
  function error(prefix, stage, value) { console.error(prefix, stage, value && value.message || value); }

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

  async function readVariableRules() {
    if (typeof getCharWorldbookNames !== 'function' || typeof getWorldbook !== 'function') {
      throw new Error('当前环境不支持读取角色卡世界书');
    }
    const bound = getCharWorldbookNames('current') || {};
    const names = [bound.primary].concat(bound.additional || []).filter(Boolean);
    if (!names.length) throw new Error('当前角色卡没有绑定世界书');
    const parts = [];
    for (const name of names) {
      const entries = await getWorldbook(name);
      (Array.isArray(entries) ? entries : []).forEach((entry) => {
        const entryName = String(entry && entry.name || '').trim();
        if (entry && entry.enabled !== false && (RULE_ENTRY_NAMES.includes(entryName) || FORMAT_ENTRY_NAMES.includes(entryName)) && String(entry.content || '').trim()) {
          parts.push('【' + name + ' · ' + entryName + '】\n' + String(entry.content).trim());
        }
      });
    }
    if (!parts.length) throw new Error('绑定世界书中未找到变量更新规则或变量输出格式条目');
    return parts.join('\n\n');
  }

  // 等用户补充“最近三层之外”的输入时，只需扩展这里。
  function buildAdditionalContext() { return ''; }

  function configuredPrompt(kind, config) {
    if (Settings && typeof Settings.promptFor === 'function') {
      try { return Settings.promptFor(kind, config); } catch (e) { /* 兼容旧设置桩 */ }
    }
    const prompts = config && config.prompts || {};
    const custom = String(prompts[kind] || '').trim();
    if (custom) return custom;
    return kind === 'endday'
      ? '完成归寝日结；不得重复脚本已经完成的薪资、维护费、植物成长和设施引力结算。'
      : '根据最新剧情执行常规变量更新。';
  }

  function buildDailyPurpose(config) {
    return configuredPrompt('endday', config || Settings.load());
  }

  function buildPrompt(context) {
    const history = latestMessages(3).map((m) => {
      const role = m.role === 'user' ? '玩家' : (m.role === 'assistant' ? '主模型' : '系统');
      return role + ' #' + m.message_id + ':\n' + Extract.stripUpdateVariable(m.message || '');
    }).join('\n\n');
    const config = Settings.load();
    const purpose = context.purpose === 'endday'
      ? buildDailyPurpose(config)
      : configuredPrompt('normal', config);
    const extra = buildAdditionalContext(context);
    const calculated = context.calculated
      ? '【脚本已确定事实（不得重算或重复应用）】\n' + JSON.stringify(context.calculated)
      : '';
    const stage = context.purpose === 'endday' ? '归寝日结' : '日常更新';
    return [
      '你是暮归旅店的变量计算引擎，不续写剧情。',
      '【当前阶段：' + stage + '】\n只处理本阶段规则允许的变化，排除另一阶段职责。所有金额的基础单位是整数铜币：1金币=100银币=10000铜币。',
      '【任务】\n' + purpose,
      '【最近三层正文】\n' + (history || '（无）'),
      '【变量规则】\n' + context.rules,
      '【主生成前当前变量数据】\n' + JSON.stringify(context.baseline && context.baseline.stat_data || {}),
      calculated,
      extra ? '【附加信息】\n' + extra : '',
      '【输出格式】\n必须输出且只输出一个完整的 <UpdateVariable><Analysis>...</Analysis><JSONPatch>[...]</JSONPatch></UpdateVariable> 标签；JSONPatch 必须是合法 JSON 数组，无变化时输出 []。不得输出 lodash 命令或 Markdown 代码围栏。归寝日结不得覆盖脚本已确定事实。'
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

  async function callSecondApiForVariable(context) {
    const cfg = Settings.load();
    if (cfg.apiMode !== 'multi') throw new Error('当前未启用多 API 模式');
    if (!Settings.isSecondApiComplete(cfg)) throw new Error('第二 API 配置不完整');
    const rules = await readVariableRules();
    const prompt = buildPrompt(Object.assign({}, context, { rules }));
    const api = cfg.secondApi;
    let failure;
    for (let attempt = 0; attempt <= api.maxRetries; attempt++) {
      const id = 'pastoral-second-' + (++sequence);
      const started = now();
      log(PREFIX_SECOND, '开始', { attempt: attempt + 1, messageId: context.messageId });
      try {
        const raw = textResult(await timeoutCall(() => generateRaw({
          generation_id: id,
          user_input: prompt,
          should_stream: false,
          should_silence: true,
          max_chat_history: 0,
          ordered_prompts: ['user_input'],
          custom_api: { apiurl: api.url, key: api.key, model: api.model, source: 'openai' }
        }), api.timeout, id));
        const updateTag = Extract.normalizeUpdateVariable(raw);
        if (!updateTag) throw new Error('第二 API 未返回包含 Analysis 与合法 JSONPatch 数组的 UpdateVariable');
        log(PREFIX_SECOND, '完成', { attempt: attempt + 1, elapsedMs: Math.round(now() - started) });
        return { raw, updateTag, summary: Extract.stripUpdateVariable(raw).trim(), source: 'second' };
      } catch (e) {
        failure = e;
        error(PREFIX_SECOND, '失败（尝试 ' + (attempt + 1) + '）', e);
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
    const merged = Extract.replaceUpdateVariable(original, generated.updateTag);
    if (typeof setChatMessages !== 'function') throw new Error('当前环境无法写回聊天楼层');
    await setChatMessages([{ message_id: messageId, message: merged }], { refresh: 'none' });
    if (typeof Mvu === 'undefined' || typeof Mvu.parseMessage !== 'function' || typeof Mvu.replaceMvuData !== 'function') {
      throw new Error('MVU 接口未就绪');
    }
    const parsed = await Mvu.parseMessage(generated.updateTag, baseline);
    if (!parsed) throw new Error('MVU 未解析出有效变量更新');
    await Mvu.replaceMvuData(parsed, { type: 'message', message_id: messageId });
    return merged;
  }

  async function processAfterMain(context) {
    const messageId = Number(context.messageId == null ? MVU.latestMessageId() : context.messageId);
    const message = messageById(messageId);
    if (!message) return { ok: false, skipped: true, reason: '找不到主模型最新楼层' };
    try {
      const generated = await callSecondApiForVariable(Object.assign({}, context, { messageId }));
      await applyUpdate(messageId, message.message || '', context.baseline, generated);
      if (window.MVU && typeof MVU.syncFacilityGravity === 'function') await MVU.syncFacilityGravity(messageId);
      lastFailure = null;
      return { ok: true, source: generated.source, summary: generated.summary, messageId };
    } catch (e) {
      lastFailure = Object.assign({}, context, { messageId });
      error(PREFIX_SECOND, '降级保留主模型变量', e);
      if (typeof toast === 'function') toast('error', '第二 API 失败', (e && e.message || String(e)) + '；已保留主模型结果，可手动重试。');
      return { ok: false, source: 'main', error: e, messageId };
    }
  }

  async function callMainApiForDaily(context) {
    if (typeof generateRaw !== 'function') throw new Error('当前环境不支持主 API 静默日结');
    const rules = await readVariableRules();
    const prompt = buildPrompt(Object.assign({}, context, { purpose: 'endday', rules }));
    const id = 'pastoral-daily-main-' + (++sequence);
    const started = now();
    log(PREFIX_MAIN, '日结开始', { messageId: context.messageId });
    const raw = textResult(await timeoutCall(() => generateRaw({
      generation_id: id,
      user_input: prompt,
      should_stream: false,
      should_silence: true,
      max_chat_history: 0,
      ordered_prompts: ['user_input']
    }), 30000, id));
    const updateTag = Extract.normalizeUpdateVariable(raw);
    if (!updateTag) throw new Error('主 API 日结未返回包含 Analysis 与合法 JSONPatch 数组的 UpdateVariable');
    log(PREFIX_MAIN, '日结完成', { elapsedMs: Math.round(now() - started) });
    return { raw, updateTag, summary: Extract.stripUpdateVariable(raw).trim(), source: 'main' };
  }

  async function appendDailyUpdate(messageId, original, baseline, generated) {
    const addition = [generated.summary, generated.updateTag].filter(Boolean).join('\n\n');
    const merged = String(original || '').trim() + (original ? '\n\n' : '') + addition;
    if (typeof setChatMessages === 'function') {
      await setChatMessages([{ message_id: messageId, message: merged }], { refresh: 'none' });
    }
    if (typeof Mvu === 'undefined' || typeof Mvu.parseMessage !== 'function' || typeof Mvu.replaceMvuData !== 'function') {
      throw new Error('MVU 接口未就绪');
    }
    const parsed = await Mvu.parseMessage(generated.updateTag, baseline);
    if (!parsed) throw new Error('MVU 未解析出有效日结更新');
    await Mvu.replaceMvuData(parsed, { type: 'message', message_id: messageId });
  }

  async function processEndday(context) {
    const messageId = Number(context.messageId == null ? MVU.latestMessageId() : context.messageId);
    const message = messageById(messageId);
    if (!message) return { ok: false, skipped: true, reason: '找不到归寝剧情楼层' };
    const cfg = Settings.load();
    if (cfg.apiMode === 'multi') {
      try {
        const generated = await ApiEngine.callSecondApiForVariable(Object.assign({}, context, { messageId, purpose: 'endday' }));
        await applyUpdate(messageId, message.message || '', context.baseline, generated);
        if (window.MVU && typeof MVU.syncFacilityGravity === 'function') await MVU.syncFacilityGravity(messageId);
        return { ok: true, source: 'second', summary: generated.summary, messageId };
      } catch (secondError) {
        error(PREFIX_SECOND, '归寝日结降级到主 API', secondError);
        if (typeof toast === 'function') toast('warn', '副 API 日结失败', '正在改用当前主 API 完成日结。');
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

  async function retryLastFailure() {
    if (!lastFailure) throw new Error('没有可重试的第二 API 请求');
    return processAfterMain(lastFailure);
  }

  return {
    RULE_ENTRY_NAME,
    buildAdditionalContext,
    buildDailyPurpose,
    buildPrompt,
    callSecondApiForVariable,
    processAfterMain,
    processEndday,
    retryLastFailure,
    get lastFailure() { return lastFailure; }
  };
})();
window.ApiEngine = ApiEngine;
