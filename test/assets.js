/* assets.js · 员工头像 IndexedDB 降级与 UI 测试 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let failed = 0;
function ok(cond, label) { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failed++; }

(async () => {
  console.log('\n[Assets]');
  const assetPath = path.join(__dirname, '..', 'js', 'assets.js');
  ok(fs.existsSync(assetPath), 'assets.js 模块存在');
  if (fs.existsSync(assetPath)) {
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously', url: 'http://localhost/' });
    const win = dom.window;
    win.eval(fs.readFileSync(assetPath, 'utf8'));
    ok(win.Assets.available() === false, 'IndexedDB 不可用时可检测并降级');
    const put = await win.Assets.putStaffAvatar('员工甲', new win.Blob(['x'], { type: 'image/png' }));
    ok(put === false, '无 IndexedDB 时保存失败但不抛出');
    ok(await win.Assets.getStaffAvatar('员工甲') === null, '无 IndexedDB 时读取返回 null');
    ok(win.Assets.staffKey('员工甲').endsWith('::员工甲'), '头像键包含员工名及作用域');
  }

  const render = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');
  ok(/data-avatar-upload/.test(render) && /accept="image\/\*"/.test(render), '员工卡提供 image/* 头像上传入口');
  ok(/data-avatar-remove/.test(render), '员工卡提供移除头像操作');

  console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
