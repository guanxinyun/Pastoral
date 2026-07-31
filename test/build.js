/* build.js · 静态部署产物测试 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rootOutput = path.join(root, 'index.html');
const publicOutput = path.join(root, 'public', 'index.html');

let failed = 0;
function ok(cond, label) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label);
  if (!cond) failed++;
}

console.log('\n[Build]');
ok(fs.existsSync(rootOutput), '根目录 index.html 已生成');
ok(fs.existsSync(publicOutput), 'Vercel 输出目录 public/index.html 已生成');

if (fs.existsSync(rootOutput) && fs.existsSync(publicOutput)) {
  const rootHtml = fs.readFileSync(rootOutput, 'utf8');
  const publicHtml = fs.readFileSync(publicOutput, 'utf8');
  ok(publicHtml === rootHtml, '根目录与 Vercel 构建产物完全一致');
}

console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
