/* resource-icons.js · 同名资源图标与食谱材料解析测试 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously' });
const { window: win } = dom;
const sourcePath = path.join(root, 'js', 'resource-icon.js');
if (fs.existsSync(sourcePath)) win.eval(fs.readFileSync(sourcePath, 'utf8'));

let failed = 0;
function ok(cond, label) { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failed++; }

console.log('\n[Resource Icons]');
ok(!!win.ResourceIcon, 'ResourceIcon 模块存在');
if (win.ResourceIcon) {
  const R = win.ResourceIcon;
  ok(R.normalizeName('  晨露   麦粉 ') === '晨露 麦粉', '连续空白被规范化');
  ok(R.baseCropName(' 春小麦种子 ') === '春小麦', '种子后缀映射基础作物');
  ok(R.baseCropName('晨露麦粉') === '晨露麦粉', '非种子名称不模糊缩短');
  ok(R.key('春小麦种子') === 'resource:春小麦', '种子与作物共享资源键');
  ok(R.key('晨露麦粉') !== R.key('晨露麦'), '相似名称保持独立');

  const state = {
    旅店: { 库存: { 晨露麦粉: {}, 野山蜜: {}, 麦: {} } },
    农牧: {
      种子图鉴: { 春小麦种子: {}, 温感薄荷种子: {} },
      农田网格: { '0,0': { 作物: '春小麦' }, '1,0': { 作物: '晨露麦粉' } },
      魔法农田网格: { '0,0': { 作物: '温感薄荷' } }
    }
  };
  const names = R.knownNames(state);
  ok(['晨露麦粉', '野山蜜', '麦', '春小麦种子', '春小麦', '温感薄荷种子', '温感薄荷'].every((x) => names.includes(x)), '收集库存、种子与两类农田资源');
  ok(names.indexOf('晨露麦粉') < names.indexOf('麦'), '已知名称按最长优先');

  const source = '晨露麦粉、野山蜜、未知香料';
  const tokens = R.tokens(source, state);
  ok(tokens.map((x) => x.value).join('') === source, '材料拆分逐字保留原文');
  ok(tokens.filter((x) => x.type === 'resource').map((x) => x.value).join(',') === '晨露麦粉,野山蜜', '只识别精确已知资源');
  ok(tokens[0].type === 'resource' && tokens[0].value === '晨露麦粉', '重叠名称使用最长匹配');

  const markup = R.markup('晨露麦粉', { className: 'item-row__icon', label: '库存物品 晨露麦粉', group: '资源' });
  ok(/data-icon-target="resource:晨露麦粉"/.test(markup), '资源 markup 使用 target 共享键');
  ok(/data-icon-shared="resource:晨露麦粉"/.test(markup), '资源 markup 使用 shared 共享键');
  ok(/data-icon-force-shared="true"/.test(markup), '资源 markup 强制同名范围');
  ok(/data-icon-preset-group="资源"/.test(markup), '资源 markup 使用资源预设范围');
  ok(/<button[^>]*type="button"/.test(markup), '资源图标为语义按钮');

  const unsafe = R.markup('\"><script>x</script>', { label: '<bad>' });
  ok(!unsafe.includes('<script>') && unsafe.includes('&lt;script&gt;'), '名称和标签安全转义');
  const material = R.materialMarkup(source, state);
  ok(/recipe-materials/.test(material) && /resource:晨露麦粉/.test(material) && /未知香料/.test(material), '食谱材料生成图标化安全展示');
}

console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
