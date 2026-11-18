// End-to-end, no phone and no mocks: real lux samples through the real gesture
// detector, and every line printed comes back from the real endpoint in .env.
//   npm run demo
import { WaveDetector, DEFAULTS, type WaveEvent } from '../src/waveDetector';
import { LLM, hasKey } from '../src/config';
import { compactFact, diagnose, proposeNext, reaction, seedContext, target } from '../src/llmTasks';
import { fetchRepoState } from '../src/github';
import { plan as repoPlan, triage } from '../src/repoTasks';
import { hasRepo, GITHUB } from '../src/config';

const AMBIENT = 320;
const cover = () => 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));

/** Feed lux values on the sensor's 80 ms cadence and collect the events they produce. */
function run(det: WaveDetector, script: number[], startAt: number): { events: WaveEvent[]; end: number } {
  const events: WaveEvent[] = [];
  let t = startAt;
  for (const lux of script) {
    events.push(...det.push(lux, t));
    t += 80;
  }
  events.push(...det.tick(t));
  return { events, end: t };
}

const warm = (det: WaveDetector, n = 8) => {
  let t = 0;
  for (let i = 0; i < n; i++) {
    det.push(AMBIENT, t);
    t += 80;
  }
  return t;
};

const rep = (v: number, n: number) => Array.from({ length: n }, () => v);

(async () => {
  if (!hasKey) {
    console.log('no key in .env — copy .env.example and fill it in');
    process.exit(1);
  }
  const t = target();
  console.log(`palm pilot · ${t.model} · ${t.baseUrl}\n`);

  // ── LGTM ────────────────────────────────────────────────────────────────
  const detA = new WaveDetector(DEFAULTS);
  let clock = warm(detA);
  console.log('— gesture 1: quick cover/release over the sensor');

  const g1 = run(detA, [...rep(cover(), 3), ...rep(AMBIENT, 6)], clock);
  clock = g1.end;
  console.log(`  detector: ${g1.events.join(', ') || 'nothing'}`);

  if (!g1.events.includes('wave')) {
    console.log('  detector did not classify a wave; aborting');
    process.exit(1);
  }
  const p = await proposeNext([]);
  console.log(`  model:    ${p.proposal.tool} · "${p.proposal.detail}" · risk ${p.proposal.risk} · ${p.reply.ms} ms / ${p.reply.usage?.total ?? '?'} tok`);

  const approve = await reaction(p.proposal, 'approve');
  console.log(`  approved: "${approve.line}" · ${approve.reply.ms} ms`);

  const deny = await reaction(p.proposal, 'deny');
  console.log(`  denied:   "${deny.line}" · ${deny.reply.ms} ms\n`);

  // ── /COMPACT ────────────────────────────────────────────────────────────
  const detB = new WaveDetector(DEFAULTS);
  let clockB = warm(detB);
  console.log('— gesture 2: hand held over the sensor (900 ms+)');
  const g2 = run(detB, [...rep(cover(), 14), ...rep(AMBIENT, 6)], clockB);
  console.log(`  detector: ${g2.events.join(', ') || 'nothing'}`);

  const seed = await seedContext();
  seed.facts.forEach((f) => console.log(`  context:  ${f}`));
  const cut = await compactFact(seed.facts);
  console.log(`  compact:  "${cut.from}"`);
  console.log(`         →  "${cut.to}" · ${cut.reply.ms} ms\n`);

  // ── PANIC ───────────────────────────────────────────────────────────────
  const detC = new WaveDetector(DEFAULTS);
  let clockC = warm(detC);
  console.log('— gesture 3: two quick covers inside the tap window');
  const g3 = run(
    detC,
    [...rep(cover(), 2), ...rep(AMBIENT, 2), ...rep(cover(), 2), ...rep(AMBIENT, 8)],
    clockC,
  );
  console.log(`  detector: ${g3.events.join(', ') || 'nothing'}`);

  const d1 = await diagnose([], 4);
  console.log(`  t+4s:     "${d1.line}"`);
  const d2 = await diagnose([d1.line], 15);
  console.log(`  t+15s:    "${d2.line}"`);
  const d3 = await diagnose([d1.line, d2.line], 41);
  console.log(`  t+41s:    "${d3.line}"`);
  console.log(`\n  ${d3.reply.ms} ms for the last turn · ${d3.reply.usage?.total ?? '?'} tok\n`);

  // ── /REPO ───────────────────────────────────────────────────────────────
  if (hasRepo) {
    const detD = new WaveDetector(DEFAULTS);
    const clockD = warm(detD);
    console.log('— gesture 4: three quick covers (triple) on the /REPO tab');
    const g4 = run(
      detD,
      [
        ...rep(cover(), 2), ...rep(AMBIENT, 2),
        ...rep(cover(), 2), ...rep(AMBIENT, 2),
        ...rep(cover(), 2), ...rep(AMBIENT, 8),
      ],
      clockD,
    );
    console.log(`  detector: ${g4.events.join(', ') || 'nothing'}`);

    const state = await fetchRepoState();
    console.log(
      `  github:   ${state.repo.fullName} · ${state.repo.openIssues} open · ${state.commits.length} commits · ${state.ms} ms`,
    );
    const pick = await triage(state);
    console.log(`  triage:   #${pick.pick.number} — ${pick.pick.why} · ${pick.reply.ms} ms`);
    console.log(`  first move: ${pick.pick.action}`);
    const steps = await repoPlan(state, pick.pick);
    steps.plan.steps.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
    console.log(`  plan:     ${steps.reply.ms} ms / ${steps.reply.usage?.total ?? '?'} tok\n`);
  } else {
    console.log('— gesture 4 skipped: no EXPO_PUBLIC_GITHUB_REPO / TOKEN in .env\n');
  }

  // ── holdLong ────────────────────────────────────────────────────────────
  const detE = new WaveDetector(DEFAULTS);
  const clockE = warm(detE);
  console.log('— gesture 5: hand parked past 2.4 s (holdLong)');
  const g5 = run(detE, [...rep(cover(), 34), ...rep(AMBIENT, 6)], clockE);
  console.log(`  detector: ${g5.events.join(', ') || 'nothing'}`);
  console.log(`  repo under test: ${GITHUB.repo || 'none'}`);

  await sleep(50);
})();
