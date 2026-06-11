// Vercel Serverless Function: GET /api/dam
// 埼玉県 川の防災情報のCSVを取得してJSONで返す（CORS回避プロキシ）
const { fetchDamData } = require('../lib/dam');

module.exports = async (req, res) => {
  try {
    const data = await fetchDamData();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // CDN側でも5分キャッシュ（観測は10分毎更新のため）
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).send(JSON.stringify(data));
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
