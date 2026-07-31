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

  /** 去掉首尾空白和多余结尾斜杠；不改写玩家填写的路径（/v1 等一律保留）。 */
  function normalizeUrl(url) {
    return String(url == null ? '' : url).trim().replace(/\/+$/, '');
  }

  /** 填写体检：只报明确能判定的问题，判断不了就不拦。 */
  function inspectApi(api) {
    const issues = [];
    const url = normalizeUrl(api && api.url);
    if (!url) issues.push('URL 为空');
    else if (!/^https?:\/\//i.test(url)) issues.push('URL 缺少 http:// 或 https:// 前缀');
    else {
      try {
        const parsed = new URL(url);
        if (/\/chat\/completions$/i.test(parsed.pathname)) issues.push('URL 不要写到 /chat/completions，填到 /v1 即可');
      } catch (e) { issues.push('URL 格式无法解析'); }
    }
    if (!String(api && api.key || '').trim()) issues.push('API Key 为空');
    if (!String(api && api.model || '').trim()) issues.push('模型名为空');
    return issues;
  }

  /** 把底层报错翻成能直接照做的说明，并保留原文便于排查。 */
  function describeFailure(err, api, label) {
    const raw = String(err && err.message || err || '未知错误').trim();
    const target = hostOf(api && api.url);
    const local = /^(127\.|localhost|0\.0\.0\.0|\[::1\])/i.test(target);
    let hint = '';
    if (/timeou?t|超时/i.test(raw)) {
      hint = local
        ? '本地服务没有在超时时间内响应：确认 ' + target + ' 正在运行，且该模型没有卡在长思考。'
        : '目标地址没有在超时时间内响应，可加大超时时间或检查网络。';
    } else if (/\b401\b|unauthor|invalid.*key|api key/i.test(raw)) hint = 'API Key 被拒绝，检查 Key 是否正确、是否带了多余空格。';
    else if (/\b403\b|forbidden/i.test(raw)) hint = '目标拒绝访问，检查 Key 权限或来源限制。';
    else if (/\b404\b|not found/i.test(raw)) hint = '路径不存在：URL 通常应填到 /v1，且模型名要与该服务实际提供的一致。';
    else if (/\b429\b|rate limit/i.test(raw)) hint = '被限流，降低频率或稍后重试。';
    else if (/\b5\d\d\b|internal server|bad gateway/i.test(raw)) hint = '目标服务内部错误，通常是上游或代理本身的问题。';
    else if (/failed to fetch|networkerror|econnrefused|连接|network/i.test(raw)) {
      hint = local
        ? '连不上 ' + target + '：确认本地代理已启动并监听该端口。'
        : '网络请求失败，确认地址可达且允许跨域访问。';
    } else if (/model/i.test(raw) && /not|unsupport|unknown/i.test(raw)) hint = '模型名不被目标服务接受，用“获取模型列表”确认可用名称。';
    const detail = hint ? raw + '｜' + hint : raw;
    const out = new Error((label ? label + '：' : '') + detail);
    out.cause = err;
    out.raw = raw;
    return out;
  }

  /** 响应片段，用于把“格式不对”变成看得见的原因。 */
  function snippet(text, limit) {
    const flat = String(text || '').replace(/\s+/g, ' ').trim();
    if (!flat) return '（空响应）';
    const max = limit || 160;
    return flat.length > max ? flat.slice(0, max) + '…' : flat;
  }
  function status(stage, message, loading, detail) {
    window.dispatchEvent(new CustomEvent('pastoral:api-status', { detail: Object.assign({ stage, message, loading: !!loading }, detail || {}) }));
  }

  function textResult(result) {
    if (typeof result === 'string') return result;
    if (result && typeof result.content === 'string') return result.content;
    // 工具调用形态没有正文，明确报出来，避免退化成“空响应”这类无用错误。
    if (result && Array.isArray(result.tool_calls) && result.tool_calls.length) {
      throw new Error('目标模型返回了 tool_calls 而不是文本，变量请求需要纯文本输出');
    }
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

  function timeoutCall(factory, timeout, generationId, label) {
    let timer;
    const who = label || '第二 API';
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { if (typeof stopGenerationById === 'function') stopGenerationById(generationId); } catch (e) { /* ignore */ }
        reject(new Error(who + '请求超时（' + timeout + 'ms）'));
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
   * 关键：`overrides.chat_history.with_depth_entries` 默认为 true，
   * 所以世界书"按深度插入"的条目和作者注释即使走 generateRaw + ordered_prompts 也会被带进来。
   * 这里显式清空未选用的上下文，让变量请求真正只发本项目的指导与正文。
   */
  function buildOverrides(preset) {
    const selected = (preset && preset.context) || {};
    const usingPreset = preset && preset.mode !== 'none';
    const overrides = {};
    // none 模式：未勾选的占位符一律置空，杜绝角色卡/世界书残留。
    if (!usingPreset) {
      CONTEXT_PLACEHOLDERS.forEach(([key, placeholder]) => {
        if (placeholder === 'chat_history') return;
        if (selected[key] !== true) overrides[placeholder] = '';
      });
    }
    // 三种模式都屏蔽深度注入与作者注释：它们不属于"变量更新规则"，只会污染计算。
    if (preset && preset.blockDepthEntries !== false) {
      overrides.chat_history = { with_depth_entries: false, author_note: '' };
    }
    if (!usingPreset && selected.chatHistory !== true) {
      overrides.chat_history = Object.assign({ with_depth_entries: false, author_note: '' }, overrides.chat_history, { prompts: [] });
    }
    return Object.keys(overrides).length ? overrides : null;
  }

  /** 变量计算要稳定复现，不继承剧情预设的高温与惩罚参数。 */
  function samplingOverrides(preset) {
    const temperature = preset && Number.isFinite(Number(preset.temperature)) ? Number(preset.temperature) : 0;
    return {
      temperature,
      frequency_penalty: 'unset',
      presence_penalty: 'unset',
      top_p: 'unset',
      top_k: 'unset'
    };
  }

  /**
   * 解析本次变量请求的预设策略。
   * - none：完全不使用酒馆预设，走 generateRaw + ordered_prompts
   * - current：generate + 'in_use'
   * - fixed：generate + 指定预设名；预设已删除时本次降级为 none
   */
  function resolvePreset(kind, config) {
    const selected = variablePresetConfig(kind, config);
    // 深度注入屏蔽与采样参数对三种模式一致生效。
    const shared = {
      context: selected.context || {},
      blockDepthEntries: selected.blockDepthEntries !== false,
      temperature: selected.temperature
    };
    if (selected.mode === 'current') return Object.assign({ mode: 'current', presetName: 'in_use' }, shared);
    if (selected.mode === 'fixed') {
      if (availablePresetNames().includes(selected.presetName)) {
        return Object.assign({ mode: 'fixed', presetName: selected.presetName }, shared);
      }
      if (typeof toast === 'function') {
        toast('warn', '变量预设不存在', '“' + selected.presetName + '”已不存在，本次改用不带预设。');
      }
    }
    return Object.assign({ mode: 'none', presetName: '' }, shared);
  }

  async function generateVariable(config, kind, settings) {
    const preset = resolvePreset(kind, settings);
    const overrides = buildOverrides(preset);
    // 采样参数只在走自定义 API 时能覆盖；跟随主 API 时保持原样。
    const base = Object.assign({}, config);
    if (base.custom_api) base.custom_api = Object.assign({}, samplingOverrides(preset), base.custom_api);
    if (overrides) base.overrides = Object.assign({}, overrides, base.overrides);
    if (preset.mode === 'none') {
      // generateRaw 才能完全绕开酒馆预设；只发我们指定的占位符和本次任务提示。
      if (typeof generateRaw !== 'function') throw new Error('当前环境缺少 generateRaw，无法发送不带预设的变量请求');
      return generateRaw(Object.assign(base, {
        max_chat_history: base.max_chat_history == null ? 0 : base.max_chat_history,
        ordered_prompts: orderedPrompts(preset.context)
      }));
    }
    if (typeof generate !== 'function') throw new Error('当前环境不支持按酒馆预设生成');
    return generate(Object.assign(base, { preset_name: preset.presetName }));
  }

  /** 只讲格式、不重述规则的纠正提示，附上模型自己刚才的输出。 */
  function repairPrompt(prompt, badReply) {
    return [
      prompt,
      '【上一次输出格式不合规，这是你自己的输出】\n' + String(badReply || '（空）').slice(0, 4000),
      '【本次只需修正格式】\n严格输出一个 <UpdateVariable><Analysis>简短说明</Analysis><JSONPatch>[...]</JSONPatch></UpdateVariable>。'
        + 'JSONPatch 必须是合法 JSON 数组，每个元素形如 {"op":"replace|delta|insert|remove|move","path":"/JSON/Pointer","value":...}；'
        + 'delta 的 value 必须是数字，remove 不带 value，move 用 from 与 to。不要代码围栏，不要解释，不要输出任何标签之外的文字。无变化就输出 []。'
    ].join('\n\n');
  }

  async function callSecondApiForVariable(context) {
    const cfg = Settings.load();
    if (cfg.apiMode !== 'multi') throw new Error('当前未启用多 API 模式');
    const api = Object.assign({}, cfg.secondApi, { url: normalizeUrl(cfg.secondApi && cfg.secondApi.url) });
    const issues = inspectApi(api);
    if (issues.length) throw new Error('第二 API 配置有问题：' + issues.join('；'));
    const prompt = buildPrompt(Object.assign({}, context, { config: cfg }));
    const target = hostOf(api.url);
    let failure;
    for (let attempt = 0; attempt <= api.maxRetries; attempt++) {
      const started = now();
      log(PREFIX_SECOND, '开始', { purpose: context.purpose, attempt: attempt + 1, messageId: context.messageId, target, model: api.model });
      // 每次尝试内部允许一次格式纠正，且不占用玩家设置的重试次数。
      let id = '', raw = '', updateTag = '', repaired = false;
      try {
        for (let pass = 0; pass < 2; pass++) {
          id = 'pastoral-second-' + (++sequence);
          const label = pass === 0
            ? `正在请求 ${target} · 第 ${attempt + 1} 次`
            : `${target} 输出格式不合规，正在请求纠正…`;
          status('第二 API', label, true, { id, attempt: attempt + 1, target, purpose: context.purpose, repair: pass > 0 });
          raw = textResult(await timeoutCall(() => generateVariable({
            generation_id: id,
            user_input: pass === 0 ? prompt : repairPrompt(prompt, raw),
            should_stream: false,
            should_silence: true,
            max_chat_history: 0,
            custom_api: { apiurl: api.url, key: api.key, model: api.model, source: 'openai' }
          }, context.purpose, cfg), api.timeout, id));
          updateTag = Extract.salvageUpdateVariable(raw);
          if (updateTag) { repaired = pass > 0; break; }
          log(PREFIX_SECOND, '格式不合规', { id, pass: pass + 1, received: snippet(raw) });
        }
        if (!updateTag) {
          throw new Error('模型两次都没给出合法 UpdateVariable（含 Analysis 与 JSONPatch 数组）。实际收到：' + snippet(raw));
        }
        const elapsedMs = Math.round(now() - started);
        log(PREFIX_SECOND, '完成', { id, attempt: attempt + 1, elapsedMs, target, repaired });
        status('第二 API 已响应', `${target} · ${elapsedMs}ms，正在写回变量…`, true, { id, elapsedMs, target, purpose: context.purpose, repaired });
        return { raw, updateTag, summary: Extract.stripUpdateVariable(raw).trim(), source: 'second', id, target, elapsedMs, repaired };
      } catch (e) {
        failure = describeFailure(e, api, '第二 API');
        error(PREFIX_SECOND, '失败（尝试 ' + (attempt + 1) + '）', failure);
        status('第二 API 失败', `${target} · ${failure.message}`, attempt < api.maxRetries, { id, target, attempt: attempt + 1, purpose: context.purpose });
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
    const cfg = Settings.load();
    let raw = '', updateTag = '';
    for (let pass = 0; pass < 2; pass++) {
      const passId = pass === 0 ? id : id + '-repair';
      if (pass > 0) status('主 API 日结', '输出格式不合规，正在请求纠正…', true, { id: passId, purpose: 'endday', repair: true });
      raw = textResult(await timeoutCall(() => generateVariable({
        generation_id: passId,
        user_input: pass === 0 ? prompt : repairPrompt(prompt, raw),
        should_stream: false,
        should_silence: true,
        max_chat_history: 0
      }, 'endday', cfg), 30000, passId, '主 API 日结'));
      updateTag = Extract.salvageUpdateVariable(raw);
      if (updateTag) break;
      log(PREFIX_MAIN, '日结格式不合规', { pass: pass + 1, received: snippet(raw) });
    }
    if (!updateTag) {
      throw new Error('当前主 API 两次都没给出合法 UpdateVariable（含 Analysis 与 JSONPatch 数组）。实际收到：' + snippet(raw));
    }
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

  /** 拉取目标服务实际提供的模型名，用于排除"模型名写错"这类错误。 */
  async function fetchModelList(candidate) {
    if (typeof getModelList !== 'function') throw new Error('当前酒馆版本不提供 getModelList');
    const api = Object.assign({}, Settings.load().secondApi, candidate || {});
    const url = normalizeUrl(api.url);
    if (!url) throw new Error('请先填写 URL');
    try {
      const list = await getModelList({ apiurl: url, key: String(api.key || '').trim() });
      return Array.isArray(list) ? list.filter((name) => typeof name === 'string' && name.trim()) : [];
    } catch (e) {
      throw describeFailure(e, Object.assign({}, api, { url }), '获取模型列表失败');
    }
  }

  async function testSecondApi(candidate) {
    if (typeof generate !== 'function' && typeof generateRaw !== 'function') throw new Error('当前环境缺少变量生成接口，未发送请求');
    const api = Object.assign({}, Settings.load().secondApi, candidate || {});
    api.url = normalizeUrl(api.url);
    const issues = inspectApi(api);
    if (issues.length) throw new Error('未发送请求：' + issues.join('；'));
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
      }, 'normal', Settings.load()), Math.max(1000, Number(api.timeout) || 30000), id, '第二 API 测试'));
      const elapsedMs = Math.round(now() - started);
      status('第二 API 测试成功', `${target} · ${elapsedMs}ms · ${snippet(raw, 80) || '收到空文本'}`, false, { id, target, elapsedMs, purpose: 'test' });
      log(PREFIX_SECOND, '连接测试完成', { id, target, elapsedMs });
      return { ok: true, id, target, elapsedMs, raw };
    } catch (e) {
      const failure = describeFailure(e, api, '');
      status('第二 API 测试失败', `${target} · ${failure.message}`, false, { id, target, purpose: 'test' });
      throw failure;
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
    buildOverrides,
    inspectApi,
    normalizeUrl,
    fetchModelList,
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
