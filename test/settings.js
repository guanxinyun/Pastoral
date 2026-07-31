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

  win.Settings.save({ apiMode: 'multi', prompts: { normal: '玩家普通提示', endday: '玩家日结提示' }, secondApi: { url: 'https://api.example/v1', key: 'secret', model: 'logic' } });
  const saved = JSON.parse(win.localStorage.getItem('mrfz_settings'));
  ok(saved.legacy === 7 && saved.apiMode === 'multi', '保存时不覆盖未知旧字段');
  ok(saved.secondApi.timeout === 30000 && saved.secondApi.maxRetries === 3, '部分保存保留默认数值');
  ok(saved.prompts.normal === '玩家普通提示' && saved.prompts.endday === '玩家日结提示', '两类玩家提示词写入网页缓存');
  ok(win.Settings.promptFor('normal', saved) === '玩家普通提示' && win.Settings.promptFor('endday', saved) === '玩家日结提示', '非空提示词覆盖内置默认值');
  const reset = win.Settings.save({ prompts: { normal: '', endday: '' } });
  ok(reset.prompts.normal === '' && reset.prompts.endday === '', '恢复默认只保存空字符串');
  ok(win.Settings.isSecondApiComplete(saved), '完整第二 API 配置通过校验');
  saved.secondApi.key = '';
  ok(!win.Settings.isSecondApiComplete(saved), '缺少 Key 时配置不完整');
  const malformed = win.Settings.normalize({ prompts: '旧版错误值', secondApi: '旧版错误值' });
  ok(malformed.prompts.normal === '' && malformed.secondApi.timeout === 30000, '损坏或旧版非对象设置安全回退默认结构');
}


console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
