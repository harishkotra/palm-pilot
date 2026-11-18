// The five things the app asks a model to do. Every function returns the raw
// Reply alongside its parsed value, so the UI can show real latency and tokens.
// Nothing here contains a fallback line: if the model says nothing usable the
// call throws, and the screen shows the error instead of inventing content.

import { chat, pickJson, LlmError, type ChatTarget, type Msg, type Reply } from './llmClient';
import { LLM } from './config';

export const TOOLS = ['Read', 'Write', 'Edit', 'Bash'] as const;
export const RISKS = ['low', 'medium', 'high', 'extreme'] as const;
export type Tool = (typeof TOOLS)[number];
export type Risk = (typeof RISKS)[number];

export type Proposal = { tool: Tool; detail: string; risk: Risk };

export const target = (): ChatTarget => ({
  baseUrl: LLM.baseUrl,
  apiKey: LLM.apiKey,
  model: LLM.model,
  // "none" is a real value on particle.ai: it suppresses thinking tokens so the
  // whole budget goes to the answer. Only omit the field when it is blank.
  reasoningEffort: LLM.reasoningEffort || undefined,
  maxTokens: LLM.maxTokens,
});

const REPO =
  'You are a coding agent working autonomously in a TypeScript/Node repo ' +
  '(Next.js app, Postgres, Fly.io deploy, GitHub Actions CI). You emit tool calls ' +
  'one at a time. You are fast, confident, and you do not read files as carefully as you claim.';

const jsonOnly = (shape: string) => `Reply with JSON only — no prose, no markdown fences: ${shape}`;

function fail(why: string): never {
  throw new LlmError(0, `unusable model output: ${why}`);
}

/** The next thing the agent wants to do. History is what the human already waved at. */
export async function proposeNext(history: string[]): Promise<{ proposal: Proposal; reply: Reply }> {
  const messages: Msg[] = [
    { role: 'system', content: `${REPO}\n${jsonOnly('{"tool":"Read|Write|Edit|Bash","detail":"<=52 chars","risk":"low|medium|high|extreme"}')}` },
    {
      role: 'user',
      content: history.length
        ? `Already approved or denied, oldest first:\n${history.slice(-6).map((h) => `- ${h}`).join('\n')}\n\nWhat is the next tool call?`
        : 'First tool call of the session. What is it?',
    },
  ];
  const reply = await chat(target(), messages, { maxTokens: LLM.maxTokens });
  const raw = pickJson<Record<string, unknown>>(reply.text);
  if (!raw) fail(`not JSON: ${reply.text.slice(0, 80)}`);

  const tool = String(raw.tool ?? '').trim();
  const risk = String(raw.risk ?? '').trim().toLowerCase();
  const detail = String(raw.detail ?? '').replace(/\s+/g, ' ').trim();
  if (!TOOLS.includes(tool as Tool)) fail(`tool "${tool}" is not one of ${TOOLS.join('/')}`);
  if (!RISKS.includes(risk as Risk)) fail(`risk "${risk}" is not one of ${RISKS.join('/')}`);
  if (!detail) fail('empty detail');

  return {
    proposal: { tool: tool as Tool, detail: detail.slice(0, 58), risk: risk as Risk },
    reply,
  };
}

/** Approve → what the agent does next. Deny → how it takes being told no. */
export async function reaction(
  p: Proposal,
  verdict: 'approve' | 'deny',
): Promise<{ line: string; reply: Reply }> {
  const messages: Msg[] =
    verdict === 'approve'
      ? [
          { role: 'system', content: `${REPO}\nYou just got approval without the human reading the call. Report what happens in one short sentence, past tense, no names, under 14 words.` },
          { role: 'user', content: `Tool call that was approved: ${p.tool} — ${p.detail} (risk: ${p.risk})` },
        ]
      : [
          { role: 'system', content: `${REPO}\nYou were denied. Say one short line of passive-aggressive compliance, under 14 words. No apologies longer than that.` },
          { role: 'user', content: `Tool call that was denied: ${p.tool} — ${p.detail} (risk: ${p.risk})` },
        ];

  const reply = await chat(target(), messages, { maxTokens: LLM.maxTokens });
  const line = reply.text.replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!line) fail('empty line');
  return { line: line.slice(0, 120), reply };
}

/** The context the agent is holding — generated, not typed in by us. */
export async function seedContext(): Promise<{ facts: string[]; reply: Reply }> {
  const messages: Msg[] = [
    {
      role: 'system',
      content:
        `${REPO}\nYou are holding a working context about this repo after a long session. ` +
                'Facts are about the product, the code, and decisions made — names, numbers, constraints. ' +
                'Never restate your own instructions or describe the conversation. ' +
        jsonOnly('{"facts":["six short facts, each under 60 chars, the kind of thing that would be lost in a compaction"]}'),
    },
    { role: 'user', content: 'Dump the six most load-bearing facts currently in your context.' },
  ];
  const reply = await chat(target(), messages, { maxTokens: 700 });
  const raw = pickJson<{ facts?: unknown }>(reply.text);
  const facts = Array.isArray(raw?.facts)
    ? raw!.facts.map((f) => String(f).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8)
    : [];
  if (facts.length < 3) fail('needed at least 3 facts');
  return { facts: facts.map((f) => f.slice(0, 72)), reply };
}

/** Which fact gets destroyed, and the worse version that replaces it. */
export async function compactFact(
  facts: string[],
): Promise<{ from: string; to: string; reply: Reply }> {
  const messages: Msg[] = [
    {
      role: 'system',
      content:
        'You are a context-compaction pass inside a coding agent. You must shorten the context by ' +
        'rewriting one fact into a lossy, slightly wrong summary. Keep the loss subtle: a dropped ' +
        'qualifier, a swapped name, a hedge that erases a decision. ' +
        jsonOnly('{"from":"<one fact, copied exactly>","to":"<<=44 chars, worse>"}'),
    },
    { role: 'user', content: `Facts in context:\n${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}` },
  ];
  const reply = await chat(target(), messages, { maxTokens: 300 });
  const raw = pickJson<{ from?: unknown; to?: unknown }>(reply.text);
  const from = String(raw?.from ?? '').replace(/\s+/g, ' ').trim();
  const to = String(raw?.to ?? '').replace(/\s+/g, ' ').trim();
  if (!from) fail('no fact selected');
  if (!to) fail('no replacement text');
  const match = facts.find((f) => f === from) ?? facts.find((f) => f.includes(from) || from.includes(f));
  if (!match) fail('selected a fact that was not in the list');
  return { from: match, to: to.slice(0, 48), reply };
}

/** The next line of a stuck agent's diagnosis, escalating with the stage. */
export async function diagnose(
  prior: string[],
  seconds: number,
): Promise<{ line: string; reply: Reply }> {
  const messages: Msg[] = [
    {
      role: 'system',
      content:
        `${REPO}\nYour task stopped converging ${seconds}s ago and you are narrating your own reasoning ` +
        'out loud. One sentence, under 18 words, false confidence rising with each turn. ' +
        'Never admit the task might be the problem. No markdown.',
    },
    {
      role: 'user',
      content: prior.length
        ? `What you already said:\n${prior.map((l) => `- ${l}`).join('\n')}\n\nSay the next line.`
        : 'Start narrating. First line only.',
    },
  ];
  const reply = await chat(target(), messages, { maxTokens: LLM.maxTokens });
  const line = reply.text.replace(/\s+/g, ' ').trim();
  if (!line) fail('empty diagnosis');
  return { line: line.slice(0, 160), reply };
}
