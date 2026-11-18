// Pure network + parsing layer. No React Native imports, so this runs under
// plain node/tsx in tests as well as on device.

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/** Accepts `host:port`, `https://host`, `https://host/v1` — anything OpenAI-shaped. */
export function normaliseBaseUrl(raw: string): string {
  let b = (raw || '').trim().replace(/\/+$/, '');
  if (!b) return DEFAULT_BASE_URL;
  if (!/^[a-z]+:\/\//i.test(b)) {
    const localish = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(b);
    b = `${localish ? 'http' : 'https'}://${b}`;
  }
  const path = b.replace(/^[a-z]+:\/\//i, '');
  if (!path.includes('/')) b = `${b}/v1`;
  return b;
}

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatTarget = { baseUrl: string; apiKey: string; model: string };

export class LlmError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
  }
}

type ChatOpts = { maxTokens?: number; temperature?: number; timeoutMs?: number; fetchImpl?: typeof fetch };

/** One blocking completion. Streaming is skipped on purpose — the reveal animation carries the drama. */
export async function chat(cfg: ChatTarget, messages: Msg[], opts: ChatOpts = {}): Promise<string> {
  const url = `${normaliseBaseUrl(cfg.baseUrl)}/chat/completions`;
  const doFetch = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);

  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey?.trim() ? { Authorization: `Bearer ${cfg.apiKey.trim()}` } : {}),
      },
      body: JSON.stringify({
        model: (cfg.model || '').trim(),
        messages,
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens ?? 120,
        stream: false,
      }),
      signal: ctrl.signal,
    });

    const raw = await res.text();
    if (!res.ok) {
      let detail = raw.slice(0, 160);
      try {
        detail = JSON.parse(raw)?.error?.message ?? detail;
      } catch {}
      throw new LlmError(`${res.status} ${detail}`, res.status);
    }

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new LlmError('endpoint did not return JSON');
    }

    const content: string =
      data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? data?.message?.content ?? '';
    if (!content) throw new LlmError('empty completion');
    return String(content).trim();
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new LlmError('timed out');
    if (e instanceof LlmError) throw e;
    throw new LlmError(e?.message ?? 'network error');
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the first JSON object out of a completion, tolerating fences and stray prose. */
export function pickJson<T = any>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
