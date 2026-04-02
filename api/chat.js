/**
 * Voon.fi Chatbot — Vercel Edge Function
 * Google Gemini API proxy — API anahtarı sadece burada, tarayıcıya hiç ulaşmaz.
 *
 * Vercel Dashboard → Settings → Environment Variables:
 *   GOOGLE_API_KEY   = AIza...
 *   GEMINI_MODEL     = gemini-2.0-flash   (valinnainen)
 */

export const config = { runtime: 'edge' };

const DEFAULT_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Allowed origins — lisää tuotanto-URL ennen julkaisua
const ALLOWED_ORIGINS = [
  'https://voon.fi',
  'https://www.voon.fi',
  /\.vercel\.app$/,   // kaikki Vercel preview-deployt
  /^http:\/\/localhost/,
];

function isOriginAllowed(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(o =>
    typeof o === 'string' ? o === origin : o.test(origin)
  );
}

function corsHeaders(origin) {
  const allowed = isOriginAllowed(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed || 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// Muunna viestit Gemini-formaattiin
function toGeminiContents(messages) {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content || '' }],
    }));
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const cors = corsHeaders(origin);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  // API anahtarı Vercel env'den — tarayıcıya asla gönderilmez
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Palvelu ei ole käytettävissä. Yritä myöhemmin.' }),
      { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Virheellinen pyyntö.' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  const { messages = [], systemPrompt = '' } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Viestit puuttuvat.' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `${GEMINI_BASE}/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const geminiBody = {
    ...(systemPrompt && {
      system_instruction: { parts: [{ text: systemPrompt }] },
    }),
    contents: toGeminiContents(messages),
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.7,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  let geminiRes;
  try {
    geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Yhteysvirhe AI-palveluun.' }),
      { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => '');
    console.error('[voon/chat] Gemini error', geminiRes.status, errText);
    return new Response(
      JSON.stringify({ error: 'AI-palvelu ei vastannut odotetusti.' }),
      { status: geminiRes.status, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  // Gemini SSE → OpenAI-yhteensopiva SSE (frontend ymmärtää tätä formaattia)
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const transform = new TransformStream({
    transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true });
      const lines = text.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const raw = trimmed.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;

        try {
          const json = JSON.parse(raw);
          const part = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (part) {
            // OpenAI SSE formaattiin — frontend parseri odottaa tätä
            const out = JSON.stringify({ choices: [{ delta: { content: part } }] });
            controller.enqueue(encoder.encode(`data: ${out}\n\n`));
          }
          // Gemini lähettää finishReason lopussa
          const finish = json.candidates?.[0]?.finishReason;
          if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') {
            // Safety block tai muu keskeytys
            const msg = JSON.stringify({ choices: [{ delta: { content: '' }, finish_reason: finish }] });
            controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
          }
        } catch {
          // parse error — ohitetaan
        }
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    },
  });

  return new Response(geminiRes.body.pipeThrough(transform), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no',  // Nginx buffering pois
    },
  });
}
