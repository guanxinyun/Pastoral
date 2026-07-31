/* api.js · 双轨变量引擎测试 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let failed = 0;
function ok(cond, label) { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failed++; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n[1] UpdateVariable 标签工具');
  const dom = new JSDOM('<!doctype html><body><button id="composerSend"></button><textarea id="composerInput"></textarea><div id="requestStatus" hidden><strong data-request-status-title></strong><small data-request-status-message></small></div><div id="toastStack"></div></body>', { runScripts: 'dangerously', url: 'http://localhost/' });
  const win = dom.window;
  win.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'extract.js'), 'utf8'));
  const mainTag = '<UpdateVariable><Analysis>checked</Analysis><JSONPatch>[{"op":"delta","path":"/旅店/资金","value":100}]</JSONPatch></UpdateVariable>';
  const secondTag = '<UpdateVariable><Analysis>checked</Analysis><JSONPatch>[]</JSONPatch></UpdateVariable>';
  const raw = '<maintext>剧情</maintext>' + mainTag + '<option>继续</option>';
  ok(win.Extract.extractUpdateVariable(raw) === mainTag, '提取完整 JSON Patch UpdateVariable 标签');
  ok(win.Extract.normalizeUpdateVariable(mainTag) === mainTag, '接受合法 JSON Patch 数组');
  ok(win.Extract.normalizeUpdateVariable(secondTag) === secondTag, '接受无变化的空 JSON Patch 数组');
  const replaced = win.Extract.replaceUpdateVariable(raw, secondTag);
  ok(/剧情/.test(replaced) && /<option>继续<\/option>/.test(replaced) && /\[\]/.test(replaced) && !/"value":100/.test(replaced), '只替换变量标签，保留剧情与选项');
  ok(win.Extract.normalizeUpdateVariable('<UpdateVariable><Analysis>x</Analysis><JSONPatch>{"op":"replace"}</JSONPatch></UpdateVariable>') === '', '拒绝非数组 JSONPatch');
  ok(win.Extract.normalizeUpdateVariable('<UpdateVariable><Analysis>x</Analysis><JSONPatch>[invalid]</JSONPatch></UpdateVariable>') === '', '拒绝非法 JSONPatch');
  ok(win.Extract.normalizeUpdateVariable('<UpdateVariable><Analysis>x</Analysis><JSONPatch>[1,{"op":"unknown","path":"/旅店/资金"}]</JSONPatch></UpdateVariable>') === '', '拒绝非对象和未知操作');
  ok(win.Extract.normalizeUpdateVariable('<UpdateVariable><Analysis>x</Analysis><JSONPatch>[{"op":"delta","path":"/旅店/资金","value":"100"}]</JSONPatch></UpdateVariable>') === '', '拒绝非数值 delta');
  ok(win.Extract.normalizeUpdateVariable('<UpdateVariable><Analysis>x</Analysis><JSONPatch>[{"op":"move","from":"/a","path":"/b"}]</JSONPatch></UpdateVariable>') === '', '拒绝缺少 to 的 move');
  ok(win.Extract.normalizeUpdateVariable('<UpdateVariable><Analysis>x</Analysis><JSONPatch>[{"op":"replace","path":"旅店.资金","value":1}]</JSONPatch></UpdateVariable>') === '', '拒绝非 JSON Pointer 路径');
  ok(win.Extract.normalizeUpdateVariable('<UpdateVariable><Analysis>x</Analysis><JSONPatch>[{"op":"replace","path":"/_变量","value":1}]</JSONPatch></UpdateVariable>') === '', '拒绝更新只读路径');
  ok(win.Extract.normalizeUpdateVariable('<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>') === '', '拒绝缺少 Analysis 的更新');
  ok(win.Extract.normalizeUpdateVariable('_.set("旅店.资金", 88);') === '', '拒绝裸 lodash 更新命令');
  ok(win.Extract.normalizeUpdateVariable('只有总结，没有更新命令') === '', '无有效 JSON Patch 时不伪造更新');
  const patchTag = '<UpdateVariable><Analysis>checked</Analysis><JSONPatch>[{"op":"replace","path":"/旅店/资金","value":500},{"op":"delta","path":"/大掌柜/精力","value":-8},{"op":"insert","path":"/旅店/库存/星砂","value":{"数量":2}},{"op":"remove","path":"/旅店/库存/干柴"},{"op":"move","from":"/a","to":"/b"}]</JSONPatch></UpdateVariable>';
  const commands = win.Extract.patchToMvuCommands(patchTag);
  ok(/_.set\("旅店\.资金",500\)/.test(commands), 'replace 转换为 _.set');
  ok(/_.add\("大掌柜\.精力",-8\)/.test(commands), 'delta 转换为 _.add');
  ok(/_.insert\("旅店\.库存","星砂",\{"数量":2\}\)/.test(commands), '对象 insert 转换为父路径、键和值');
  ok(/_.delete\("旅店\.库存","干柴"\)/.test(commands), 'remove 转换为父路径和键');
  ok(/_.move\("a","b"\)/.test(commands), 'move 转换为 _.move');
  ok(win.Extract.patchToMvuCommands('<UpdateVariable><Analysis>x</Analysis><JSONPatch>[{"op":"replace","path":"/旅店/员工/甲/技能/0","value":"新技能"}]</JSONPatch></UpdateVariable>') === '_.set("旅店.员工.甲.技能[0]","新技能")', '数组 JSON Pointer 转换为 MVU 下标路径');

  console.log('\n[2] 设施引力与前端确定性日结');
  {
    const calcDom = new JSDOM('<!doctype html>', { runScripts: 'dangerously', url: 'http://localhost/' });
    const calcWin = calcDom.window;
    calcWin.SAMPLE_STATE = {};
    calcWin.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'mvu.js'), 'utf8'));
    const data = { stat_data: {
      旅店: { 资金: 1000, 员工: { 甲: { 职业信息: { 日薪: 80 } }, 乙: { 职业信息: { 日薪: 120 } } } },
      建筑: { 已建成: {
        甲馆: { 影响力: { 美食: 1, 知识: 2, 舒适: 3, 冒险: 4, 文化: 5, 自然: 6 }, 维护费用: 10 },
        乙馆: { 影响力: { 美食: 6, 知识: 5, 舒适: 4, 冒险: 3, 文化: 2, 自然: 1 }, 维护费用: 20 }
      } },
      访客生态: { 声望引力: 2, 服务引力: 3, 环境引力: 4, 设施引力: {} },
      农牧: {
        农田网格: { '0,0': { 状态: '种植中', 剩余天数: 2, 今日已浇水: true }, '1,0': { 状态: '种植中', 剩余天数: 0, 今日已浇水: true } },
        魔法农田网格: { '0,0': { 状态: '种植中', 剩余天数: 3, 今日已浇水: true, 今日已魔力灌溉: true, 今日已养护: true } }
      },
      当日预报: { 日初资金: 900 }
    } };
    const gravity = calcWin.MVU.calculateFacilityGravity(data.stat_data);
    ok(Object.values(gravity.dimensions).every((v) => v === 7), '六维设施引力分别取建筑对应子引力之和且不除以 6');
    ok(gravity.total === 51, '总引力使用脚本设施引力合计计算');
    const first = calcWin.MVU.settleDay(data, 'message-20');
    ok(!first.skipped && first.report.salary === 200, '日结汇总所有员工日薪（铜币）');
    ok(first.report.maintenance === 30, '日结汇总所有建筑维护费（铜币）');
    ok(first.data.stat_data.旅店.资金 === 770 && first.report.afterFunds === 770, '前端扣费并记录结算后资金');
    ok(first.data.stat_data.农牧.农田网格['0,0'].剩余天数 === 1 && first.data.stat_data.农牧.农田网格['1,0'].剩余天数 === 0, '普通作物剩余天数减一且不低于零');
    ok(first.data.stat_data.农牧.魔法农田网格['0,0'].剩余天数 === 2, '魔法作物剩余天数减一');
    ok(first.data.stat_data.农牧.农田网格['0,0'].今日已浇水 === false && first.data.stat_data.农牧.农田网格['1,0'].今日已浇水 === false, '日结重置普通农田每日标记');
    ok(!first.data.stat_data.农牧.魔法农田网格['0,0'].今日已浇水 && !first.data.stat_data.农牧.魔法农田网格['0,0'].今日已魔力灌溉 && !first.data.stat_data.农牧.魔法农田网格['0,0'].今日已养护, '日结重置魔法农田全部每日标记');
    ok(Object.values(first.data.stat_data.访客生态.设施引力).every((v) => v === 7), '脚本逐维写入设施引力');
    ok(first.data.stat_data.访客生态.总引力值 === 51, '脚本写入重算后的总引力');
    const second = calcWin.MVU.settleDay(first.data, 'message-20');
    ok(second.skipped && second.data.stat_data.旅店.资金 === 770 && second.data.stat_data.农牧.农田网格['0,0'].剩余天数 === 1, '同一结算标识不会重复扣费或推进植物');
    const aiOverwritten = calcWin.MVU.clone(first.data);
    aiOverwritten.stat_data.旅店.资金 = 9999;
    aiOverwritten.stat_data.农牧.农田网格['0,0'].剩余天数 = 9;
    aiOverwritten.stat_data.农牧.农田网格['0,0'].今日已浇水 = true;
    aiOverwritten.stat_data.农牧.魔法农田网格['0,0'].剩余天数 = 9;
    aiOverwritten.stat_data.农牧.魔法农田网格['0,0'].今日已浇水 = true;
    aiOverwritten.stat_data.农牧.魔法农田网格['0,0'].今日已魔力灌溉 = true;
    aiOverwritten.stat_data.农牧.魔法农田网格['0,0'].今日已养护 = true;
    aiOverwritten.stat_data.访客生态.设施引力.美食 = 999;
    aiOverwritten.stat_data.访客生态.总引力值 = 999;
    const enforced = calcWin.MVU.enforceSettlementFacts(aiOverwritten, first.data);
    ok(enforced.stat_data.旅店.资金 === 770, 'AI 回写后脚本锁定已结算资金');
    ok(enforced.stat_data.农牧.农田网格['0,0'].剩余天数 === 1 && enforced.stat_data.农牧.农田网格['0,0'].今日已浇水 === false, 'AI 回写后脚本锁定普通农田确定事实');
    ok(enforced.stat_data.农牧.魔法农田网格['0,0'].剩余天数 === 2 && !enforced.stat_data.农牧.魔法农田网格['0,0'].今日已浇水 && !enforced.stat_data.农牧.魔法农田网格['0,0'].今日已魔力灌溉 && !enforced.stat_data.农牧.魔法农田网格['0,0'].今日已养护, 'AI 回写后脚本锁定魔法农田确定事实');
    ok(enforced.stat_data.访客生态.设施引力.美食 === 7 && enforced.stat_data.访客生态.总引力值 === 51, 'AI 回写后脚本重算并锁定设施引力与总引力');
  }

  console.log('\n[3] 第二 API 世界书、重试与配置');
  const apiPath = path.join(__dirname, '..', 'js', 'api.js');
  ok(fs.existsSync(apiPath), 'api.js 模块存在');
  if (fs.existsSync(apiPath)) {
    let attempts = 0;
    const configs = [], createdPresets = [];
    const allContext = {
      worldInfoBefore: true, personaDescription: true, charDescription: true, charPersonality: true,
      scenario: true, worldInfoAfter: true, dialogueExamples: true, chatHistory: true
    };
    let settingsState = {
      apiMode: 'multi', prompts: { normal: '玩家普通变量要求', endday: '玩家归寝要求' },
      variablePresets: {
        normal: { mode: 'none', presetName: '', context: Object.assign({}, allContext, { chatHistory: false }) },
        endday: { mode: 'current', presetName: '', context: allContext }
      },
      secondApi: { url: 'https://logic.example/v1', key: 'secret', model: 'logic-model', timeout: 1000, maxRetries: 2 }
    };
    win.Settings = {
      load: () => settingsState,
      promptFor: (kind, cfg) => cfg.prompts[kind === 'endday' ? 'endday' : 'normal'],
      isSecondApiComplete: () => true
    };
    win.default_preset = {
      settings: { max_context: 4096, max_completion_tokens: 512, temperature: 1, should_stream: false },
      prompts: [
        { id: 'main', name: '主提示', enabled: true, role: 'system', content: '不应进入空白预设' },
        { id: 'worldInfoBefore', name: '世界书前', enabled: true, role: 'system', position: { type: 'relative' } },
        { id: 'charDescription', name: '角色描述', enabled: true, role: 'system', position: { type: 'relative' } },
        { id: 'chatHistory', name: '聊天历史', enabled: true, role: 'system', position: { type: 'relative' } }
      ],
      prompts_unused: [{ id: 'custom', name: '未用提示', enabled: false, role: 'system', content: '也不应保留' }],
      extensions: { regex_scripts: [{ name: '脚本' }], tavern_helper: { scripts: { x: {} } }, preserved: true }
    };
    win.getPresetNames = () => ['剧情预设', '变量专用'];
    win.createOrReplacePreset = async (name, preset, options) => { createdPresets.push({ name, preset, options }); return true; };
    win.getCharWorldbookNames = () => ({ primary: '主书', additional: ['附书'] });
    win.getWorldbook = async (name) => name === '主书'
      ? [{ name: '[mvu_update]变量更新规则', enabled: true, content: '变量规则 A' }, { name: '[mvu_update]变量输出格式', enabled: true, content: '输出格式 A' }]
      : [{ name: '变量更新指导', enabled: true, content: '变量规则 B' }];
    win.generate = async (config) => {
      attempts++; configs.push(config);
      if (attempts < 3) throw new Error('temporary');
      return '计算完成<UpdateVariable><Analysis>资金变化</Analysis><JSONPatch>[{"op":"replace","path":"/旅店/资金","value":99}]</JSONPatch></UpdateVariable>';
    };
    win.stopGenerationById = () => true;
    win.getChatMessages = () => [
      { message_id: 7, role: 'user', message: '行动 A' },
      { message_id: 8, role: 'assistant', message: '剧情 B<UpdateVariable>旧</UpdateVariable>' },
      { message_id: 9, role: 'user', message: '行动 C' },
      { message_id: 10, role: 'assistant', message: '剧情 D<UpdateVariable>主</UpdateVariable>' }
    ];
    win.getLastMessageId = () => 10;
    win.MVU = { latestMessageId: () => 10, getDataSnapshot: () => ({ stat_data: { 旅店: { 资金: 50 } } }), clone: (x) => JSON.parse(JSON.stringify(x)) };
    win.Mvu = { parseMessage: async () => null, replaceMvuData: async () => {} };
    win.toast = () => {};
    win.eval(fs.readFileSync(apiPath, 'utf8'));

    const result = await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'normal' });
    ok(attempts === 3, '失败后按 maxRetries=2 共尝试 3 次');
    ok(/变量规则 A/.test(configs[0].user_input) && /变量规则 B/.test(configs[0].user_input) && /输出格式 A/.test(configs[0].user_input), '读取绑定世界书中的更新规则与输出格式条目');
    ok(/玩家普通变量要求/.test(configs[0].user_input), '普通请求使用玩家保存的自定义提示词');
    const promptWithFacts = win.ApiEngine.buildPrompt({ purpose: 'endday', rules: '规则', baseline: { stat_data: {} }, calculated: { facilityGravity: { 美食: 7 }, salary: 200, maintenance: 30 } });
    ok(/玩家归寝要求/.test(promptWithFacts) && /美食/.test(promptWithFacts) && /200/.test(promptWithFacts) && /30/.test(promptWithFacts), '归寝提示包含自定义要求与脚本确定事实');
    ok(/当前阶段：归寝日结/.test(promptWithFacts) && /基础单位是整数铜币/.test(promptWithFacts) && /<JSONPatch>/.test(promptWithFacts) && /不得覆盖脚本已确定事实/.test(promptWithFacts), '提示明确阶段、铜币、JSON Patch 与防重复约束');
    ok(configs[0].preset_name === win.ApiEngine.INTERNAL_PRESET_NAME && configs[0].max_chat_history === 0, 'none 模式单次请求使用内部空白预设');
    ok(createdPresets.length >= 1 && createdPresets[0].name === win.ApiEngine.INTERNAL_PRESET_NAME, '首次 none 请求自动创建内部空白预设');
    ok(createdPresets[0].options && createdPresets[0].options.render === 'debounced', '创建内部预设时使用酒馆支持的防抖渲染选项');
    const blankPrompts = createdPresets[0].preset.prompts;
    ok(!blankPrompts.some((p) => p.content) && blankPrompts.some((p) => p.id === 'worldInfoBefore') && blankPrompts.some((p) => p.id === 'charDescription') && !blankPrompts.some((p) => p.id === 'chatHistory'), '空白预设清除人工提示词且只保留已勾选上下文占位符');
    ok(createdPresets[0].preset.prompts_unused.length === 0 && !createdPresets[0].preset.extensions.regex_scripts && !createdPresets[0].preset.extensions.tavern_helper && createdPresets[0].preset.extensions.preserved === true, '空白预设清除正则与助手脚本并保留无关扩展');
    ok(configs[0].custom_api.apiurl === 'https://logic.example/v1' && configs[0].custom_api.source === 'openai', '传入 custom_api URL/model/source');
    ok(!/secret/.test(configs[0].user_input), 'API Key 不进入提示词');
    ok(result.updateTag.includes('/旅店/资金') && result.updateTag.includes('<JSONPatch>'), '返回第二 API 的 JSON Patch UpdateVariable');
    settingsState.variablePresets.endday = { mode: 'current', presetName: '', context: allContext };
    configs.length = 0; attempts = 2;
    await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'endday' });
    ok(configs[0].preset_name === 'in_use', '归寝 current 模式跟随酒馆当前预设');
    settingsState.variablePresets.normal = { mode: 'fixed', presetName: '变量专用', context: allContext };
    configs.length = 0;
    await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'normal' });
    ok(configs[0].preset_name === '变量专用', '普通 fixed 模式使用玩家指定预设');
    settingsState.variablePresets.normal.presetName = '已删除预设';
    configs.length = 0;
    await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'normal' });
    ok(configs[0].preset_name === win.ApiEngine.INTERNAL_PRESET_NAME, '固定预设不存在时本次安全回退内部空白预设');

    const statusEvents = [];
    win.addEventListener('pastoral:api-status', (e) => statusEvents.push(e.detail));
    let testConfig = null;
    settingsState.variablePresets.normal = { mode: 'current', presetName: '', context: allContext };
    win.generate = async (config) => { testConfig = config; return 'PASTORAL_API_OK'; };
    const tested = await win.ApiEngine.testSecondApi({ url: 'https://probe.example/v1', key: 'probe-secret', model: 'probe-model', timeout: 1000 });
    ok(tested.ok && tested.target === 'probe.example', '第二 API 连接测试返回目标主机与成功结果');
    ok(testConfig && testConfig.preset_name === 'in_use', '连接测试复用普通变量请求的预设策略');

    let rawFallbackConfig = null;
    settingsState.variablePresets.normal = { mode: 'none', presetName: '', context: allContext };
    win.generate = undefined;
    win.generateRaw = async (config) => {
      rawFallbackConfig = config;
      return '<UpdateVariable><Analysis>兼容路径</Analysis><JSONPatch>[]</JSONPatch></UpdateVariable>';
    };
    const rawFallback = await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'normal' });
    ok(rawFallback.updateTag && rawFallbackConfig && rawFallbackConfig.ordered_prompts[0] === 'user_input', '旧环境 none 模式缺少 generate 时回退 generateRaw 最小路径');

    ok(statusEvents.some((x) => x.stage === '测试第二 API' && x.loading) && statusEvents.some((x) => x.stage === '第二 API 测试成功' && !x.loading), '连接测试提供请求中与成功状态');
    ok(!statusEvents.some((x) => /probe-secret/.test(JSON.stringify(x))), '连接测试状态不泄露 API Key');
  }

  console.log('\n[3] 成功替换正文并基于旧快照回写 MVU');
  if (win.ApiEngine) {
    const setCalls = [], parseCalls = [], replaceCalls = [];
    const chat = [{ message_id: 10, role: 'assistant', message: raw }];
    win.getChatMessages = () => chat;
    win.setChatMessages = async (updates) => { setCalls.push(updates); chat[0].message = updates[0].message; };
    win.Mvu = {
      parseMessage: async (message, baseline) => { parseCalls.push({ message, baseline }); return { stat_data: { changed: true } }; },
      replaceMvuData: async (data, options) => { replaceCalls.push({ data, options }); }
    };
    win.ApiEngine.callSecondApiForVariable = async () => ({
      raw: '总结<UpdateVariable><Analysis>资金变化</Analysis><JSONPatch>[{"op":"replace","path":"/旅店/资金","value":99}]</JSONPatch></UpdateVariable>',
      updateTag: '<UpdateVariable><Analysis>资金变化</Analysis><JSONPatch>[{"op":"replace","path":"/旅店/资金","value":99}]</JSONPatch></UpdateVariable>',
      summary: '总结', source: 'second'
    });
    const baseline = { stat_data: { 旅店: { 资金: 50 } } };
    const out = await win.ApiEngine.processAfterMain({ baseline, messageId: 10, purpose: 'normal' });
    ok(setCalls.length === 1 && /剧情/.test(setCalls[0][0].message) && /99/.test(setCalls[0][0].message) && !/主更新/.test(setCalls[0][0].message), '最新 AI 楼正文仅替换变量标签');
    ok(parseCalls.length === 1 && parseCalls[0].baseline === baseline, 'Mvu.parseMessage 使用主生成前快照');
    ok(/_.set\("旅店\.资金",99\)/.test(parseCalls[0].message) && !/<JSONPatch>/.test(parseCalls[0].message), 'JSON Patch 转换为 Mvu 可解析命令');
    ok(replaceCalls.length === 1 && replaceCalls[0].options.message_id === 10, 'Mvu.replaceMvuData 回写目标最新楼层');
    ok(out.ok && out.source === 'second', '后处理返回成功来源');
  }

  console.log('\n[4] 统一发送在后处理期间锁定发送按钮');
  if (win.ApiEngine) {
    let latestId = 10, processed = 0, generationEnded = false, processedAfterEnd = false;
    const slash = [];
    const generationEvents = {};
    win.iframe_events = { GENERATION_STARTED: 'js-generation-started', GENERATION_ENDED: 'js-generation-ended' };
    win.tavern_events = { GENERATION_STARTED: 'generation-started', GENERATION_ENDED: 'generation-ended', GENERATION_STOPPED: 'generation-stopped' };
    win.eventOn = (name, handler) => { generationEvents[name] = handler; };
    win.Settings.load = () => ({ apiMode: 'multi', secondApi: { url: 'x', key: 'k', model: 'm', timeout: 1000, maxRetries: 0 } });
    win.MVU.getDataSnapshot = () => ({ stat_data: { before: true } });
    win.MVU.latestMessageId = () => latestId;
    win.getLastMessageId = () => latestId;
    win.getChatMessages = (range) => [{ message_id: latestId, role: 'assistant', message: '完成' }];
    win.triggerSlash = async (cmd) => {
      slash.push(cmd);
      if (cmd === '/trigger await=true') {
        if (generationEvents['generation-started']) generationEvents['generation-started']('main-generation');
        latestId = 12;
        await wait(20);
        generationEnded = true;
        if (generationEvents['generation-ended']) generationEvents['generation-ended'](12);
      }
    };
    win.ApiEngine.processAfterMain = async () => { processed++; processedAfterEnd = generationEnded; await wait(30); return { ok: true }; };
    win.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'chat.js'), 'utf8'));
    win.Chat.init();
    const sending = win.Chat.handleUnifiedRequest('测试动作');
    await wait(5);
    ok(win.document.getElementById('composerSend').disabled, '主生成/变量后处理期间发送按钮冻结');
    await sending;
    ok(processed === 1, '多 API 普通发送只后处理一次');
    ok(processedAfterEnd, '变量后处理只在主模型 GENERATION_ENDED 后启动');
    ok(!win.document.getElementById('composerSend').disabled, '后处理结束后发送按钮恢复');
    ok(slash.filter((x) => x === '/trigger await=true').length === 1, '主模型使用 await=true 只触发一次');

    win.triggerSlash = async () => { throw new Error('send unavailable'); };
    const composer = win.document.getElementById('composerInput');
    composer.value = '失败时保留我';
    const failedSend = await win.Chat.handleUnifiedRequest(composer.value);
    ok(!failedSend && composer.value === '失败时保留我', '发送失败时保留输入框完整内容');
    win.Settings.load = () => ({ apiMode: 'single', secondApi: { url: '', key: '', model: '', timeout: 1000, maxRetries: 0 } });
    win.triggerSlash = async (cmd) => {
      if (cmd === '/trigger await=true') {
        latestId += 1;
        const completedId = latestId;
        await wait(5);
        if (generationEvents['generation-ended']) generationEvents['generation-ended'](completedId);
      }
    };
    composer.value = '发送后清空我';
    const successfulSend = await win.Chat.handleUnifiedRequest(composer.value);
    ok(successfulSend && composer.value === '', '发送成功后才清空输入框');
    const requestStatus = win.document.getElementById('requestStatus');
    ok(requestStatus.querySelector('[data-request-status-title]').textContent === '主剧情完成' && !requestStatus.classList.contains('is-loading'), '普通单 API 回复完成后结束等待状态');

    win.Settings.load = () => ({ apiMode: 'single', secondApi: { url: '', key: '', model: '', timeout: 1000, maxRetries: 0 } });
    win.triggerSlash = async (cmd) => {
      if (cmd === '/trigger await=true') latestId += 1;
    };
    const withoutEndEvent = await win.Chat.handleUnifiedRequest('无结束事件也应完成');
    ok(withoutEndEvent, '未收到 GENERATION_ENDED 时通过新 AI 楼层完成请求');
    ok(requestStatus.querySelector('[data-request-status-title]').textContent === '主剧情完成' && !requestStatus.classList.contains('is-loading'), '事件缺失的降级路径也正确收尾状态');

    latestId += 1;
    const userOnlyId = latestId;
    win.getChatMessages = (range) => [{ message_id: Number(range), role: Number(range) === userOnlyId ? 'user' : 'assistant', message: '仅有玩家楼层' }];
    win.triggerSlash = async () => {};
    const rejectedUserFloor = await win.Chat.handleUnifiedRequest('不能把玩家楼层当成回复');
    ok(!rejectedUserFloor, '轮询不会把请求后的玩家楼层误判为主模型回复');
    ok(requestStatus.querySelector('[data-request-status-title]').textContent === '主剧情失败' && !requestStatus.classList.contains('is-loading'), '主回复超时后显示非加载失败状态');
    win.getChatMessages = (range) => [{ message_id: latestId, role: 'assistant', message: '完成' }];
    win.triggerSlash = async (cmd) => {
      if (cmd === '/trigger await=true') latestId += 1;
    };

    const stages = [];
    const actualProcessEndday = win.ApiEngine.processEndday;
    win.Settings.load = () => ({ apiMode: 'multi', secondApi: { url: 'x', key: 'k', model: 'm', timeout: 1000, maxRetries: 0 } });
    win.ApiEngine.processAfterMain = async (context) => { stages.push(context.purpose); return { ok: true }; };
    win.MVU.settleForWrite = () => { stages.push('settle'); return { data: { stat_data: { settled: true } }, report: { afterFunds: 700 }, calculated: { dimensions: {}, total: 0 } }; };
    win.MVU.writeWithTimeout = async () => { stages.push('initial-write'); return { ok: true }; };
    win.ApiEngine.processEndday = async (context) => { stages.push(context.purpose); return { ok: true, summary: '完成', source: 'second' }; };
    win.MVU.enforceAndWrite = async () => { stages.push('enforce'); };
    await win.Chat.handleUnifiedRequest('归寝入眠', { kind: 'endday' });
    ok(stages.join('>') === 'normal>settle>initial-write>endday>enforce', '多 API 归寝严格执行日常→脚本→首次写回→归寝→事实锁定');
    const summaries = [];
    win.addEventListener('pastoral:daily-summary', (e) => summaries.push(e.detail));
    stages.length = 0;
    win.ApiEngine.processEndday = async () => { stages.push('endday'); return { ok: false, source: 'main', error: new Error('日结模型失败') }; };
    await win.Chat.handleUnifiedRequest('再次归寝', { kind: 'endday' });
    ok(stages.includes('settle') && stages.includes('enforce') && summaries.some((x) => x.updateOk === false && /日结模型失败/.test(x.updateError)), '额外 AI 失败时仍保留确定性结算并触发账簿');

    stages.length = 0;
    let resolveLateWrite;
    const lateWrite = new Promise((resolve) => { resolveLateWrite = resolve; });
    win.MVU.writeWithTimeout = async () => ({ ok: false, timedOut: true, error: new Error('MVU 写回超时'), pending: lateWrite });
    win.ApiEngine.processEndday = async () => { stages.push('endday-after-timeout'); return { ok: true, source: 'second', summary: '跨日更新完成' }; };
    win.MVU.enforceAndWrite = async () => { stages.push('final-write'); };
    await win.Chat.handleUnifiedRequest('写回卡住的归寝', { kind: 'endday' });
    ok(stages.includes('endday-after-timeout'), '首次 MVU 写回超时时仍继续调用归寝变量 API');
    ok(stages.filter((stage) => stage === 'final-write').length === 1, '首次写回超时后仍执行最终事实锁定写回');
    resolveLateWrite();
    await wait(0);
    ok(stages.filter((stage) => stage === 'final-write').length === 2, '迟到的首次写回完成后再次锁定确定性事实，避免覆盖最终结果');

    stages.length = 0;
    win.MVU.writeWithTimeout = async () => ({ ok: true });
    win.ApiEngine.processEndday = async () => ({ ok: true, source: 'second', summary: '变量成功' });
    win.MVU.enforceAndWrite = async () => { throw new Error('磁盘写回失败'); };
    await win.Chat.handleUnifiedRequest('最终写回失败的归寝', { kind: 'endday' });
    const finalFailure = summaries[summaries.length - 1];
    ok(finalFailure && finalFailure.updateOk === false && /最终 MVU 写回失败.*磁盘写回失败/.test(finalFailure.updateError), '最终事实写回失败不会报告归寝完整成功');
    ok(requestStatus.querySelector('[data-request-status-title]').textContent === '归寝部分完成' && !requestStatus.classList.contains('is-loading'), '最终写回失败显示非加载的部分完成状态');
    win.ApiEngine.processEndday = actualProcessEndday;
  }

  console.log('\n[5] 归寝日结按模式只运行规定次数');
  if (win.ApiEngine) {
    let rawCalls = 0, secondCalls = 0;
    win.Settings.load = () => ({ apiMode: 'single', variablePresets: { normal: { mode: 'none', context: {} }, endday: { mode: 'none', context: {} } }, secondApi: { url: '', key: '', model: '', timeout: 1000, maxRetries: 0 } });
    win.generate = async (config) => { rawCalls++; return '今日账簿已结清<UpdateVariable><Analysis>日期推进</Analysis><JSONPatch>[{"op":"delta","path":"/世界/时间/天数","value":1}]</JSONPatch></UpdateVariable>'; };
    win.getWorldbook = async () => [{ name: '目前待定', enabled: true, content: '规则' }];
    win.getCharWorldbookNames = () => ({ primary: '主书', additional: [] });
    win.getChatMessages = () => [{ message_id: 20, role: 'assistant', message: '归寝剧情' }];
    win.getLastMessageId = () => 20;
    win.MVU.latestMessageId = () => 20;
    win.MVU.getDataSnapshot = () => ({ stat_data: { beforeDaily: true } });
    win.Mvu.parseMessage = async () => ({ stat_data: { afterDaily: true } });
    win.Mvu.replaceMvuData = async () => {};
    win.setChatMessages = async () => {};
    const single = await win.ApiEngine.processEndday({ baseline: win.MVU.getDataSnapshot(), messageId: 20 });
    ok(rawCalls === 1 && single.ok && single.source === 'main', '单 API 归寝额外调用当前主 API 一次');
    ok(single.summary === '今日账簿已结清', '日结返回变量标签外的总结文本');

    win.Settings.load = () => ({ apiMode: 'multi', secondApi: { url: 'x', key: 'k', model: 'm', timeout: 1000, maxRetries: 0 } });
    win.ApiEngine.callSecondApiForVariable = async (context) => { secondCalls++; return { raw: '双轨日结' + secondTag, updateTag: secondTag, summary: '双轨日结', source: 'second', purpose: context.purpose }; };
    const multi = await win.ApiEngine.processEndday({ baseline: win.MVU.getDataSnapshot(), messageId: 20 });
    ok(secondCalls === 1 && multi.ok && multi.source === 'second', '多 API 归寝复用唯一一次副 API 调用');
    ok(rawCalls === 1, '多 API 成功时不再额外调用主 API 日结');

    let fallbackBaseline = null;
    win.ApiEngine.callSecondApiForVariable = async () => { throw new Error('second unavailable'); };
    win.MVU.getDataSnapshot = () => ({ stat_data: { afterMainStory: true } });
    win.Mvu.parseMessage = async (message, baseline) => { fallbackBaseline = baseline; return { stat_data: { afterDaily: true } }; };
    const fallback = await win.ApiEngine.processEndday({ baseline: { stat_data: { beforeMainStory: true } }, messageId: 20 });
    ok(fallback.ok && fallback.source === 'main' && rawCalls === 2, '副 API 失败时改用当前主 API 日结');
    ok(fallbackBaseline && fallbackBaseline.stat_data.afterMainStory === true, '主 API 日结降级从主剧情后的最新快照继续，不覆盖剧情变量');
  }

  await wait(0);
  console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
