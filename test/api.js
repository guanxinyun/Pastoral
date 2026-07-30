/* api.js · 双轨变量引擎测试 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let failed = 0;
function ok(cond, label) { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failed++; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n[1] UpdateVariable 标签工具');
  const dom = new JSDOM('<!doctype html><body><button id="composerSend"></button><textarea id="composerInput"></textarea><div id="toastStack"></div></body>', { runScripts: 'dangerously', url: 'http://localhost/' });
  const win = dom.window;
  win.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'extract.js'), 'utf8'));
  const raw = '<maintext>剧情</maintext><UpdateVariable>主更新</UpdateVariable><option>继续</option>';
  ok(win.Extract.extractUpdateVariable(raw) === '<UpdateVariable>主更新</UpdateVariable>', '提取完整 UpdateVariable 标签');
  const replaced = win.Extract.replaceUpdateVariable(raw, '<UpdateVariable>副更新</UpdateVariable>');
  ok(/剧情/.test(replaced) && /<option>继续<\/option>/.test(replaced) && /副更新/.test(replaced) && !/主更新/.test(replaced), '只替换变量标签，保留剧情与选项');

  console.log('\n[2] 第二 API 世界书、重试与配置');
  const apiPath = path.join(__dirname, '..', 'js', 'api.js');
  ok(fs.existsSync(apiPath), 'api.js 模块存在');
  if (fs.existsSync(apiPath)) {
    let attempts = 0;
    const configs = [];
    win.Settings = {
      load: () => ({ apiMode: 'multi', secondApi: { url: 'https://logic.example/v1', key: 'secret', model: 'logic-model', timeout: 1000, maxRetries: 2 } }),
      isSecondApiComplete: () => true
    };
    win.getCharWorldbookNames = () => ({ primary: '主书', additional: ['附书'] });
    win.getWorldbook = async (name) => name === '主书'
      ? [{ name: '目前待定', enabled: true, content: '变量规则 A' }]
      : [{ name: '目前待定', enabled: true, content: '变量规则 B' }];
    win.generateRaw = async (config) => {
      attempts++; configs.push(config);
      if (attempts < 3) throw new Error('temporary');
      return '计算完成<UpdateVariable>_.set("旅店.资金", 99)</UpdateVariable>';
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
    ok(/变量规则 A/.test(configs[0].user_input) && /变量规则 B/.test(configs[0].user_input), '读取角色卡绑定世界书的“目前待定”条目');
    ok(configs[0].ordered_prompts.length === 1 && configs[0].ordered_prompts[0] === 'user_input' && configs[0].max_chat_history === 0, 'generateRaw 使用隔离提示词配置');
    ok(configs[0].custom_api.apiurl === 'https://logic.example/v1' && configs[0].custom_api.source === 'openai', '传入 custom_api URL/model/source');
    ok(!/secret/.test(configs[0].user_input), 'API Key 不进入提示词');
    ok(result.updateTag.includes('旅店.资金'), '返回第二 API 的 UpdateVariable');
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
      raw: '总结<UpdateVariable>_.set("旅店.资金", 99)</UpdateVariable>',
      updateTag: '<UpdateVariable>_.set("旅店.资金", 99)</UpdateVariable>',
      summary: '总结', source: 'second'
    });
    const baseline = { stat_data: { 旅店: { 资金: 50 } } };
    const out = await win.ApiEngine.processAfterMain({ baseline, messageId: 10, purpose: 'normal' });
    ok(setCalls.length === 1 && /剧情/.test(setCalls[0][0].message) && /99/.test(setCalls[0][0].message) && !/主更新/.test(setCalls[0][0].message), '最新 AI 楼正文仅替换变量标签');
    ok(parseCalls.length === 1 && parseCalls[0].baseline === baseline, 'Mvu.parseMessage 使用主生成前快照');
    ok(replaceCalls.length === 1 && replaceCalls[0].options.message_id === 10, 'Mvu.replaceMvuData 回写目标最新楼层');
    ok(out.ok && out.source === 'second', '后处理返回成功来源');
  }

  console.log('\n[4] 统一发送在后处理期间锁定发送按钮');
  if (win.ApiEngine) {
    let latestId = 10, processed = 0, generationEnded = false, processedAfterEnd = false;
    const slash = [];
    const generationEvents = {};
    win.iframe_events = { GENERATION_STARTED: 'generation-started', GENERATION_ENDED: 'generation-ended' };
    win.tavern_events = { GENERATION_STOPPED: 'generation-stopped' };
    win.eventOn = (name, handler) => { generationEvents[name] = handler; };
    win.Settings.load = () => ({ apiMode: 'multi', secondApi: { url: 'x', key: 'k', model: 'm', timeout: 1000, maxRetries: 0 } });
    win.MVU.getDataSnapshot = () => ({ stat_data: { before: true } });
    win.MVU.latestMessageId = () => latestId;
    win.getLastMessageId = () => latestId;
    win.getChatMessages = (range) => [{ message_id: latestId, role: 'assistant', message: '完成' }];
    win.triggerSlash = async (cmd) => {
      slash.push(cmd);
      if (cmd === '/trigger') {
        if (generationEvents['generation-started']) generationEvents['generation-started']();
        latestId = 12;
        setTimeout(() => { generationEnded = true; if (generationEvents['generation-ended']) generationEvents['generation-ended']('完成'); }, 20);
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
    ok(slash.filter((x) => x === '/trigger').length === 1, '主模型只触发一次');
  }

  console.log('\n[5] 归寝日结按模式只运行规定次数');
  if (win.ApiEngine) {
    let rawCalls = 0, secondCalls = 0;
    win.Settings.load = () => ({ apiMode: 'single', secondApi: { url: '', key: '', model: '', timeout: 1000, maxRetries: 0 } });
    win.generateRaw = async (config) => { rawCalls++; return '今日账簿已结清<UpdateVariable>_.add("世界.时间.天数", 1)</UpdateVariable>'; };
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
    win.ApiEngine.callSecondApiForVariable = async (context) => { secondCalls++; return { raw: '双轨日结<UpdateVariable>x</UpdateVariable>', updateTag: '<UpdateVariable>x</UpdateVariable>', summary: '双轨日结', source: 'second', purpose: context.purpose }; };
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
