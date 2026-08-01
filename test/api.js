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

  console.log('\n[1b] 格式救援：只补格式，不编造内容');
  ok(win.Extract.salvageUpdateVariable('```xml\n' + secondTag + '\n```') === secondTag, '剥离 Markdown 代码围栏后接受标签');
  const noAnalysis = win.Extract.salvageUpdateVariable('<UpdateVariable><JSONPatch>[{"op":"delta","path":"/旅店/资金","value":5}]</JSONPatch></UpdateVariable>');
  ok(/<Analysis>/.test(noAnalysis) && /"value":5/.test(noAnalysis), '缺 Analysis 时补占位并保留原操作');
  const bareArray = win.Extract.salvageUpdateVariable('这是结果：\n[{"op":"replace","path":"/旅店/资金","value":7}]');
  ok(/<UpdateVariable>/.test(bareArray) && /"value":7/.test(bareArray), '裸 JSON 数组能救成合法标签');
  ok(win.Extract.salvageUpdateVariable('完全没有任何补丁内容') === '', '无补丁内容时不伪造更新');
  ok(win.Extract.salvageUpdateVariable('[{"op":"delta","path":"/a","value":"字符串"}]') === '', '救援后仍按原规则拒绝非法操作');
  ok(win.Extract.salvageUpdateVariable('[{"op":"replace","path":"/_只读","value":1}]') === '', '救援不绕过只读路径保护');

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

  console.log('\n[3] 第二 API 内置指导、重试与配置');
  const apiPath = path.join(__dirname, '..', 'js', 'api.js');
  ok(fs.existsSync(apiPath), 'api.js 模块存在');
  if (fs.existsSync(apiPath)) {
    let attempts = 0;
    const configs = [], createdPresets = [], rawConfigs = [];
    const noContext = {
      worldInfoBefore: false, personaDescription: false, charDescription: false, charPersonality: false,
      scenario: false, worldInfoAfter: false, dialogueExamples: false, chatHistory: false
    };
    const allContext = {
      worldInfoBefore: true, personaDescription: true, charDescription: true, charPersonality: true,
      scenario: true, worldInfoAfter: true, dialogueExamples: true, chatHistory: true
    };
    let settingsState = {
      apiMode: 'multi', prompts: { normal: '玩家普通变量要求', endday: '玩家归寝要求' },
      variablePresets: {
        normal: { mode: 'none', presetName: '', context: Object.assign({}, noContext) },
        endday: { mode: 'current', presetName: '', context: Object.assign({}, noContext) }
      },
      secondApi: { url: 'https://logic.example/v1', key: 'secret', model: 'logic-model', timeout: 1000, maxRetries: 2 }
    };
    win.Rules = {
      DEFAULT_GUIDE: { normal: '内置日常指导', endday: '内置归寝指导' },
      defaultGuide: (kind) => (kind === 'endday' ? '内置归寝指导' : '内置日常指导'),
      outputFormat: () => '内置输出格式：JSONPatch'
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
    win.getPresetNames = () => ['剧情预设', '变量专用', '【Pastoral 内部】空白变量更新'];
    win.createOrReplacePreset = async (name, preset, options) => { createdPresets.push({ name, preset, options }); return true; };
    const okReply = '计算完成<UpdateVariable><Analysis>资金变化</Analysis><JSONPatch>[{"op":"replace","path":"/旅店/资金","value":99}]</JSONPatch></UpdateVariable>';
    win.generate = async (config) => {
      attempts++; configs.push(config);
      if (attempts < 3) throw new Error('temporary');
      return okReply;
    };
    win.generateRaw = async (config) => {
      attempts++; rawConfigs.push(config);
      if (attempts < 3) throw new Error('temporary');
      return okReply;
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

    console.log('\n[3a] 阶段快照与固定预设短事务');
    const splitSettings = {
      apiMode: 'multi',
      prompts: { normal: 'NORMAL_GUIDE_A', endday: 'ENDDAY_GUIDE_B' },
      variablePresets: {
        normal: { mode: 'fixed', presetName: '日常A', context: { chatHistory: true }, temperature: 0.1 },
        endday: { mode: 'fixed', presetName: '归寝B', context: { chatHistory: false }, temperature: 0.3 }
      },
      secondApi: settingsState.secondApi
    };
    const normalSnapshot = win.ApiEngine.createStageSnapshot('normal', splitSettings);
    const enddaySnapshot = win.ApiEngine.createStageSnapshot('endday', splitSettings);
    ok(Object.isFrozen(normalSnapshot) && Object.isFrozen(normalSnapshot.context), '阶段快照及上下文不可变');
    ok(normalSnapshot.kind === 'normal' && normalSnapshot.presetName === '日常A' && normalSnapshot.guide === 'NORMAL_GUIDE_A',
      '日常快照只读取日常设置');
    ok(enddaySnapshot.kind === 'endday' && enddaySnapshot.presetName === '归寝B' && enddaySnapshot.guide === 'ENDDAY_GUIDE_B',
      '归寝快照只读取归寝设置');

    const transactionEvents = [];
    let activePreset = '玩家当前预设';
    const livePreset = { settings: { temperature: 0.77 }, prompts: [{ id: 'live-edit', enabled: true, role: 'system', content: '尚未保存的现场编辑' }], prompts_unused: [], extensions: {} };
    const networkResolvers = [];
    win.getLoadedPresetName = () => { transactionEvents.push('get-name:' + activePreset); return activePreset; };
    win.getPreset = (name) => {
      transactionEvents.push('get-preset:' + name);
      return name === 'in_use' ? livePreset : { settings: {}, prompts: [], prompts_unused: [], extensions: {} };
    };
    win.loadPreset = (name) => { transactionEvents.push('load:' + name); activePreset = name; return true; };
    const restoredLive = [];
    win.replacePreset = async (name, preset, options) => {
      transactionEvents.push('replace:' + name + ':' + options.render);
      restoredLive.push(preset);
    };
    win.generate = (config) => {
      transactionEvents.push('generate:' + activePreset + ':' + config.user_input);
      return new Promise((resolve) => networkResolvers.push(resolve));
    };

    const firstNetwork = win.ApiEngine.launchWithFixedPreset('日常A', { user_input: 'TASK_A' });
    await wait(0);
    ok(transactionEvents.join('>') === [
      'get-name:玩家当前预设', 'get-preset:in_use', 'load:日常A', 'generate:日常A:TASK_A',
      'load:玩家当前预设', 'replace:in_use:none'
    ].join('>'), '固定预设严格执行保存现场→切换→发起→立即恢复');
    ok(activePreset === '玩家当前预设' && restoredLive.length === 1
      && restoredLive[0] !== livePreset && restoredLive[0].prompts[0].content === '尚未保存的现场编辑',
    '原预设名称与未保存 in_use 现场均已恢复');

    transactionEvents.length = 0;
    const secondNetwork = win.ApiEngine.launchWithFixedPreset('归寝B', { user_input: 'TASK_B' });
    await wait(0);
    ok(transactionEvents.includes('generate:归寝B:TASK_B'), '首个网络响应未完成时第二个短事务仍能发起');
    ok(activePreset === '玩家当前预设', '第二个短事务也在网络完成前恢复预设');
    networkResolvers[0]('FIRST_OK'); networkResolvers[1]('SECOND_OK');
    ok((await firstNetwork) === 'FIRST_OK' && (await secondNetwork) === 'SECOND_OK', '网络 Promise 在短锁外并发等待并各自返回');

    transactionEvents.length = 0;
    win.generate = () => { transactionEvents.push('generate-throw'); throw new Error('sync launch error'); };
    let syncFailure = null;
    try { await win.ApiEngine.launchWithFixedPreset('日常A', { user_input: 'FAIL' }); }
    catch (e) { syncFailure = e; }
    ok(syncFailure && /sync launch error/.test(syncFailure.message), 'generate 同步抛错向调用方报告');
    ok(transactionEvents.includes('load:玩家当前预设') && transactionEvents.includes('replace:in_use:none'),
      'generate 同步抛错后仍恢复原预设与现场');

    // 恢复本节后续测试需要的生成桩。
    win.generate = async (config) => {
      attempts++; configs.push(config);
      if (attempts < 3) throw new Error('temporary');
      return okReply;
    };
    win.getPreset = (name) => name === 'in_use' ? livePreset : { settings: {}, prompts: [], prompts_unused: [], extensions: {} };

    const result = await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'normal' });
    ok(attempts === 3, '失败后按 maxRetries=2 共尝试 3 次');
    ok(configs.length === 0 && rawConfigs.length === 3, 'none 模式全程只用 generateRaw，不经过任何酒馆预设');
    ok(typeof win.getWorldbook === 'undefined' && typeof win.getCharWorldbookNames === 'undefined', '变量请求不再依赖世界书接口');
    ok(/玩家普通变量要求/.test(rawConfigs[0].user_input), '普通请求使用玩家保存的自定义指导');
    ok(/内置输出格式：JSONPatch/.test(rawConfigs[0].user_input), '提示词自动合并内置变量更新输出格式');
    ok(JSON.stringify(rawConfigs[0].ordered_prompts) === JSON.stringify(['user_input']), '未勾选上下文时只发送本项目提示');
    ok(rawConfigs[0].max_chat_history === 0, 'none 模式不额外携带聊天历史');
    const promptWithFacts = win.ApiEngine.buildPrompt({ purpose: 'endday', baseline: { stat_data: {} }, calculated: { facilityGravity: { 美食: 7 }, salary: 200, maintenance: 30 } });
    ok(/玩家归寝要求/.test(promptWithFacts) && /美食/.test(promptWithFacts) && /200/.test(promptWithFacts) && /30/.test(promptWithFacts), '归寝提示包含自定义要求与脚本确定事实');
    ok(/当前阶段：归寝日结/.test(promptWithFacts) && /基础单位是整数铜币/.test(promptWithFacts) && /<JSONPatch>/.test(promptWithFacts) && /不得覆盖脚本已确定事实/.test(promptWithFacts), '提示明确阶段、铜币、JSON Patch 与防重复约束');
    ok(!/内置日常指导/.test(promptWithFacts), '归寝提示不混入日常阶段指导');
    const builtinPrompt = win.ApiEngine.buildPrompt({ purpose: 'normal', baseline: { stat_data: {} }, config: { prompts: {} } });
    ok(/内置日常指导/.test(builtinPrompt) && /内置输出格式/.test(builtinPrompt), '未自定义时回退内置日常指导并附输出格式');
    ok(rawConfigs[0].custom_api.apiurl === 'https://logic.example/v1' && rawConfigs[0].custom_api.source === 'openai', '传入 custom_api URL/model/source');
    ok(!/secret/.test(rawConfigs[0].user_input), 'API Key 不进入提示词');
    ok(result.updateTag.includes('/旅店/资金') && result.updateTag.includes('<JSONPatch>'), '返回第二 API 的 JSON Patch UpdateVariable');
    ok(createdPresets.length === 0, '不再向玩家预设列表写入内部空白预设');
    ok(!win.ApiEngine.availablePresetNames().includes('【Pastoral 内部】空白变量更新'), '遗留内部预设不出现在可选列表中');

    // 酒馆默认 with_depth_entries=true，会把世界书按深度注入条目和作者注释带进任何请求。
    const firstOverrides = rawConfigs[0].overrides || {};
    ok(firstOverrides.chat_history && firstOverrides.chat_history.with_depth_entries === false,
      'none 模式屏蔽世界书按深度注入的条目');
    ok(firstOverrides.chat_history && firstOverrides.chat_history.author_note === '', 'none 模式清空作者注释');
    ok(JSON.stringify(firstOverrides.chat_history.prompts) === '[]', '未勾选聊天历史时聊天历史被清空');
    ok(firstOverrides.char_description === '' && firstOverrides.world_info_before === '' && firstOverrides.world_info_after === ''
      && firstOverrides.persona_description === '' && firstOverrides.scenario === '' && firstOverrides.char_personality === ''
      && firstOverrides.dialogue_examples === '', 'none 模式清空全部未勾选占位符，杜绝角色卡与世界书残留');
    ok(rawConfigs[0].custom_api.temperature === 0 && rawConfigs[0].custom_api.top_p === 'unset'
      && rawConfigs[0].custom_api.frequency_penalty === 'unset' && rawConfigs[0].custom_api.presence_penalty === 'unset',
      '变量请求不继承剧情预设的采样参数');

    settingsState.variablePresets.normal = { mode: 'none', presetName: '', context: Object.assign({}, noContext, { chatHistory: true, charDescription: true }) };
    rawConfigs.length = 0; attempts = 2;
    await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'normal' });
    ok(JSON.stringify(rawConfigs[0].ordered_prompts) === JSON.stringify(['char_description', 'chat_history', 'user_input']), '勾选的上下文按酒馆默认顺序追加');
    const pickedOverrides = rawConfigs[0].overrides || {};
    ok(pickedOverrides.char_description === undefined && pickedOverrides.chat_history.prompts === undefined,
      '勾选的上下文不被清空');
    ok(pickedOverrides.chat_history.with_depth_entries === false, '即使勾选聊天历史也仍屏蔽深度注入条目');

    // 以下预设模式断言针对 inject（保真）策略；compile 策略在 [3b] 单独覆盖。
    settingsState.variablePresets.endday = { mode: 'current', presetName: '', assembly: 'inject', context: allContext };
    configs.length = 0; rawConfigs.length = 0; attempts = 2;
    await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'endday' });
    ok(configs[0].preset_name === 'in_use' && rawConfigs.length === 0, '归寝 current 模式跟随酒馆当前预设');
    ok(configs[0].overrides && configs[0].overrides.chat_history.with_depth_entries === false,
      'current 模式也屏蔽世界书深度注入条目');
    ok(configs[0].overrides.char_description === undefined, 'current 模式不清空预设自身要用的占位符');
    settingsState.variablePresets.endday = { mode: 'current', presetName: '', assembly: 'inject', context: allContext, blockDepthEntries: false };
    configs.length = 0; attempts = 2;
    await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'endday' });
    ok(!configs[0].overrides || !configs[0].overrides.chat_history, '取消勾选屏蔽后放行深度注入与作者注释');
    settingsState.variablePresets.endday = { mode: 'current', presetName: '', assembly: 'inject', context: allContext };
    settingsState.variablePresets.normal = { mode: 'fixed', presetName: '变量专用', assembly: 'inject', context: allContext };
    configs.length = 0; attempts = 2;
    await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'normal' });
    ok(configs[0].preset_name === '变量专用', '普通 fixed 模式使用玩家指定预设');
    settingsState.variablePresets.normal = { mode: 'fixed', presetName: '已删除预设', assembly: 'inject', context: Object.assign({}, noContext) };
    configs.length = 0; rawConfigs.length = 0; attempts = 2;
    await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'normal' });
    ok(configs.length === 0 && JSON.stringify(rawConfigs[0].ordered_prompts) === JSON.stringify(['user_input']), '固定预设不存在时本次降级为真正的不带预设');

    console.log('\n[3b] 预设编译器：任务消息必须送达');
    // 关键：预设的占位符 id 枚举里没有 user_input（_types_split/09-preset.txt 出现 0 次），
    // 所以 generate({preset_name, user_input}) 无法保证前端指导进入请求。
    win.getPreset = (name) => {
      if (name === '无历史块预设') {
        return {
          settings: { temperature: 1.5, squash_system_messages: true },
          prompts: [
            { id: 'main', name: '主提示', enabled: true, role: 'system', content: '你是角色扮演助手' },
            { id: 'jailbreak', name: '越狱', enabled: true, role: 'system', content: '越狱内容' },
            { id: 'charDescription', name: '角色描述', enabled: true, role: 'system', position: { type: 'relative' } },
            { id: '已禁用', name: '禁用条目', enabled: false, role: 'system', content: '不应出现' },
            { id: '空内容', name: '空条目', enabled: true, role: 'system', content: '   ' }
          ],
          prompts_unused: [{ id: 'unused', name: '未用', enabled: true, role: 'system', content: '也不应出现' }],
          extensions: {}
        };
      }
      return {
        settings: {},
        prompts: [
          { id: 'main', name: '主提示', enabled: true, role: 'system', content: '当前预设主提示' },
          { id: 'worldInfoBefore', name: '世界书前', enabled: true, role: 'system', position: { type: 'relative' } },
          { id: 'chatHistory', name: '聊天历史', enabled: true, role: 'system', position: { type: 'relative' } },
          { id: '深度条目', name: '深度注入条目', enabled: true, role: 'user', content: '深度内容', position: { type: 'in_chat', depth: 2, order: 1 } }
        ],
        prompts_unused: [],
        extensions: {}
      };
    };
    win.getPresetNames = () => ['剧情预设', '变量专用', '无历史块预设', '【Pastoral 内部】空白变量更新'];

    const compiled = win.ApiEngine.compilePreset('无历史块预设', { context: allContext }, '任务消息内容');
    ok(Array.isArray(compiled) && compiled.length > 0, '编译器返回消息列表');
    const lastEntry = compiled[compiled.length - 1];
    ok(lastEntry && lastEntry.role === 'user' && lastEntry.content === '任务消息内容',
      '预设没有 chatHistory 条目时任务消息仍在末位送达');
    ok(compiled.some((x) => x && x.content === '你是角色扮演助手'), '保留预设启用的系统提示词');
    ok(!compiled.some((x) => x && /不应出现/.test(String(x.content || ''))), '跳过 enabled=false 条目');
    ok(!compiled.some((x) => x && /也不应出现/.test(String(x.content || ''))), '跳过 prompts_unused 条目');
    ok(!compiled.some((x) => x && typeof x === 'object' && String(x.content || '').trim() === ''), '跳过空内容条目');
    ok(compiled.includes('char_description'), '占位符条目映射为 generateRaw 占位符');
    ok(compiled.indexOf('char_description') < compiled.length - 1, '占位符位于任务消息之前');

    const filtered = win.ApiEngine.compilePreset('无历史块预设', { context: Object.assign({}, noContext) }, '任务');
    ok(!filtered.includes('char_description'), '取消勾选的占位符即使预设启用也被过滤');
    ok(filtered[filtered.length - 1].content === '任务', '过滤占位符后任务消息仍在末位');

    const ordered = win.ApiEngine.compilePreset('剧情预设', { context: allContext }, '任务');
    ok(ordered.indexOf('world_info_before') < ordered.indexOf('chat_history'), '占位符保持预设原顺序');
    ok(ordered[ordered.length - 1].content === '任务', '含 chatHistory 的预设任务消息同样在末位');

    settingsState.variablePresets.normal = { mode: 'fixed', presetName: '无历史块预设', assembly: 'compile', context: Object.assign({}, noContext) };
    configs.length = 0; rawConfigs.length = 0; attempts = 2;
    await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'normal' });
    ok(configs.length === 0 && rawConfigs.length === 1, 'compile 模式走 generateRaw 而非 generate');
    const compiledPrompts = rawConfigs[0].ordered_prompts;
    const compiledTask = compiledPrompts[compiledPrompts.length - 1];
    ok(compiledTask && /玩家普通变量要求/.test(compiledTask.content), 'compile 模式任务消息含前端保存的指导');
    ok(/内置输出格式：JSONPatch/.test(compiledTask.content), 'compile 模式任务消息含输出格式');
    ok(!compiledPrompts.includes('user_input'), 'compile 模式不依赖 user_input 占位符');

    settingsState.variablePresets.normal = { mode: 'fixed', presetName: '无历史块预设', assembly: 'inject', context: Object.assign({}, noContext) };
    configs.length = 0; rawConfigs.length = 0; attempts = 2;
    await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'normal' });
    ok(configs.length === 1 && rawConfigs.length === 0, 'inject 模式走 generate 保真路径');
    ok(configs[0].preset_name === '无历史块预设', 'inject 模式传入所选预设名');
    const injected = (configs[0].injects || [])[0];
    ok(injected && /玩家普通变量要求/.test(injected.content), 'inject 模式任务消息经 injects 送入');
    ok(injected && injected.position === 'in_chat' && injected.depth === 0, 'inject 落点为聊天区最深处');
    ok(injected && injected.should_scan === false, 'inject 任务文本不参与世界书绿灯扫描');
    ok(configs[0].max_chat_history !== 0, 'inject 模式不再把聊天历史截断为 0');

    let repairPrompts = [];
    settingsState.variablePresets.normal = { mode: 'fixed', presetName: '无历史块预设', assembly: 'compile', context: Object.assign({}, noContext) };
    rawConfigs.length = 0;
    win.generateRaw = async (config) => {
      rawConfigs.push(config);
      repairPrompts.push(config.ordered_prompts[config.ordered_prompts.length - 1].content);
      return rawConfigs.length === 1 ? '完全没有标签' : okReply;
    };
    await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'normal' });
    ok(repairPrompts.length === 2 && /玩家普通变量要求/.test(repairPrompts[1]) && /只需修正格式/.test(repairPrompts[1]),
      'compile 模式格式纠正仍携带完整任务消息');

    let injectRepairs = [];
    settingsState.variablePresets.normal = { mode: 'fixed', presetName: '无历史块预设', assembly: 'inject', context: Object.assign({}, noContext) };
    configs.length = 0;
    win.generate = async (config) => {
      configs.push(config);
      injectRepairs.push((config.injects || [])[0].content);
      return configs.length === 1 ? '完全没有标签' : okReply;
    };
    await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'normal' });
    ok(injectRepairs.length === 2 && /玩家普通变量要求/.test(injectRepairs[1]) && /只需修正格式/.test(injectRepairs[1]),
      'inject 模式格式纠正仍携带完整任务消息');
    ok(createdPresets.length === 0, '变量请求不创建或覆盖任何酒馆预设');

    win.generate = async (config) => { attempts++; configs.push(config); return attempts < 3 ? Promise.reject(new Error('temporary')) : okReply; };
    win.generateRaw = async (config) => { attempts++; rawConfigs.push(config); return attempts < 3 ? Promise.reject(new Error('temporary')) : okReply; };

    const statusEvents = [];
    win.addEventListener('pastoral:api-status', (e) => statusEvents.push(e.detail));
    let testConfig = null;
    settingsState.variablePresets.normal = { mode: 'current', presetName: '', assembly: 'inject', context: allContext };
    win.generate = async (config) => { testConfig = config; return 'PASTORAL_API_OK'; };
    const tested = await win.ApiEngine.testSecondApi({ url: 'https://probe.example/v1', key: 'probe-secret', model: 'probe-model', timeout: 1000 });
    ok(tested.ok && tested.target === 'probe.example', '第二 API 连接测试返回目标主机与成功结果');
    ok(testConfig && testConfig.preset_name === 'in_use', '连接测试复用普通变量请求的预设策略');

    let noPresetConfig = null;
    settingsState.variablePresets.normal = { mode: 'none', presetName: '', context: Object.assign({}, noContext) };
    win.generate = async () => { throw new Error('none 模式不得调用 generate'); };
    win.generateRaw = async (config) => {
      noPresetConfig = config;
      return '<UpdateVariable><Analysis>不带预设</Analysis><JSONPatch>[]</JSONPatch></UpdateVariable>';
    };
    const noPreset = await win.ApiEngine.callSecondApiForVariable({ baseline: win.MVU.getDataSnapshot(), purpose: 'normal' });
    ok(noPreset.updateTag && noPresetConfig && JSON.stringify(noPresetConfig.ordered_prompts) === JSON.stringify(['user_input']), 'none 模式即使 generate 可用也只走 generateRaw 最小路径');

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
    const singleConfig = { apiMode: 'single', prompts: { normal: '', endday: '' }, variablePresets: { normal: { mode: 'none', context: {} }, endday: { mode: 'none', context: {} } }, secondApi: { url: '', key: '', model: '', timeout: 1000, maxRetries: 0 } };
    win.Settings.load = () => singleConfig;
    const enddayReply = '今日账簿已结清<UpdateVariable><Analysis>日期推进</Analysis><JSONPatch>[{"op":"delta","path":"/世界/时间/天数","value":1}]</JSONPatch></UpdateVariable>';
    win.generate = async () => { rawCalls++; return enddayReply; };
    win.generateRaw = async () => { rawCalls++; return enddayReply; };
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

    let singleBaseline = null;
    win.MVU.getDataSnapshot = () => ({ stat_data: { afterMainStory: true } });
    win.Mvu.parseMessage = async (message, baseline) => { singleBaseline = baseline; return { stat_data: { afterDaily: true } }; };
    await win.ApiEngine.processEndday({ baseline: { stat_data: { beforeMainStory: true } }, messageId: 20 });
    ok(singleBaseline && singleBaseline.stat_data.afterMainStory === true, '单 API 日结从主剧情后的最新快照继续，不覆盖剧情变量');

    rawCalls = 0;
    win.Settings.load = () => ({ apiMode: 'multi', prompts: { normal: '', endday: '' }, variablePresets: { normal: { mode: 'none', context: {} }, endday: { mode: 'none', context: {} } }, secondApi: { url: 'x', key: 'k', model: 'm', timeout: 1000, maxRetries: 0 } });
    win.ApiEngine.callSecondApiForVariable = async (context) => { secondCalls++; return { raw: '双轨日结' + secondTag, updateTag: secondTag, summary: '双轨日结', source: 'second', purpose: context.purpose }; };
    const multi = await win.ApiEngine.processEndday({ baseline: win.MVU.getDataSnapshot(), messageId: 20 });
    ok(secondCalls === 1 && multi.ok && multi.source === 'second', '多 API 归寝复用唯一一次副 API 调用');
    ok(rawCalls === 0, '多 API 成功时不再额外调用主 API 日结');

    win.ApiEngine.callSecondApiForVariable = async () => { throw new Error('second unavailable'); };
    const secondFailure = await win.ApiEngine.processEndday({ baseline: { stat_data: { beforeMainStory: true } }, messageId: 20 });
    ok(!secondFailure.ok && secondFailure.source === 'second' && /second unavailable/.test(String(secondFailure.error && secondFailure.error.message)), '多 API 归寝失败时明确报告第二 API 失败');
    ok(rawCalls === 0, '多 API 归寝失败时不静默改用主 API');
    ok(win.ApiEngine.lastFailure && win.ApiEngine.lastFailure.purpose === 'endday', '失败的归寝请求登记为可重试');
  }

  await wait(0);
  console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
