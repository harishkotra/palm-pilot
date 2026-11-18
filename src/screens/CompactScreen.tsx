import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, MONO } from '../theme';
import { useSfx } from '../sfx';
import { useWaveHandler } from '../waveBus';
import { compactFact, seedContext } from '../llmTasks';
import { LLM } from '../config';
import { ErrLine, Meta, Panel, Tag } from '../ui';

type Fact = { id: number; text: string; pinned?: boolean; to?: string };

export default function CompactScreen() {
  const play = useSfx();
  const [facts, setFacts] = useState<Fact[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [tokens, setTokens] = useState(0);
  const [passes, setPasses] = useState(0);

  const idRef = useRef(1);
  const factsRef = useRef<Fact[]>([]);
  const inFlight = useRef(false);
  factsRef.current = facts;

  const track = useCallback((r: { ms: number; usage: any }) => {
    setMs(r.ms);
    setTokens((t) => t + (r.usage?.total ?? 0));
  }, []);

  const seed = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const { facts: list, reply } = await seedContext();
      setFacts(list.map((text) => ({ id: idRef.current++, text })));
      setPasses(0);
      track(reply);
    } catch (e: any) {
      setErr(e?.message ?? 'request failed');
      setFacts([]);
    } finally {
      setBusy(false);
    }
  }, [track]);

  useEffect(() => {
    void seed();
  }, [seed]);

  const compress = useCallback(async () => {
    const live = factsRef.current.filter((f) => !f.to && !f.pinned);
    if (inFlight.current || live.length === 0) return;
    inFlight.current = true;
    setErr(null);
    setBusy(true);
    play('compact');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const { from, to, reply } = await compactFact(live.map((f) => f.text));
      setFacts((fs) => fs.map((f) => (f.text === from ? { ...f, to } : f)));
      setPasses((n) => n + 1);
      track(reply);
    } catch (e: any) {
      setErr(e?.message ?? 'request failed');
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, [play, track]);

  const pin = useCallback(() => {
    const live = factsRef.current.filter((f) => !f.to && !f.pinned);
    if (!live.length) return;
    const pick = live[Math.floor(Math.random() * live.length)];
    setFacts((fs) => fs.map((f) => (f.id === pick.id ? { ...f, pinned: true } : f)));
    play('deny');
  }, [play]);

  useWaveHandler({
    onWave: () => void compress(),
    onHold: pin,
    onDouble: () => void seed(),
  });

  const total = facts.length;
  const intact = facts.filter((f) => !f.to).length;
  const pct = total ? intact / total : 0;

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Tag color={C.dim}>{`CONTEXT · ${LLM.model}`}</Tag>
        <Meta ms={ms} tokens={tokens} />
      </View>

      <Panel tone={err ? 'bad' : undefined}>
        <View style={s.barRow}>
          <Tag color={busy ? C.amber : C.faint}>
            {busy ? 'COMPACTING…' : `${intact}/${total} INTACT`}
          </Tag>
          <Text style={s.passes}>{passes} passes</Text>
        </View>
        <View style={s.bar}>
          <View style={[s.barFill, { width: `${Math.max(2, pct * 100)}%`, backgroundColor: pct > 0.5 ? C.green : pct > 0.25 ? C.amber : C.red }]} />
        </View>
        <Text style={s.hint}>wave = compact · hold = pin · double = re-seed</Text>
        <ErrLine msg={err} onRetry={() => void seed()} />
      </Panel>

      <View style={s.list}>
        {facts.map((f) => (
          <View key={f.id} style={s.fact}>
            <Text style={[s.dash, f.to ? { color: C.red } : f.pinned ? { color: C.cyan } : { color: C.faint }]}>
              {f.to ? '✕' : f.pinned ? '◈' : '·'}
            </Text>
            <View style={{ flex: 1 }}>
              {f.to ? (
                <>
                  <Text style={s.old}>{f.text}</Text>
                  <Text style={s.now}>{f.to}</Text>
                </>
              ) : (
                <Text style={[s.text, f.pinned && { color: C.cyan }]}>{f.text}</Text>
              )}
            </View>
          </View>
        ))}
      </View>

      <Text style={s.foot}>
        {total - intact} facts destroyed this session
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  passes: { fontFamily: MONO, fontSize: 9.5, color: C.faint },
  bar: { height: 4, borderRadius: 2, backgroundColor: '#111a22', marginTop: 10, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
  hint: { fontFamily: MONO, fontSize: 9.5, color: C.faint, marginTop: 10 },
  list: { flex: 1, gap: 1 },
  fact: { flexDirection: 'row', gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#0f1720' },
  dash: { fontFamily: MONO, fontSize: 11, width: 12 },
  text: { fontFamily: MONO, fontSize: 11, color: C.text, lineHeight: 16 },
  old: { fontFamily: MONO, fontSize: 11, color: C.faint, lineHeight: 16, textDecorationLine: 'line-through' },
  now: { fontFamily: MONO, fontSize: 11, color: C.amber, lineHeight: 16, marginTop: 1 },
  foot: { fontFamily: MONO, fontSize: 10, color: C.faint, letterSpacing: 0.6 },
});
