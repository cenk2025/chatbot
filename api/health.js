// Teshis endpoint — api/chat calisip calismadigini test eder
module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    ok: true,
    hasApiKey: !!process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini (varsayilan)',
    node: process.version,
  });
};
