import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, MONO } from '../theme';
import { useSfx } from '../sfx';
import { useWaveHandler } from '../waveBus';
import { fetchRepoState, sincePushed, type RepoState } from '../github';
import { plan as makePlan, roast, standup, triage, type Pick } from '../repoTasks';
import { GITHUB, LLM, hasRepo } from '../config';
import { ErrLine, Meta, Panel, Tag } from '../ui';

/**
 * Everything on this screen is read from api.github.com and answered by the
 * model. If the fetch fails, the failure is shown — no local copy of the repo.
 */
export default function RepoScreen() {
  const play = useSfx();
  const [state, setState] = useState<RepoState | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [steps, setSteps] = useState<string[] | null>(null);
  const [quip, setQuip] = useState<{ kind: 'standup' | 'roast'; line: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [tokens, setTokens] = useState(0);

  const stateRef = useRef<RepoState | null>(null);
  const pickRef = useRef<Pick | null>(null);
  const inFlight = useRef(false);
  stateRef.current = state;
  pickRef.current = pick;

  const track = useCallback((r: { ms: number; usage: any }) => {
    setMs(r.ms);
    setTokens((t) => t + (r.usage?.total ?? 0));
  }, []);

  const load = useCallback(
    async (skip: number[] = []) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setErr(null);
      try {
        const next = await fetchRepoState();
        const { pick: chosen, reply } = await triage(next, skip);
        setState(next);
        setPick(chosen);
        setSteps(null);
        track(reply);
      } catch (e: any) {
        setErr(e?.message ?? 'request failed');
      } finally {
        setBusy(false);
        inFlight.current = false;
      }
    },
    [track],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const nextPick = useCallback(async () => {
    const s = stateRef.current;
    if (!s || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErr(null);
    play('wave');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const { pick: chosen, reply } = await triage(s, pickRef.current ? [pickRef.current.number] : []);
      setPick(chosen);
      setSteps(null);
      setQuip(null);
      track(reply);
    } catch (e: any) {
      setErr(e?.message ?? 'request failed');
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, [play, track]);

  const deepPlan = useCallback(async () => {
    const s = stateRef.current;
    const p = pickRef.current;
    if (!s || !p || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErr(null);
    play('approve');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const { plan, reply } = await makePlan(s, p);
      setSteps(plan.steps);
      setQuip(null);
      track(reply);
    } catch (e: any) {
      setErr(e?.message ?? 'request failed');
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, [play, track]);

  const oneLiner = useCallback(
    async (kind: 'standup' | 'roast') => {
      const s = stateRef.current;
      if (!s || inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setErr(null);
      play(kind === 'roast' ? 'deny' : 'compact');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      try {
        const { line, reply } = kind === 'roast' ? await roast(s) : await standup(s);
        setQuip({ kind, line });
        setSteps(null);
        track(reply);
      } catch (e: any) {
        setErr(e?.message ?? 'request failed');
      } finally {
        setBusy(false);
        inFlight.current = false;
      }
    },
    [play, track],
  );

  useWaveHandler({
    onWave: () => void nextPick(),
    onDouble: () => void deepPlan(),
    onTriple: () => void oneLiner('roast'),
    onHold: () => void load(pickRef.current ? [pickRef.current.number] : []),
    onHoldLong: () => void oneLiner('standup'),
  });

  if (!hasRepo) {
    return (
      <View style={s.wrap}>
        <Panel>
          <Tag color={C.amber}>NO REPO WIRED</Tag>
          <Text style={s.gate}>
            Set EXPO_PUBLIC_GITHUB_REPO and EXPO_PUBLIC_GITHUB_TOKEN in .env (read-only fine-grained
            token), then restart with `npx expo start -c`.
          </Text>
        </Panel>
      </View>
    );
  }

  const repo = state?.repo;
  const item = pick ? state?.issues.find((i) => i.number === pick.number) : null;

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Tag color={C.dim}>{repo ? repo.fullName : GITHUB.repo}</Tag>
        <Meta ms={ms} tokens={tokens} />
      </View>

      <Panel tone={err ? 'bad' : undefined}>
        <View style={s.statRow}>
          <Tag color={busy ? C.amber : C.faint}>
            {busy ? 'WORKING…' : repo ? `${repo.openIssues} OPEN · ${repo.language}` : 'LOADING…'}
          </Tag>
          <Text style={s.stamp}>{repo ? `push ${sincePushed(repo.pushedAt)}` : '—'}</Text>
        </View>

        {pick ? (
          <>
            <Text style={s.title}>
              #{pick.number}
              {item?.isPR ? ' PR' : ''} {item?.title ?? ''}
            </Text>
            <Text style={s.why}>{pick.why}</Text>
            <View style={s.actRow}>
              <Tag color={C.green}>NEXT</Tag>
              <Text style={s.action}>{pick.action}</Text>
            </View>
          </>
        ) : (
          <Text style={s.why}>{busy ? 'asking the model what matters…' : 'no pick yet'}</Text>
        )}

        <Text style={s.hint}>
          wave = next pick · double = plan · triple = roast · hold = refresh · holdLong = standup
        </Text>
        <ErrLine msg={err} onRetry={() => void load()} />
      </Panel>

      <ScrollView style={s.body} contentContainerStyle={{ gap: 6 }}>
        {quip ? (
          <View style={s.quip}>
            <Tag color={quip.kind === 'roast' ? C.red : C.cyan}>
              {quip.kind === 'roast' ? 'ROAST' : 'STANDUP'}
            </Tag>
            <Text style={s.quipText}>{quip.line}</Text>
          </View>
        ) : steps ? (
          steps.map((st, i) => (
            <View key={`${i}-${st.slice(0, 8)}`} style={s.step}>
              <Text style={s.stepNo}>{i + 1}</Text>
              <Text style={s.stepText}>{st}</Text>
            </View>
          ))
        ) : (
          (state?.issues ?? []).slice(0, 12).map((i) => (
            <View key={i.number} style={[s.row, i.number === pick?.number && s.rowActive]}>
              <Text style={[s.num, i.number === pick?.number && { color: C.green }]}>#{i.number}</Text>
              <Text style={s.rowTitle} numberOfLines={1}>
                {i.title}
              </Text>
              <Text style={s.labels}>
                {i.isPR ? 'PR ' : ''}
                {i.labels.join(' ')}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <Text style={s.foot}>
        {state?.ms ?? 0} ms from github · {state?.commits.length ?? 0} commits read · {LLM.model}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  gate: { fontFamily: MONO, fontSize: 11, color: C.dim, lineHeight: 17, marginTop: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stamp: { fontFamily: MONO, fontSize: 9.5, color: C.faint },
  title: { fontFamily: MONO, fontSize: 13, color: C.text, lineHeight: 19, marginTop: 10 },
  why: { fontFamily: MONO, fontSize: 11, color: C.dim, lineHeight: 16, marginTop: 6 },
  actRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  action: { fontFamily: MONO, fontSize: 11, color: C.green, flex: 1, lineHeight: 16 },
  hint: { fontFamily: MONO, fontSize: 9.5, color: C.faint, marginTop: 10 },
  body: { flex: 1 },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#0f1720',
  },
  rowActive: { backgroundColor: '#0b1116' },
  num: { fontFamily: MONO, fontSize: 10, color: C.faint, width: 44 },
  rowTitle: { fontFamily: MONO, fontSize: 10.5, color: C.text, flex: 1 },
  labels: { fontFamily: MONO, fontSize: 8.5, color: C.cyan, letterSpacing: 0.4 },
  step: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#0f1720' },
  stepNo: { fontFamily: MONO, fontSize: 10, color: C.green, width: 14 },
  stepText: { fontFamily: MONO, fontSize: 11, color: C.text, flex: 1, lineHeight: 17 },
  quip: { gap: 8, paddingVertical: 10 },
  quipText: { fontFamily: MONO, fontSize: 13, color: C.text, lineHeight: 20 },
  foot: { fontFamily: MONO, fontSize: 10, color: C.faint, letterSpacing: 0.6 },
});
