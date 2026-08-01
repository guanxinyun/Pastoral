/* staff.js · 全设备员工详情展开测试 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let failed = 0;
function ok(cond, label) { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failed++; }

(async () => {
  console.log('\n[Staff disclosure]');
  const dom = new JSDOM('<!doctype html><body><section class="panel" data-panel="staff"></section><div id="toastStack"></div></body>', {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/'
  });
  const win = dom.window;
  const doc = win.document;
  win.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  win.requestAnimationFrame = (cb) => cb(Date.now());
  win.Assets = { avatarUrl: async () => null, putStaffAvatar: async () => false, removeStaffAvatar: async () => false };
  win.Extract = { extractOptions: () => [] };
  win.MVU = { calculateFacilityGravity: () => ({}) };
  win.Chat = { compose() {} };
  ['icons.js', 'money.js', 'render.js'].forEach((name) => win.eval(fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8')));

  const employee = (salary, description) => ({
    属性: { 技艺: 2, 悟性: 3, 体力: 4, 亲和: 5, 专注: 6 },
    状态: { 精力: 80, 士气: 70, 忠诚度: 60 },
    职业信息: { 职业: '厨师', 阶级: 'T1', 日薪: salary },
    心之宝石: { 闪光圣岩: ['热忱'], 暗影原石: [] },
    技能: ['慢火'], 描述: description
  });
  const state = { 旅店: { 员工: { 甲: employee(123, '可靠'), 乙: employee(200, '沉稳') } } };
  win.Render.state = state;
  win.Render.panel('staff', state, true);

  let first = doc.querySelector('[data-staff-toggle="甲"]');
  let firstDetail = doc.querySelector('[data-staff-detail="甲"]');
  const second = doc.querySelector('[data-staff-toggle="乙"]');
  ok(first && first.tagName === 'BUTTON' && first.getAttribute('aria-expanded') === 'false', '员工摘要使用原生收起按钮');
  ok(firstDetail && firstDetail.hidden, '员工详情默认隐藏');
  if (first) first.click();
  ok(!!first && first.getAttribute('aria-expanded') === 'true' && firstDetail && !firstDetail.hidden, '点击展开员工详情');
  if (second) second.click();
  ok(!!first && !!second && first.getAttribute('aria-expanded') === 'true' && second.getAttribute('aria-expanded') === 'true', '员工详情可独立同时展开');

  win.Render.panel('staff', state, true);
  first = doc.querySelector('[data-staff-toggle="甲"]');
  firstDetail = doc.querySelector('[data-staff-detail="甲"]');
  ok(!!first && first.getAttribute('aria-expanded') === 'true' && firstDetail && !firstDetail.hidden, 'MVU 重绘后保持展开状态');
  ok(!!firstDetail && firstDetail.textContent.includes(win.Money.formatCopper(123)) && !firstDetail.textContent.includes('123 银'), '日薪使用统一铜币格式');
  ok(win.Render.expandedStaff && typeof win.Render.expandedStaff.has === 'function', '渲染器公开员工展开状态');

  if (first) first.click();
  ok(!!first && first.getAttribute('aria-expanded') === 'false' && firstDetail && firstDetail.hidden, '再次点击收起详情');

  console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
