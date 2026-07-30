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

  win.Settings.save({ apiMode: 'multi', secondApi: { url: 'https://api.example/v1', key: 'secret', model: 'logic' } });
  const saved = JSON.parse(win.localStorage.getItem('mrfz_settings'));
  ok(saved.legacy === 7 && saved.apiMode === 'multi', '保存时不覆盖未知旧字段');
  ok(saved.secondApi.timeout === 30000 && saved.secondApi.maxRetries === 3, '部分保存保留默认数值');
  ok(win.Settings.isSecondApiComplete(saved), '完整第二 API 配置通过校验');
  saved.secondApi.key = '';
  ok(!win.Settings.isSecondApiComplete(saved), '缺少 Key 时配置不完整');
}


console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
