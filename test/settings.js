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
  ok(Object.values(cfg.variablePresets.normal.context).every((value) => value === true), '无预设模式默认保留全部游戏上下文占位符');

  win.Settings.save({ apiMode: 'multi', prompts: { normal: '玩家普通提示', endday: '玩家日结提示' }, secondApi: { url: 'https://api.example/v1', key: 'secret', model: 'logic' }, variablePresets: {
    normal: { mode: 'fixed', presetName: '变量专用', context: { chatHistory: false } },
    endday: { mode: 'current', presetName: '', context: { worldInfoBefore: false } }
  } });
  const saved = JSON.parse(win.localStorage.getItem('mrfz_settings'));
  ok(saved.legacy === 7 && saved.apiMode === 'multi', '保存时不覆盖未知旧字段');
  ok(saved.secondApi.timeout === 30000 && saved.secondApi.maxRetries === 3, '部分保存保留默认数值');
  ok(saved.prompts.normal === '玩家普通提示' && saved.prompts.endday === '玩家日结提示', '两类玩家提示词写入网页缓存');
  ok(win.Settings.promptFor('normal', saved) === '玩家普通提示' && win.Settings.promptFor('endday', saved) === '玩家日结提示', '非空提示词覆盖内置默认值');
  ok(saved.variablePresets.normal.mode === 'fixed' && saved.variablePresets.normal.presetName === '变量专用', '普通变量请求固定预设独立保存');
  ok(saved.variablePresets.endday.mode === 'current' && saved.variablePresets.endday.presetName === '', '归寝变量请求跟随当前预设独立保存');
  ok(saved.variablePresets.normal.context.chatHistory === false && saved.variablePresets.normal.context.worldInfoBefore === true, '普通上下文开关部分保存并补全默认值');
  ok(saved.variablePresets.endday.context.worldInfoBefore === false && saved.variablePresets.endday.context.chatHistory === true, '归寝上下文开关与普通阶段互不影响');
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
}


console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
