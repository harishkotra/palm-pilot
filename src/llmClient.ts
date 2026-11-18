// Thin OpenAI-compatible client. No React Native imports, so the same code runs
// under Node (tools/live-demo.ts, tests) and in the app.

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatTarget = {
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort?: string;
  maxTokens?: number;
};

export type Usage = { prompt: number; completion: number; total: number };

export type Reply = { text: string; ms: number; usage: Usage | null };

export class LlmError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail || `HTTP ${status}`);
    this.name = 'LlmError';
    this.status = status;
    this.detail = detail;
  }
}

export const DEFAULT_BASE_URL = 'https://api.particle.ai/v1';

/** Accepts `host:port`, a bare host, or a full URL. Private hosts get http. */
export function normaliseBaseUrl(raw: string): string {
  let u = (raw || '').trim().replace(/\/+$/, '');
  if (!u) return DEFAULT_BASE_URL;
  if (!/^https?:\/\//i.test(u)) {
    const host = u.split('/')[0].split(':')[0];
    const local =
      host === 'localhost' ||
      host.startsWith('127.') ||
      host === '0.0.0.0' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    u = `${local ? 'http' : 'https'}://${u}`;
  }
  const hasPath = u.replace(/^https?:\/\/[^/]+/i, '').length > 0;
  return hasPath ? u : `${u}/v1`;
}

/** Pulls the first JSON object/array out of a reply, fenced or not. */
export function pickJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body) as T;
  } catch {
    // fall through to brace matching
  }
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  const open = body[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"' && body[i - 1] !== '\\') inStr = !inStr;
    if (inStr) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(body.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export type ChatOpts = {
  maxTokens?: number;
  reasoningEffort?: string | null;
  temperature?: number;
  timeoutMs?: number;
};

export async function chat(target: ChatTarget, messages: Msg[], opts: ChatOpts = {}): Promise<Reply> {
  const url = `${normaliseBaseUrl(target.baseUrl)}/chat/completions`;
  const body: Record<string, unknown> = {
    model: (target.model || '').trim(),
    messages,
    stream: false,
    max_tokens: opts.maxTokens ?? target.maxTokens ?? 200,
  };
  const effort = opts.reasoningEffort === undefined ? target.reasoningEffort : opts.reasoningEffort;
  if (effort) body.reasoning_effort = effort;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45_000);
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(target.apiKey?.trim() ? { Authorization: `Bearer ${target.apiKey.trim()}` } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    throw new LlmError(0, e?.name === 'AbortError' ? 'timed out' : `network: ${e?.message ?? e}`);
  } finally {
    clearTimeout(timer);
  }
  const ms = Date.now() - t0;
  const raw = await res.text();

  if (!res.ok) {
    let detail = raw.slice(0, 240);
    try {
      const j = JSON.parse(raw);
      detail = j?.error?.message ?? j?.message ?? detail;
    } catch {
      /* keep raw */
    }
    throw new LlmError(res.status, detail);
  }

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new LlmError(0, 'provider returned non-JSON');
  }
  const msg = data?.choices?.[0]?.message;
  const text =
    typeof msg?.content === 'string'
      ? msg.content
      : Array.isArray(msg?.content)
        ? msg.content.map((p: any) => p?.text ?? '').join('')
        : '';
  if (!text.trim()) {
    const finish = data?.choices?.[0]?.finish_reason;
    throw new LlmError(0, finish === 'length' ? 'hit the token cap before answering' : 'empty response');
  }
  const u = data?.usage;
  return {
    text: text.trim(),
    ms,
    usage: u
      ? { prompt: u.prompt_tokens ?? 0, completion: u.completion_tokens ?? 0, total: u.total_tokens ?? 0 }
      : null,
  };
}

/** Cheap connectivity check: one short turn, real round trip. */
export async function probe(target: ChatTarget): Promise<Reply> {
  return chat(target, [{ role: 'user', content: 'Reply with exactly: ok' }], { maxTokens: 16 });
}
