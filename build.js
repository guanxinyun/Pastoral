/* ============================================================
   build.js · 模块化打包
   读取 src/template.html + css/* + js/* -> 内联自包含 index.html
   用法：node build.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const CSS = ['tokens', 'base', 'layout', 'components', 'animations'];
const JS = ['icons', 'data', 'extract', 'mvu', 'render', 'app'];

function read(p) {
  return fs.readFileSync(path.join(root, p), 'utf8');
}

function build() {
  const style = CSS.map((n) => `/* === ${n}.css === */\n` + read(`css/${n}.css`)).join('\n\n');
  const script = JS.map((n) => `/* === ${n}.js === */\n` + read(`js/${n}.js`)).join('\n\n');
  let tpl = read('src/template.html');

  if (!tpl.includes('<!--STYLE-->')) throw new Error('template 缺少 <!--STYLE--> 占位');
  if (!tpl.includes('<!--SCRIPT-->')) throw new Error('template 缺少 <!--SCRIPT--> 占位');

  tpl = tpl.replace('<!--STYLE-->', '<style>\n' + style + '\n</style>');
  tpl = tpl.replace('<!--SCRIPT-->', '<script>\n' + script + '\n</script>');

  fs.writeFileSync(path.join(root, 'index.html'), tpl);
  return tpl.length;
}

if (require.main === module) {
  const len = build();
  console.log(`[build] index.html 已生成 · ${len} 字节`);
}

module.exports = { build };
