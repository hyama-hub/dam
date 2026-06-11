// Vercel Serverless Function: GET /api/dams
// ダム選択用の一覧（ccd・名称・河川）を返す。
const { fetchDamList } = require('../lib/dam');

module.exports = async (req, res) => {
  try {
    const list = await fetchDamList();
    const slim = list.map(d => ({ ccd: d.ccd, name: d.name, river: d.river }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(JSON.stringify(slim));
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
