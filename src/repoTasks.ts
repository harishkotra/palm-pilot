// Prompts that work on the user's actual GitHub repo. The issue list, commit
// log and labels all come from api.github.com at call time — the model never
// gets an example repo and never invents an issue number it was not shown.

import { chat, pickJson, LlmError, type Msg, type Reply } from './llmClient';
import { target } from './llmTasks';
import { LLM } from './config';
import type { GhIssue, GhRepo, RepoState } from './github';

export type Pick = { number: number; why: string; action: string };
export type Plan = { steps: string[] };

const jsonOnly = (shape: string) => `Reply with JSON only — no prose, no markdown fences: ${shape}`;

function fail(why: string): never {
  throw new LlmError(0, `unusable model output: ${why}`);
}

const ONE = (s: string) => s.replace(/\s+/g, ' ').trim();

function roster(issues: GhIssue[]): string {
  return issues
    .map((i) => {
      const l = i.labels.length ? ` [${i.labels.join(',')}]` : '';
      const pr = i.isPR ? ' (PR)' : '';
      return `#${i.number}${pr} ${i.title}${l} · ${i.comments} comments`;
    })
    .join('\n');
}

function commitLog(state: RepoState): string {
  return state.commits.map((c) => `${c.sha} ${c.msg} — ${c.author}`).join('\n');
}

const BRAIN = (repo: GhRepo) =>
  `You are the sharpest engineer on ${repo.fullName} (${repo.language}, ` +
  `${repo.stars} stars, last push ${repo.pushedAt.slice(0, 10)}, branch ${repo.branch}). ` +
  `You are blunt, concrete and allergic to generic advice.`;

/** Which open thing to do next, from the real open list. */
export async function triage(
  state: RepoState,
  skip: number[] = [],
): Promise<{ pick: Pick; reply: Reply }> {
  const open = state.issues.filter((i) => !skip.includes(i.number));
  if (!open.length) fail('nothing open to triage');

  const messages: Msg[] = [
    {
      role: 'system',
      content:
        `${BRAIN(state.repo)}\n` +
        `${jsonOnly('{"number":<issue number>,"why":"<=80 chars","action":"<=60 chars"}')}\n` +
        'Pick the one item that unblocks the most work. why = the real reason, referencing what you see. action = the first concrete move.',
    },
    {
      role: 'user',
      content: `Open items:\n${roster(open)}\n\nRecent commits:\n${commitLog(state)}\n\nWhich one next?`,
    },
  ];
  const reply = await chat(target(), messages, { maxTokens: LLM.maxTokens });
  const raw = pickJson<Record<string, unknown>>(reply.text);
  if (!raw) fail(`not JSON: ${reply.text.slice(0, 80)}`);

  const number = Number(raw.number);
  if (!open.some((i) => i.number === number)) fail(`issue #${raw.number} was never offered`);
  const why = ONE(String(raw.why ?? ''));
  const action = ONE(String(raw.action ?? ''));
  if (!why || !action) fail('empty why/action');

  return { pick: { number, why: why.slice(0, 90), action: action.slice(0, 70) }, reply };
}

/** Four steps to actually land the picked item. */
export async function plan(state: RepoState, pick: Pick): Promise<{ plan: Plan; reply: Reply }> {
  const item = state.issues.find((i) => i.number === pick.number);
  if (!item) fail(`#${pick.number} is no longer open`);

  const messages: Msg[] = [
    {
      role: 'system',
      content:
        `${BRAIN(state.repo)}\n` +
        `${jsonOnly('{"steps":["<=70 chars","<=70 chars","<=70 chars","<=70 chars"]}')}\n` +
        'Each step is an action on this repo: a file, a command, or a review. No "investigate further" filler.',
    },
    {
      role: 'user',
      content: `Item #${item.number}${item.isPR ? ' (PR)' : ''}: ${item.title}\nLabels: ${item.labels.join(', ') || 'none'}\n\nRecent commits:\n${commitLog(state)}\n\nPlan to land it.`,
    },
  ];
  const reply = await chat(target(), messages, { maxTokens: LLM.maxTokens });
  const raw = pickJson<Record<string, unknown>>(reply.text);
  if (!raw) fail(`not JSON: ${reply.text.slice(0, 80)}`);

  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((s) => ONE(String(s)).slice(0, 74))
    .filter(Boolean)
    .slice(0, 4);
  if (steps.length < 2) fail('fewer than two steps');

  return { plan: { steps }, reply };
}

/** Standup line written from the real commit log. */
export async function standup(state: RepoState): Promise<{ line: string; reply: Reply }> {
  const messages: Msg[] = [
    { role: 'system', content: `${BRAIN(state.repo)} You write one standup line. No preamble.` },
    {
      role: 'user',
      content: `Commits, newest first:\n${commitLog(state)}\n\nOne line, <=140 chars, past tense, what actually shipped.`,
    },
  ];
  const reply = await chat(target(), messages, { maxTokens: LLM.maxTokens });
  const line = ONE(reply.text).replace(/^["']|["']$/g, '').slice(0, 150);
  if (line.length < 10) fail('empty standup');
  return { line, reply };
}

/** The repo, told the truth about itself. */
export async function roast(state: RepoState): Promise<{ line: string; reply: Reply }> {
  const messages: Msg[] = [
    {
      role: 'system',
      content: `${BRAIN(state.repo)} You roast repos the way a senior reviewer does: specific, funny, true.`,
    },
    {
      role: 'user',
      content:
        `Facts: ${state.repo.openIssues} open items, ${state.issues.filter((i) => i.isPR).length} of them PRs, ` +
        `last push ${state.repo.pushedAt.slice(0, 10)}, ${state.repo.stars} stars, language ${state.repo.language}.\n` +
        `Open items:\n${roster(state.issues.slice(0, 12))}\n\nRecent commits:\n${commitLog(state)}\n\n` +
        'One line, <=140 chars. Name a real issue number or commit. No generic "your code is messy".',
    },
  ];
  const reply = await chat(target(), messages, { maxTokens: LLM.maxTokens });
  const line = ONE(reply.text).replace(/^["']|["']$/g, '').slice(0, 150);
  if (line.length < 10) fail('empty roast');
  return { line, reply };
}
