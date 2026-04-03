// Teshis endpoint — api/chat calisip calismadigini test eder
module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    ok: true,
    hasApiKey: !!process.env.GOOGLE_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash (varsayilan)',
    node: process.version,
  });
};
