/* money.js · 铜币基础单位格式化测试 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let failed = 0;
function ok(cond, label) { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failed++; }

console.log('\n[Money]');
const file = path.join(__dirname, '..', 'js', 'money.js');
ok(fs.existsSync(file), '共享货币模块存在');

if (fs.existsSync(file)) {
  const dom = new JSDOM('<!doctype html>', { runScripts: 'dangerously' });
  dom.window.eval(fs.readFileSync(file, 'utf8'));
  const format = dom.window.Money && dom.window.Money.formatCopper;
  ok(typeof format === 'function', '暴露 formatCopper');
  if (typeof format === 'function') {
    const cases = [
      [0, '0铜'], [99, '99铜'], [100, '1银'], [9999, '99银99铜'],
      [10000, '1金'], [50123, '5金1银23铜'], [50000, '5金'], [-10123, '−1金1银23铜']
    ];
    cases.forEach(([input, expected]) => ok(format(input) === expected, `${input} → ${expected}`));
    ok(format('无效') === '0铜', '无效值安全回退为 0 铜');
  }
}

console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
