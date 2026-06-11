// 埼玉県ダムのデータ取得ロジック（ローカルserver.jsとVercel関数で共用）
// データ出典: 埼玉県 川の防災情報 (https://suibo-river.pref.saitama.lg.jp/)

const BASE = 'https://suibo-river.pref.saitama.lg.jp/hyoujidata/';
const CONFIG = 'https://suibo-river.pref.saitama.lg.jp/chitenconfig/';
const DEFAULT_CCD = '12331400006'; // 下久保ダム
const LIVE_CACHE_MS = 5 * 60 * 1000;   // 観測は10分毎なので5分
const LIST_CACHE_MS = 60 * 60 * 1000;  // ダム一覧は滅多に変わらないので1時間

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

// "38,554千m3↑" や "296.80" → 数値（取れなければ null）
function num(s) {
  if (s == null) return null;
  const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

const clean = s => (s || '').replace(/\s+/g, ' ').trim();

// ---- ダム一覧（DamList.csv） ----
// 一覧＝静的設定。各ダムの基準水位（洪水時最高水位など）もここに入っている。
let listCache = null;
let listAt = 0;

async function fetchDamList() {
  if (listCache && Date.now() - listAt < LIST_CACHE_MS) return listCache;

  const res = await fetch(`${CONFIG}DamList.csv`);
  if (!res.ok) throw new Error('dam list fetch failed');
  const text = await res.text();

  const dams = text.split('\n')
    .map(l => l.replace(/﻿/g, '').trimEnd())
    .filter(l => l && /^\d/.test(l)) // ヘッダ(#…)や空行を除外、ccdは数字始まり
    .map(parseCsvLine)
    .map(c => ({
      ccd: c[0],
      name: clean(c[2]),
      river: clean(c[4]),
      location: clean(c[6]),
      totalCapacity: num(c[7]),       // 総貯水量(千m3)
      effectiveCapacity: num(c[8]),   // 有効貯水量(千m3)
      // 基準水位(EL.m)。欠損は null
      levels: {
        teichou: num(c[12]),          // ダム堤頂標高
        kouzuijiSaikou: num(c[13]),   // 洪水時最高水位
        sekkeiKouzui: num(c[15]),     // 設計洪水位
        joujiMansui: num(c[17]),      // 常時満水位
        heijoujiSaikou: num(c[19]),   // 平常時最高貯水位
        kakiSeigen: num(c[21]),       // 夏季制限水位
        yobiHouryuu: num(c[27]),      // 予備放流水位
        saitei: num(c[29]),           // 最低水位
      },
      unit: clean(c[c.length - 1]) || 'EL', // 標高基準(EL/AP/YP)
    }));

  listCache = dams;
  listAt = Date.now();
  return dams;
}

// ---- 個別ダムのライブ値（dam_detail_{ccd}.csv ＋ _tbl24.csv） ----
const liveCache = new Map(); // ccd -> { at, data }

async function fetchDamData(ccd) {
  const list = await fetchDamList();
  const meta = list.find(d => d.ccd === String(ccd)) // ccdはホワイトリスト検証
    || list.find(d => d.ccd === DEFAULT_CCD);
  if (!meta) throw new Error('unknown dam');
  ccd = meta.ccd;

  const hit = liveCache.get(ccd);
  if (hit && Date.now() - hit.at < LIVE_CACHE_MS) return hit.data;

  const [detailRes, tblRes] = await Promise.all([
    fetch(`${BASE}dam_detail_${ccd}.csv`),
    fetch(`${BASE}dam_detail_${ccd}_tbl24.csv`),
  ]);
  if (!detailRes.ok) throw new Error('upstream fetch failed');

  // 最新値: 8=観測時刻(YYYYMMDDhhmm) 9=放流量 10=流入量 11=貯水位 12=貯水量(千m3)
  const d = parseCsvLine((await detailRes.text()).trim().split('\n')[0]);
  const t = d[8] || '';
  const observedAt = t.length === 12
    ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)} ${t.slice(8, 10)}:${t.slice(10, 12)}`
    : null;

  // 24時間推移（調節池などでtbl24が無い場合は空配列）
  let series = [];
  if (tblRes.ok) {
    series = (await tblRes.text()).trim().split('\n').filter(Boolean).map(line => {
      const c = parseCsvLine(line); // 時刻, 流入量, 放流量, 貯水位, 貯水量
      return { time: c[0], inflow: num(c[1]), outflow: num(c[2]), level: num(c[3]), storage: num(c[4]) };
    });
  }

  const data = {
    ccd: meta.ccd,
    name: meta.name,
    river: meta.river,
    location: meta.location,
    totalCapacity: meta.totalCapacity,
    effectiveCapacity: meta.effectiveCapacity,
    levels: meta.levels,
    unit: meta.unit,
    observedAt,
    outflow: num(d[9]),
    inflow: num(d[10]),
    level: num(d[11]),
    storage: num(d[12]),
    series,
    source: '埼玉県 川の防災情報',
  };

  liveCache.set(ccd, { at: Date.now(), data });
  return data;
}

module.exports = { fetchDamData, fetchDamList, DEFAULT_CCD };
