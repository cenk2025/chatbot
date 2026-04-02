// Voon.fi Chatbot — Vercel Node.js Serverless Function
// Google Gemini API proxy — API anahtari sadece sunucuda

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';

const ALLOWED_ORIGINS = [
  'https://voon.fi',
  'https://www.voon.fi',
];

function isAllowed(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/\.vercel\.app$/.test(origin)) return true;
  if (/^http:\/\/localhost/.test(origin)) return true;
  return false;
}

function toGeminiContents(messages) {
  return messages
    .filter(function(m) { return m.role === 'user' || m.role === 'assistant'; })
    .map(function(m) {
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content || '' }],
      };
    });
}

module.exports = async function handler(req, res) {
  var origin = req.headers['origin'] || '';
  var allowedOrigin = isAllowed(origin) ? (origin || '*') : '';

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  var apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'Palvelu ei ole kaytettavissa. Yrita myohemmin.' });
    return;
  }

  var body = req.body || {};
  var messages = body.messages || [];
  var systemPrompt = body.systemPrompt || '';

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Viestit puuttuvat.' });
    return;
  }

  var model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  var url = GEMINI_BASE + '/' + model + ':streamGenerateContent?key=' + apiKey + '&alt=sse';

  var geminiBody = {
    contents: toGeminiContents(messages),
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.7,
    },
  };

  if (systemPrompt) {
    geminiBody.system_instruction = { parts: [{ text: systemPrompt }] };
  }

  var geminiRes;
  try {
    geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });
  } catch (err) {
    res.status(502).json({ error: 'Yhteysvirhe AI-palveluun.' });
    return;
  }

  if (!geminiRes.ok) {
    var errText = '';
    try { errText = await geminiRes.text(); } catch (e) {}
    console.error('Gemini error', geminiRes.status, errText);
    res.status(geminiRes.status).json({ error: 'AI-palvelu ei vastannut odotetusti.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  res.status(200);

  var reader = geminiRes.body.getReader();
  var decoder = new TextDecoder();
  var buffer = '';

  while (true) {
    var result = await reader.read();
    if (result.done) break;

    buffer += decoder.decode(result.value, { stream: true });
    var lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line.startsWith('data:')) continue;
      var raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;

      try {
        var json = JSON.parse(raw);
        var part = json.candidates &&
                   json.candidates[0] &&
                   json.candidates[0].content &&
                   json.candidates[0].content.parts &&
                   json.candidates[0].content.parts[0] &&
                   json.candidates[0].content.parts[0].text;
        if (part) {
          var out = JSON.stringify({ choices: [{ delta: { content: part } }] });
          res.write('data: ' + out + '\n\n');
        }
      } catch (e) {}
    }
  }

  res.write('data: [DONE]\n\n');
  res.end();
};
