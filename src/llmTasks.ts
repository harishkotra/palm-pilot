import { chat, pickJson, type ChatTarget, type Msg } from './llmClient';

export const TOOLS = ['Read', 'Write', 'Edit', 'Bash'] as const;
export type Tool = (typeof TOOLS)[number];
export type Risk = 'low' | 'medium' | 'high' | 'extreme';
export type Proposal = { tool: Tool; detail: string; risk: Risk };

const RISKS: Risk[] = ['low', 'medium', 'high', 'extreme'];

const clip = (v: unknown, n: number) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()
    .slice(0, n);

const AGENT_SYSTEM = `You are a coding agent working autonomously in a real repo:
a TypeScript/Node service with Postgres, a Next.js frontend, deploy on Fly.io, CI on GitHub Actions.
You propose exactly one tool call at a time and a human waves a hand over their phone to approve or deny it.
Be concrete and repo-specific. Alternate between boring maintenance and genuinely dangerous operations.
Reply with JSON only, no prose, no fences:
{"tool":"Read|Write|Edit|Bash","detail":"<the argument, <=52 chars, e.g. src/auth/session.ts or 'git push --force origin main'>","risk":"low|medium|high|extreme"}`;

/** The agent's next ask. Returns null when the model misbehaves so the caller can fall back. */
export async function proposeTool(cfg: ChatTarget, history: string[]): Promise<Proposal | null> {
  const recent = history.slice(-8).map((h) => `- ${h}`).join('\n') || '(nothing yet)';
  const messages: Msg[] = [
    { role: 'system', content: AGENT_SYSTEM },
    { role: 'user', content: `Recent approved or denied actions:\n${recent}\n\nPropose the next single tool call.` },
  ];
  const text = await chat(cfg, messages, { maxTokens: 90, temperature: 1.05 });
  const j = pickJson<any>(text);
  if (!j) return null;
  const tool = TOOLS.find((t) => t === String(j.tool).trim());
  const risk = RISKS.find((r) => r === String(j.risk).toLowerCase().trim()) ?? 'medium';
  const detail = clip(j.detail, 56);
  if (!tool || detail.length < 3) return null;
  return { tool, detail, risk };
}

const VOICE_SYSTEM = `You are a cynical staff engineer watching a human rubber-stamp an AI agent's tool calls
by waving a hand over a phone, without reading the diff. Write ONE line, max 64 characters.
Dry and specific to the actual action. No emoji, no quotes, no explanation. British understatement welcome.`;

export async function consequenceLine(
  cfg: ChatTarget,
  p: Proposal,
  decision: 'approve' | 'deny',
): Promise<string | null> {
  const text = await chat(
    cfg,
    [
      { role: 'system', content: VOICE_SYSTEM },
      {
        role: 'user',
        content: `The agent asked to run: ${p.tool} ${p.detail} (risk: ${p.risk}).\nThe human ${decision === 'approve' ? 'approved it with a wave' : 'denied it with a held hand'}.\nWrite the one line.`,
      },
    ],
    { maxTokens: 40, temperature: 0.95 },
  );
  const line = clip(text.split('\n')[0], 70);
  return line.length > 3 ? line : null;
}

/** Inner monologue of an agent that has stopped making progress. */
export async function panicLine(cfg: ChatTarget, stage: number, seconds: number): Promise<string | null> {
  const m = Math.floor(seconds / 60);
  const text = await chat(
    cfg,
    [
      {
        role: 'system',
        content: `You are a coding agent that has stopped converging. You do not admit failure directly.
Write ONE line of your internal monologue, max 70 characters, escalating with the number of failed attempts.
First attempts: confident and busy. Later: circular, then quietly desperate. No emoji, no quotes.`,
      },
      {
        role: 'user',
        content: `Attempt ${stage + 1}. ${m} minutes since your last tool call. ${stage + 1} waves of escalation from the human.
Write the line.`,
      },
    ],
    { maxTokens: 40, temperature: 1.0 },
  );
  const line = clip(text.split('\n')[0], 76);
  return line.length > 3 ? line : null;
}

/** Compaction: keep it lossy but confident, as the real thing does. */
export async function compactFact(
  cfg: ChatTarget,
  facts: string[],
): Promise<{ from: string; to: string } | null> {
  if (!facts.length) return null;
  const list = facts.map((f, i) => `${i + 1}. ${f}`).join('\n');
  const text = await chat(
    cfg,
    [
      {
        role: 'system',
        content: `You are a context-compaction step for an AI coding session. You must shrink a project fact
into a shorter summary that keeps the noun but drops the constraint, so it sounds confident and is subtly wrong.
Reply JSON only: {"from":"<exact original fact>","to":"<summary, <=40 chars>"}`,
      },
      { role: 'user', content: `Facts:\n${list}\n\nCompress the one whose constraint matters most.` },
    ],
    { maxTokens: 80, temperature: 0.9 },
  );
  const j = pickJson<any>(text);
  if (!j) return null;
  const from = facts.find((f) => f === String(j.from).trim());
  const to = clip(j.to, 44);
  if (!from || to.length < 3) return null;
  return { from, to };
}
