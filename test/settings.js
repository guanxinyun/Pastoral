/* settings.js · mrfz_settings 兼容存储测试 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let failed = 0;
function ok(cond, label) { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failed++; }

const sourcePath = path.join(__dirname, '..', 'js', 'settings.js');
console.log('\n[Settings]');
ok(fs.existsSync(sourcePath), 'settings.js 模块存在');
if (fs.existsSync(sourcePath)) {
  const dom = new JSDOM('<!doctype html>', { runScripts: 'dangerously', url: 'http://localhost/' });
  const { window: win } = dom;
  win.localStorage.setItem('mrfz_settings', JSON.stringify({ legacy: 7, secondApi: { model: 'old-model' } }));
  win.eval(fs.readFileSync(sourcePath, 'utf8'));

  const cfg = win.Settings.load();
  ok(cfg.apiMode === 'single', '默认单 API 模式');
  ok(cfg.secondApi.timeout === 30000 && cfg.secondApi.maxRetries === 3, '默认超时 30000ms / 重试 3 次');
  ok(cfg.secondApi.model === 'old-model' && cfg.legacy === 7, '读取时保留旧字段并深度合并默认值');
  ok(cfg.prompts.normal === '' && cfg.prompts.endday === '', '普通更新与归寝提示词默认保持空字符串');
  ok(win.Settings.promptFor('normal', cfg) && win.Settings.promptFor('endday', cfg), '空提示词运行时回退程序内置默认值');
  ok(cfg.variablePresets.normal.mode === 'none' && cfg.variablePresets.endday.mode === 'none', '普通与归寝变量请求默认均不带预设');
  ok(Object.values(cfg.variablePresets.normal.context).every((value) => value === false), '无预设模式默认不携带任何酒馆上下文');

  win.Settings.save({ apiMode: 'multi', prompts: { normal: '玩家普通提示', endday: '玩家日结提示' }, secondApi: { url: 'https://api.example/v1', key: 'secret', model: 'logic' }, variablePresets: {
    normal: { mode: 'fixed', presetName: '变量专用', context: { chatHistory: true } },
    endday: { mode: 'current', presetName: '', context: { worldInfoBefore: true } }
  } });
  const saved = JSON.parse(win.localStorage.getItem('mrfz_settings'));
  ok(saved.legacy === 7 && saved.apiMode === 'multi', '保存时不覆盖未知旧字段');
  ok(saved.secondApi.timeout === 30000 && saved.secondApi.maxRetries === 3, '部分保存保留默认数值');
  ok(saved.prompts.normal === '玩家普通提示' && saved.prompts.endday === '玩家日结提示', '两类玩家提示词写入网页缓存');
  ok(win.Settings.promptFor('normal', saved) === '玩家普通提示' && win.Settings.promptFor('endday', saved) === '玩家日结提示', '非空提示词覆盖内置默认值');
  ok(saved.variablePresets.normal.mode === 'fixed' && saved.variablePresets.normal.presetName === '变量专用', '普通变量请求固定预设独立保存');
  ok(saved.variablePresets.endday.mode === 'current' && saved.variablePresets.endday.presetName === '', '归寝变量请求跟随当前预设独立保存');
  ok(saved.variablePresets.normal.context.chatHistory === true && saved.variablePresets.normal.context.worldInfoBefore === false, '普通上下文开关部分保存并补全默认值');
  ok(saved.variablePresets.endday.context.worldInfoBefore === true && saved.variablePresets.endday.context.chatHistory === false, '归寝上下文开关与普通阶段互不影响');
  const reset = win.Settings.save({ prompts: { normal: '', endday: '' } });
  ok(reset.prompts.normal === '' && reset.prompts.endday === '', '恢复默认只保存空字符串');
  ok(win.Settings.isSecondApiComplete(saved), '完整第二 API 配置通过校验');
  saved.secondApi.key = '';
  ok(!win.Settings.isSecondApiComplete(saved), '缺少 Key 时配置不完整');
  const malformed = win.Settings.normalize({ prompts: '旧版错误值', secondApi: '旧版错误值', variablePresets: {
    normal: { mode: '错误模式', presetName: 123, context: { chatHistory: 0, scenario: 'yes' } },
    endday: '旧版错误值'
  } });
  ok(malformed.prompts.normal === '' && malformed.secondApi.timeout === 30000, '损坏或旧版非对象设置安全回退默认结构');
  ok(malformed.variablePresets.normal.mode === 'none' && malformed.variablePresets.normal.presetName === '123', '非法预设模式回退 none 并规范化预设名');
  ok(malformed.variablePresets.normal.context.chatHistory === false && malformed.variablePresets.normal.context.scenario === true, '上下文开关规范化为布尔值');
  ok(malformed.variablePresets.endday.mode === 'none', '损坏的归寝预设设置回退默认结构');

  const rulesDom = new JSDOM('<!doctype html>', { runScripts: 'dangerously', url: 'http://localhost/' });
  rulesDom.window.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'rules.js'), 'utf8'));
  rulesDom.window.eval(fs.readFileSync(sourcePath, 'utf8'));
  const withRules = rulesDom.window.Settings;
  const emptyCfg = withRules.load();
  ok(withRules.builtinGuide('normal').includes('日常更新') && withRules.builtinGuide('endday').includes('归寝日结'), '内置指导按阶段提供日常与归寝两份');
  ok(withRules.builtinGuide('normal') !== withRules.builtinGuide('endday'), '两份内置指导内容互不相同');
  ok(withRules.promptFor('normal', emptyCfg) === withRules.builtinGuide('normal'), '未保存自定义时日常请求使用内置指导');
  ok(withRules.promptFor('endday', emptyCfg) === withRules.builtinGuide('endday'), '未保存自定义时归寝请求使用内置指导');
  const customCfg = withRules.save({ prompts: { normal: '我的日常规则' } });
  ok(withRules.promptFor('normal', customCfg) === '我的日常规则', '保存后的自定义指导被真正读取');
  ok(withRules.promptFor('endday', customCfg) === withRules.builtinGuide('endday'), '只改日常不影响归寝内置指导');
}

if (fs.existsSync(sourcePath)) {
  const dom = new JSDOM('<!doctype html>', { runScripts: 'dangerously', url: 'http://localhost/' });
  const { window: win } = dom;
  win.eval(fs.readFileSync(sourcePath, 'utf8'));
  const S = win.Settings;
  const fresh = S.normalize({});
  ok(fresh.variablePresets.normal.blockDepthEntries === true && fresh.variablePresets.endday.blockDepthEntries === true,
    '默认屏蔽世界书深度注入条目与作者注释');
  ok(fresh.variablePresets.normal.temperature === 0 && fresh.variablePresets.endday.temperature === 0, '默认采样温度为 0');
  const explicit = S.normalize({ variablePresets: {
    normal: { blockDepthEntries: false, temperature: 0.7 },
    endday: { blockDepthEntries: true, temperature: 9 }
  } });
  ok(explicit.variablePresets.normal.blockDepthEntries === false, '可显式放行深度注入条目');
  ok(explicit.variablePresets.normal.temperature === 0.7, '保留合法采样温度');
  ok(explicit.variablePresets.endday.temperature === 2, '越界采样温度收敛到上限 2');
  const broken = S.normalize({ variablePresets: { normal: { temperature: 'hot', blockDepthEntries: 'yes' } } });
  ok(broken.variablePresets.normal.temperature === 0, '非法温度归一化为 0');
  ok(broken.variablePresets.normal.blockDepthEntries === true, '非布尔屏蔽值归一化为默认屏蔽');
  const roundTrip = S.save({ variablePresets: { normal: { blockDepthEntries: false, temperature: 0.3 } } });
  ok(roundTrip.variablePresets.normal.blockDepthEntries === false && roundTrip.variablePresets.normal.temperature === 0.3,
    '两项新设置可持久化');
  ok(roundTrip.variablePresets.endday.blockDepthEntries === true, '只改普通阶段不影响归寝阶段');
  ok(S.load().variablePresets.normal.temperature === 0.3, '重新读取时温度保持已保存值');
}

if (fs.existsSync(sourcePath)) {
  const dom = new JSDOM('<!doctype html>', { runScripts: 'dangerously', url: 'http://localhost/' });
  const { window: win } = dom;
  win.localStorage.setItem('mrfz_settings', JSON.stringify({ 旧字段: '保留我' }));
  win.eval(fs.readFileSync(sourcePath, 'utf8'));
  const S = win.Settings;
  const fresh = S.normalize({});
  ok(fresh.variablePresets.normal.assembly === 'compile' && fresh.variablePresets.endday.assembly === 'compile',
    '默认组装方式为编译成消息列表');
  const chosen = S.normalize({ variablePresets: { normal: { assembly: 'inject' }, endday: { assembly: 'compile' } } });
  ok(chosen.variablePresets.normal.assembly === 'inject', '可选择保真注入组装');
  ok(chosen.variablePresets.endday.assembly === 'compile', '两阶段组装方式互不影响');
  const bogus = S.normalize({ variablePresets: { normal: { assembly: '乱填' }, endday: { assembly: 123 } } });
  ok(bogus.variablePresets.normal.assembly === 'compile' && bogus.variablePresets.endday.assembly === 'compile',
    '非法组装方式归一化为编译');
  const saved = S.save({ variablePresets: { endday: { assembly: 'inject' } } });
  ok(saved.variablePresets.endday.assembly === 'inject' && saved.variablePresets.normal.assembly === 'compile',
    '只改归寝组装方式不影响普通阶段');
  ok(S.load().variablePresets.endday.assembly === 'inject', '组装方式可持久化并重新读取');
  ok(S.load().旧字段 === '保留我', '新增字段不破坏未知旧字段兼容');
}


console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
