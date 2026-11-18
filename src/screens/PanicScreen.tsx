import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, MONO } from '../theme';
import { useSfx } from '../sfx';
import { useWaveHandler } from '../waveBus';
import { diagnose } from '../llmTasks';
import { LLM } from '../config';
import { ErrLine, Meta, Panel, Tag } from '../ui';

type Line = { id: number; text: string; ms: number; at: number };

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function PanicScreen() {
  const play = useSfx();
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tokens, setTokens] = useState(0);
  const [ms, setMs] = useState<number | null>(null);
  const [t0, setT0] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  const idRef = useRef(1);
  const linesRef = useRef<Line[]>([]);
  const inFlight = useRef(false);
  const scrollRef = useRef<any>(null);
  linesRef.current = lines;

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(t);
  }, [t0]);

  const ask = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErr(null);
    play('panic');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
    const seconds = Math.floor((Date.now() - t0) / 1000);
    try {
      const { line, reply } = await diagnose(linesRef.current.map((l) => l.text), seconds);
      setLines((ls) => [...ls, { id: idRef.current++, text: line, ms: reply.ms, at: seconds }].slice(-12));
      setMs(reply.ms);
      setTokens((n) => n + (reply.usage?.total ?? 0));
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd?.({ animated: true }));
    } catch (e: any) {
      setErr(e?.message ?? 'request failed');
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, [play, t0]);

  const reset = useCallback(() => {
    setLines([]);
    setErr(null);
    setT0(Date.now());
    setElapsed(0);
    play('yolo');
  }, [play]);

  useWaveHandler({
    onWave: () => void ask(),
    onHold: reset,
    onDouble: () => {
      void ask();
      setTimeout(() => void ask(), 2600);
    },
  });

  const stage = lines.length + 1;

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Tag color={C.dim}>{`STUCK · ${LLM.model}`}</Tag>
        <Meta ms={ms} tokens={tokens} />
      </View>

      <Panel tone={err ? 'bad' : undefined}>
        <View style={s.top}>
          <Text style={[s.timer, { color: elapsed > 30 ? C.red : elapsed > 12 ? C.amber : C.dim }]}>
            {fmt(elapsed)}
          </Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Tag color={busy ? C.amber : C.faint}>{busy ? 'NARRATING…' : `TURN ${stage}`}</Tag>
            <Text style={s.sub}>{lines.length} lines · 0 files changed</Text>
          </View>
        </View>
        <View style={s.pips}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View
              key={i}
              style={[s.pip, { backgroundColor: i < Math.min(lines.length, 6) ? (i > 3 ? C.red : C.amber) : '#141c24' }]}
            />
          ))}
        </View>
        <Text style={s.hint}>wave = next line · hold = abandon task · double = two turns</Text>
        <ErrLine msg={err} onRetry={() => void ask()} />
      </Panel>

      <ScrollView ref={scrollRef} style={s.log} contentContainerStyle={{ paddingBottom: 8 }}>
        {lines.length === 0 && !busy && !err && (
          <Text style={s.empty}>wave to make it start explaining itself</Text>
        )}
        {lines.map((l, i) => (
          <View key={l.id} style={s.line}>
            <View style={s.lineHead}>
              <Text style={s.lineIdx}>
                [{String(l.at).padStart(3, '0')}s · turn {i + 1}]
              </Text>
              <Text style={s.lineMs}>{l.ms} ms</Text>
            </View>
            <Text style={[s.lineText, i === lines.length - 1 && { color: C.text }]}>{l.text}</Text>
          </View>
        ))}
      </ScrollView>

      <Text style={s.foot}>{lines.length ? `${lines.length} turns, no tool calls` : 'waiting'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timer: { fontFamily: MONO, fontSize: 30, letterSpacing: 1 },
  sub: { fontFamily: MONO, fontSize: 9.5, color: C.faint, marginTop: 3 },
  pips: { flexDirection: 'row', gap: 4, marginTop: 12 },
  pip: { flex: 1, height: 3, borderRadius: 2 },
  hint: { fontFamily: MONO, fontSize: 9.5, color: C.faint, marginTop: 10 },
  log: { flex: 1 },
  empty: { fontFamily: MONO, fontSize: 11, color: C.faint, paddingVertical: 12 },
  line: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#0f1720' },
  lineHead: { flexDirection: 'row', justifyContent: 'space-between' },
  lineIdx: { fontFamily: MONO, fontSize: 9, color: C.faint, letterSpacing: 0.5 },
  lineMs: { fontFamily: MONO, fontSize: 9, color: C.faint },
  lineText: { fontFamily: MONO, fontSize: 12, color: C.dim, lineHeight: 18, marginTop: 3 },
  foot: { fontFamily: MONO, fontSize: 10, color: C.faint, letterSpacing: 0.6 },
});
