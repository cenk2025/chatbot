/**
 * Voon.fi Chatbot — AI API Client (Selainpuoli)
 *
 * API-avain ja system prompt ovat palvelimella (api/chat.js).
 * Tama tiedosto lahettaa vain viestit /api/chat -proxyn kautta.
 */

export async function sendMessage(messages, onChunk, onDone, signal) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok) {
    let errMsg = '';
    try { errMsg = (await response.json()).error || ''; } catch { /* ignore */ }
    throw new Error(`API_ERROR:${response.status}:${errMsg}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (signal?.aborted) { reader.cancel(); break; }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const json = JSON.parse(trimmed.slice(6));
        const chunk = json.choices?.[0]?.delta?.content;
        if (chunk) { fullText += chunk; onChunk(chunk); }
      } catch { /* ignore */ }
    }
  }

  onDone(fullText);
}
