// Vercel Serverless Function: GET /api/dam?ccd=XXXX
// 指定ダムのライブ値をJSONで返す（CORS回避プロキシ）。ccdは未指定なら下久保。
const { fetchDamData } = require('../lib/dam');

module.exports = async (req, res) => {
  try {
    const ccd = (req.query && req.query.ccd) || undefined;
    const data = await fetchDamData(ccd);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).send(JSON.stringify(data));
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
