/* ============================================================
   build.js · 模块化打包
   读取 src/template.html + css/* + js/* -> 内联自包含 index.html
   用法：node build.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const CSS = ['tokens', 'base', 'layout', 'components', 'animations'];
// host 必须最先：唯一宿主判定 + 跨域样式接管
const JS = ['host', 'icons', 'data', 'extract', 'settings', 'assets', 'mvu', 'api', 'chat', 'render', 'app'];

function read(p) {
  return fs.readFileSync(path.join(root, p), 'utf8');
}

function build() {
  const style = CSS.map((n) => `/* === ${n}.css === */\n` + read(`css/${n}.css`)).join('\n\n');
  const script = JS.map((n) => `/* === ${n}.js === */\n` + read(`js/${n}.js`)).join('\n\n');
  let tpl = read('src/template.html');

  if (!tpl.includes('<!--STYLE-->')) throw new Error('template 缺少 <!--STYLE--> 占位');
  if (!tpl.includes('<!--SCRIPT-->')) throw new Error('template 缺少 <!--SCRIPT--> 占位');

  // 用 split/join 替代 replace，避免 replace 的 $ 特殊替换模式吞掉 JS 中的 $$
  const styleTag = '<style>\n' + style + '\n</style>';
  const scriptTag = '<script>\n' + script + '\n</script>';
  tpl = tpl.split('<!--STYLE-->').join(styleTag);
  tpl = tpl.split('<!--SCRIPT-->').join(scriptTag);

  const publicDir = path.join(root, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), tpl);
  fs.writeFileSync(path.join(publicDir, 'index.html'), tpl);
  return tpl.length;
}

if (require.main === module) {
  const len = build();
  console.log(`[build] index.html + public/index.html 已生成 · ${len} 字节`);
}

module.exports = { build };
