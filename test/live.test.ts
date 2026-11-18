// Hits the real endpoint from .env and runs all five prompts the app uses.
// Nothing is stubbed: every assertion below is on live model output.
//   npm run test:live
import { LLM, hasKey } from '../src/config';
import { LlmError } from '../src/llmClient';
import { compactFact, diagnose, proposeNext, reaction, seedContext, target } from '../src/llmTasks';

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, note = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}${note ? ` — ${note}` : ''}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${note ? ` — ${note}` : ''}`);
  }
};

const transcript: string[] = [];
const say = (s: string) => {
  transcript.push(s);
  console.log(s);
};

(async () => {
  if (!hasKey) {
    console.log('no EXPO_PUBLIC_LLM_API_KEY in .env — nothing to test');
    process.exit(1);
  }
  const t = target();
  say(`endpoint  ${t.baseUrl}`);
  say(`model     ${t.model}`);
  say(`effort    ${t.reasoningEffort ?? '(unset)'} · max ${t.maxTokens} tok`);
  say('');

  try {
    say('— LGTM: first tool call');
    const a = await proposeNext([]);
    say(`  ${a.proposal.tool} ${a.proposal.detail}  [risk ${a.proposal.risk}, ${a.reply.ms} ms, ${a.reply.usage?.total ?? '?'} tok]`);
    ok('proposal parses', !!a.proposal.tool && !!a.proposal.detail);
    ok('reply came from the network', a.reply.ms > 0 && (a.reply.usage?.total ?? 0) > 0);

    say('— LGTM: approve consequence');
    const b = await reaction(a.proposal, 'approve');
    say(`  "${b.line}"  [${b.reply.ms} ms]`);
    ok('approval line is specific', b.line.length > 6 && b.line.length <= 120);

    const c = await reaction(a.proposal, 'deny');
    say(`  deny → "${c.line}"  [${c.reply.ms} ms]`);
    ok('denial line differs from approval', c.line !== b.line);

    say('— LGTM: next call uses history');
    const d = await proposeNext([`${a.proposal.tool} ${a.proposal.detail}`]);
    say(`  ${d.proposal.tool} ${d.proposal.detail}  [${d.reply.ms} ms]`);
    ok('second proposal parses', !!d.proposal.tool);

    say('— /COMPACT: seed context');
    const e = await seedContext();
    e.facts.forEach((f) => say(`  · ${f}`));
    ok('at least 3 facts', e.facts.length >= 3, `${e.facts.length} facts, ${e.reply.ms} ms`);

    say('— /COMPACT: destroy one fact');
    const f = await compactFact(e.facts);
    say(`  from: ${f.from}`);
    say(`  to:   ${f.to}  [${f.reply.ms} ms]`);
    ok('compaction edited a real fact', e.facts.includes(f.from) && f.to !== f.from);

    say('— PANIC: escalating diagnosis');
    const g1 = await diagnose([], 3);
    say(`  t+3s  "${g1.line}"  [${g1.reply.ms} ms]`);
    const g2 = await diagnose([g1.line], 14);
    say(`  t+14s "${g2.line}"  [${g2.reply.ms} ms]`);
    ok('two distinct turns', g1.line !== g2.line);
    ok('both lines non-empty', g1.line.length > 4 && g2.line.length > 4);

    say('');
    say(fail === 0 ? `LIVE OK — ${pass}/${pass} checks against ${t.model}` : `${fail} FAILED / ${pass} passed`);
    process.exit(fail === 0 ? 0 : 1);
  } catch (e: any) {
    if (e instanceof LlmError) console.log(`\nAPI ERROR ${e.status}: ${e.detail}`);
    else console.log(`\nERROR: ${e?.message ?? e}`);
    process.exit(1);
  }
})();
