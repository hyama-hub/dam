// 下久保ダム貯水量ビューア — 静的配信 + データプロキシ
// データ出典: 埼玉県 川の防災情報 (https://suibo-river.pref.saitama.lg.jp/)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const CCD = '12331400006'; // 下久保ダム
const BASE = 'https://suibo-river.pref.saitama.lg.jp/hyoujidata/';
const CACHE_MS = 5 * 60 * 1000; // 観測は10分毎なので5分キャッシュ

// 簡易CSVパーサ（クォート内カンマ対応）
function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// "38,554千m3↑" → 38554 のような数値化
function num(s) {
  if (!s) return null;
  const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

let cache = null;
let cacheAt = 0;

async function fetchDamData() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;

  const [detailRes, tblRes] = await Promise.all([
    fetch(`${BASE}dam_detail_${CCD}.csv`),
    fetch(`${BASE}dam_detail_${CCD}_tbl24.csv`),
  ]);
  if (!detailRes.ok || !tblRes.ok) throw new Error('upstream fetch failed');

  const d = parseCsvLine((await detailRes.text()).trim().split('\n')[0]);
  // 列: 2=ダム名 4=水系河川 5=所在地 6=総貯水容量(千m3) 7=有効貯水容量(千m3)
  //     8=観測時刻(YYYYMMDDhhmm) 9=放流量 10=流入量 11=貯水位 12=貯水量(千m3)
  const t = d[8] || '';
  const observedAt = t.length === 12
    ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)} ${t.slice(8, 10)}:${t.slice(10, 12)}`
    : null;

  const series = (await tblRes.text()).trim().split('\n').map(line => {
    const c = parseCsvLine(line); // 時刻, 流入量, 放流量, 貯水位, 貯水量
    return {
      time: c[0],
      inflow: num(c[1]),
      outflow: num(c[2]),
      level: num(c[3]),
      storage: num(c[4]), // 千m3
    };
  });

  cache = {
    name: d[2],
    river: d[4],
    location: d[5],
    totalCapacity: num(d[6]),      // 千m3
    effectiveCapacity: num(d[7]),  // 千m3
    observedAt,
    outflow: num(d[9]),
    inflow: num(d[10]),
    level: num(d[11]),
    storage: num(d[12]),           // 千m3
    series,
    source: '埼玉県 川の防災情報',
  };
  cacheAt = Date.now();
  return cache;
}

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
