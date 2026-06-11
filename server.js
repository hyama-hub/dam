// 下久保ダム貯水量ビューア — ローカル開発用サーバー（静的配信 + /api/dam プロキシ）
// 本番(Vercel)では public/ が静的配信され、/api/dam は api/dam.js が処理する。
// データ取得ロジックは lib/dam.js に集約。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { fetchDamData } = require('./lib/dam');

const PORT = process.env.PORT || 3000;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/dam') {
    try {
      const data = await fetchDamData();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
    return;
  }
  const file = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
