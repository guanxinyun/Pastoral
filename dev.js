/* ============================================================
   dev.js · Watch + 静态服务器（5501，CORS *）
   监听 css/ js/ src/ 变化自动重新打包；提供带 CORS 头的静态服务
   用法：node dev.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { build } = require('./build');

const root = __dirname;
const PORT = 5501;

/* ---- 打包 ---- */
function rebuild(log = true) {
  try {
    const len = build();
    if (log) console.log(`[dev] 重新打包 index.html · ${len} 字节 · ${new Date().toLocaleTimeString()}`);
  } catch (e) {
    console.error('[dev] 打包失败：', e.message);
  }
}

/* ---- 防抖监听 ---- */
function watchDir(dir) {
  let timer = null;
  fs.watch(path.join(root, dir), { recursive: true }, (evt, file) => {
    if (!file) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => rebuild(), 150);
  });
}
['css', 'js', 'src'].forEach(watchDir);

/* ---- 静态服务器（CORS *） ---- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.map': 'application/json'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  // 防目录穿越
  const fp = path.normalize(path.join(root, url));
  if (!fp.startsWith(root)) { res.writeHead(403); res.end('403'); return; }

  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not Found'); return; }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

// 首次打包
rebuild(false);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[dev] 静态服务已启动：http://localhost:${PORT}/  (CORS *)`);
  console.log(`[dev] 监听 css/ js/ src/ 变化自动重打包`);
  console.log(`[dev] 酒馆加载代码：`);
  console.log(`      <body><script>$('body').load('http://localhost:${PORT}/index.html')</script></body>`);
});
