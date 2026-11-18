// Real GitHub in, real lines out. Nothing is stubbed: this hits api.github.com
// with the token in .env and then makes four particle.ai calls.
//
//   node --env-file=.env --import tsx test/repo.test.ts

import { fetchRepoState } from '../src/github';
import { triage, plan, standup, roast } from '../src/repoTasks';
import { GITHUB, hasRepo, LLM } from '../src/config';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
  if (!cond) failures++;
}

async function main() {
  if (!hasRepo) {
    console.log('SKIP  no EXPO_PUBLIC_GITHUB_REPO / TOKEN in env');
    process.exit(0);
  }
  console.log(`repo: ${GITHUB.repo} · model: ${LLM.model}`);

  const state = await fetchRepoState();
  console.log(
    `\ngithub ${state.ms} ms — ${state.repo.fullName} · ${state.repo.openIssues} open · ` +
      `${state.issues.length} read · ${state.commits.length} commits · pushed ${state.repo.pushedAt}`,
  );
  check('repo metadata returned', state.repo.fullName === GITHUB.repo, state.repo.fullName);
  check('open items were actually read', state.issues.length > 0, `${state.issues.length}`);
  check('commits were actually read', state.commits.length > 0, `${state.commits.length}`);

  const t = await triage(state);
  console.log(`\nTRIAGE  ${t.reply.ms} ms / ${t.reply.usage?.total ?? 0} tok`);
  console.log(`  #${t.pick.number} ${t.pick.why}`);
  console.log(`  next: ${t.pick.action}`);
  check('pick is a real open item', state.issues.some((i) => i.number === t.pick.number), `#${t.pick.number}`);

  const p = await plan(state, t.pick);
  console.log(`\nPLAN  ${p.reply.ms} ms / ${p.reply.usage?.total ?? 0} tok`);
  p.plan.steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  check('plan has at least two steps', p.plan.steps.length >= 2, `${p.plan.steps.length}`);

  const st = await standup(state);
  console.log(`\nSTANDUP  ${st.reply.ms} ms / ${st.reply.usage?.total ?? 0} tok`);
  console.log(`  ${st.line}`);
  check('standup line is non-trivial', st.line.length >= 10, `"${st.line}"`);

  const r = await roast(state);
  console.log(`\nROAST  ${r.reply.ms} ms / ${r.reply.usage?.total ?? 0} tok`);
  console.log(`  ${r.line}`);
  check('roast line is non-trivial', r.line.length >= 10, `"${r.line}"`);

  const again = await triage(state, [t.pick.number]);
  console.log(`\nTRIAGE AGAIN (skipping #${t.pick.number})  ${again.reply.ms} ms`);
  console.log(`  #${again.pick.number} ${again.pick.why}`);
  check('skip list is honoured', again.pick.number !== t.pick.number, `#${again.pick.number}`);

  console.log(failures === 0 ? '\nREPO OK — real GitHub + real inference' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\nREPO FAILED: ${e?.message ?? e}`);
  process.exit(1);
});
