// 下久保ダム貯水量ビューア — ローカル開発用サーバー（静的配信 + /api/dam プロキシ）
// 本番(Vercel)では public/ が静的配信され、/api/dam は api/dam.js が処理する。
// データ取得ロジックは lib/dam.js に集約。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { fetchDamData, fetchDamList } = require('./lib/dam');

const PORT = process.env.PORT || 3000;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

const sendJson = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/dam') {
    try {
      sendJson(res, 200, await fetchDamData(url.searchParams.get('ccd') || undefined));
    } catch (e) {
      sendJson(res, 502, { error: String(e.message || e) });
    }
    return;
  }
  if (url.pathname === '/api/dams') {
    try {
      const list = await fetchDamList();
      sendJson(res, 200, list.map(d => ({ ccd: d.ccd, name: d.name, river: d.river })));
    } catch (e) {
      sendJson(res, 502, { error: String(e.message || e) });
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
