/* icons.js · 系统预设、选择器契约与渲染映射测试 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let failed = 0;
function ok(cond, label) { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failed++; }

console.log('\n[Icons]');
const root = path.join(__dirname, '..');
const iconSource = fs.readFileSync(path.join(root, 'js', 'icons.js'), 'utf8');
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously' });
dom.window.eval(iconSource);
const catalog = dom.window.Icon.catalog ? dom.window.Icon.catalog() : [];
ok(Array.isArray(catalog) && catalog.length >= 60, '图标目录包含现有与新增预设');
const groups = new Set(catalog.map((x) => x.group));
ok(['地图', '作物', '农牧'].every((x) => groups.has(x)), '目录包含地图、作物与农牧分组');
ok(catalog.filter((x) => ['地图', '作物', '农牧'].includes(x.group)).length >= 30, '新增至少 30 个地图/作物/农牧预设');
ok(catalog.every((x) => x.name && x.label && Array.isArray(x.keywords)), '目录项提供名称、标签与关键词');

const pickerPath = path.join(root, 'js', 'icon-picker.js');
ok(fs.existsSync(pickerPath), 'icon-picker.js 模块存在');
if (fs.existsSync(pickerPath)) {
  const picker = fs.readFileSync(pickerPath, 'utf8');
  ok(/LONG_PRESS_MS\s*=\s*550/.test(picker) && /MOVE_TOLERANCE\s*=\s*12/.test(picker), '长按阈值为 550ms / 12px');
  ok(/contextmenu/.test(picker) && /Shift\+F10|shiftKey/.test(picker) && /ContextMenu/.test(picker), '支持右键和键盘上下文菜单');
  ok(/role[^\n]*dialog|role.*dialog/.test(picker) && /aria-modal/.test(picker), '选择器使用可访问对话框语义');
  ok(/data-icon-picker-tab/.test(picker) && /data-icon-upload/.test(picker), '选择器提供预设/个人库和上传入口');
  ok(/image\/png/.test(picker) && /image\/svg\+xml/.test(picker), '上传入口限制允许的图片 MIME');
  ok(/createElement\(['"]img['"]\)/.test(picker), '个人 SVG/图片只通过 img Blob URL 显示');
  ok(/pastoral:icons-changed/.test(picker), '绑定变化发出局部刷新事件');
  ok(/iconForceShared/.test(picker) && /value=\"shared\" checked/.test(picker), '资源图标可强制同名共享范围');
  ok(/scope === '资源'/.test(picker), '选择器支持资源预设范围');
}
const build = fs.readFileSync(path.join(root, 'build.js'), 'utf8');
ok(/'assets',\s*'icon-picker'/.test(build), '构建在 assets 后装入 icon-picker');
ok(/'icons',\s*'resource-icon'/.test(build) && /'resource-icon'[\s\S]*'render'/.test(build), '构建在 render 前装入 resource-icon');

const render = fs.readFileSync(path.join(root, 'js', 'render.js'), 'utf8');
ok(/map:\$\{x\},\$\{y\}/.test(render) && /map-name:/.test(render), '地图提供坐标与同名映射键');
ok(/farm:\$\{magic \? 'magic' : 'normal'\}/.test(render), '普通与魔法农田使用不同坐标键');
ok(/ResourceIcon\.key\(crop\)/.test(render) && /livestock:/.test(render), '作物使用统一资源键且畜牧保留独立映射键');
ok(/ResourceIcon\.markup\(name/.test(render) && /ResourceIcon\.materialMarkup/.test(render), '库存、种子与食谱材料接入同名资源图标');
ok(/IconPicker\.decorate/.test(render), '动态面板渲染后重新装饰图标');

console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
