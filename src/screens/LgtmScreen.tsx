import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, MONO } from '../theme';
import { useSfx } from '../sfx';
import { useWaveHandler } from '../waveBus';
import { proposeNext, reaction, type Proposal, type Risk } from '../llmTasks';
import { LLM } from '../config';
import { ErrLine, Meta, Panel, Tag } from '../ui';

type Entry = { id: number; text: string; kind: 'run' | 'ok' | 'no' | 'err'; ms?: number };

const riskColor = (r: Risk) =>
  r === 'extreme' ? C.red : r === 'high' ? C.amber : r === 'medium' ? C.cyan : C.dim;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function LgtmScreen() {
  const play = useSfx();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [log, setLog] = useState<Entry[]>([]);
  const [approved, setApproved] = useState(0);
  const [denied, setDenied] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [tokens, setTokens] = useState(0);
  const [yolo, setYolo] = useState(false);

  const idRef = useRef(1);
  const history = useRef<string[]>([]);
  const proposalRef = useRef<Proposal | null>(null);
  const inFlight = useRef(false);
  const yoloRef = useRef(false);
  const scrollRef = useRef<any>(null);

  proposalRef.current = proposal;

  const push = useCallback((text: string, kind: Entry['kind'], callMs?: number) => {
    setLog((l) => [...l.slice(-60), { id: idRef.current++, text, kind, ms: callMs }]);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd?.({ animated: true }));
  }, []);

  const track = useCallback((r: { ms: number; usage: any }) => {
    setMs(r.ms);
    setTokens((t) => t + (r.usage?.total ?? 0));
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      const { proposal: p, reply } = await proposeNext(history.current);
      setProposal(p);
      track(reply);
    } catch (e: any) {
      setErr(e?.message ?? 'request failed');
      setProposal(null);
    } finally {
      setBusy(false);
    }
  }, [track]);

  useEffect(() => {
    void load();
  }, [load]);

  const judge = useCallback(
    async (verdict: 'approve' | 'deny') => {
      const p = proposalRef.current;
      if (!p || inFlight.current) return;
      inFlight.current = true;
      setErr(null);
      play(verdict === 'approve' ? 'approve' : 'deny');
      Haptics.impactAsync(
        verdict === 'approve' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy,
      ).catch(() => {});
      push(`${verdict === 'approve' ? '✓' : '✕'} waved: ${p.tool} ${p.detail}`, 'run');
      history.current.push(`${p.tool} ${p.detail}`);
      if (verdict === 'approve') setApproved((n) => n + 1);
      else setDenied((n) => n + 1);
      setProposal(null);
      setBusy(true);
      try {
        const { line, reply } = await reaction(p, verdict);
        push(line, verdict === 'approve' ? 'ok' : 'no', reply.ms);
        track(reply);
      } catch (e: any) {
        push(`model: ${e?.message ?? 'failed'}`, 'err');
        setErr(e?.message ?? 'request failed');
      } finally {
        setBusy(false);
        inFlight.current = false;
      }
      void load();
    },
    [load, play, push, track],
  );

  const approve = useCallback(() => void judge('approve'), [judge]);

  const loop = useCallback(async () => {
    yoloRef.current = true;
    setYolo(true);
    while (yoloRef.current) {
      if (!inFlight.current) await judge('approve');
      await sleep(350);
    }
  }, [judge]);

  const stopYolo = useCallback(() => {
    yoloRef.current = false;
    setYolo(false);
  }, []);

  // long hold = new session: the agent forgets everything it just did
  const restart = useCallback(() => {
    stopYolo();
    history.current = [];
    setLog([]);
    setApproved(0);
    setDenied(0);
    play('panic');
    void load();
  }, [load, play, stopYolo]);

  useWaveHandler({
    onWave: approve,
    onHoldLong: restart,
    onHold: () => {
      stopYolo();
      void judge('deny');
    },
    onDouble: () => {
      if (yoloRef.current) stopYolo();
      else void loop();
    },
  });

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Tag color={C.dim}>{`AGENT · ${LLM.model}`}</Tag>
        <Meta ms={ms} tokens={tokens} />
      </View>

      <Panel tone={err ? 'bad' : undefined}>
        <View style={s.cardTop}>
          <Tag color={busy ? C.amber : C.faint}>
            {busy ? 'THINKING…' : yolo ? 'YOLO · AUTO-APPROVING' : 'AWAITING JUDGMENT'}
          </Tag>
          {proposal && <Text style={[s.tool, { color: riskColor(proposal.risk) }]}>{proposal.tool}</Text>}
        </View>

        <Text style={s.detail}>{proposal ? proposal.detail : busy ? '…' : 'no proposal yet'}</Text>

        {proposal && (
          <Text style={[s.risk, { color: riskColor(proposal.risk) }]}>
            risk: {proposal.risk} · wave = approve · hold = deny · double = auto · holdLong = reset
          </Text>
        )}

        <ErrLine msg={err} onRetry={() => void load()} />
      </Panel>

      <ScrollView ref={scrollRef} style={s.log} contentContainerStyle={{ paddingBottom: 8 }}>
        {log.map((e) => (
          <View key={e.id} style={s.entry}>
            <Text
              style={[
                s.entryText,
                e.kind === 'ok' && { color: C.green },
                e.kind === 'no' && { color: C.amber },
                e.kind === 'err' && { color: C.red },
                e.kind === 'run' && { color: C.dim },
              ]}
            >
              {e.text}
            </Text>
            {e.ms ? <Text style={s.entryMs}>{e.ms} ms</Text> : null}
          </View>
        ))}
      </ScrollView>

      <View style={s.foot}>
        <Text style={s.footText}>
          approved {approved} · denied {denied} · read 0
        </Text>
        {yolo && (
          <Pressable onPress={stopYolo} hitSlop={10}>
            <Text style={[s.footText, { color: C.red }]}>STOP</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tool: { fontFamily: MONO, fontSize: 12, letterSpacing: 1.4 },
  detail: { fontFamily: MONO, fontSize: 15, color: C.text, marginTop: 10, lineHeight: 22 },
  risk: { fontFamily: MONO, fontSize: 10, marginTop: 10, letterSpacing: 0.6 },
  log: { flex: 1, marginTop: 4 },
  entry: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 3, borderTopWidth: 1, borderTopColor: '#0f1720' },
  entryText: { fontFamily: MONO, fontSize: 10.5, color: C.text, flex: 1, lineHeight: 15 },
  entryMs: { fontFamily: MONO, fontSize: 9, color: C.faint },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footText: { fontFamily: MONO, fontSize: 10, color: C.faint, letterSpacing: 0.8 },
});
