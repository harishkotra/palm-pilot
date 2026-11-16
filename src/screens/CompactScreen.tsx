import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, MONO, fmt } from '../theme';
import { useSfx } from '../sfx';
import { useWaveHandler } from '../waveBus';

const LIMIT = 200_000;
const PER_COMPACT = 27_000;

type Mem = { id: number; text: string; summary: string; state: 'intact' | 'compressed' | 'pinned' };

const SEED: Omit<Mem, 'id'>[] = [
  { text: 'we agreed to use Postgres, not Mongo', summary: 'db: postgres (probably)', state: 'intact' },
  { text: 'the client wants it by Friday', summary: 'deadline: friday-ish', state: 'intact' },
  { text: 'legacy auth uses MD5 — do not touch it', summary: 'auth: legacy, careful', state: 'intact' },
  { text: 'bug only reproduces on Safari iOS 16', summary: 'safari thing', state: 'intact' },
  { text: 'DO NOT refactor the billing module', summary: "don't touch billing?", state: 'intact' },
  { text: 'Priya owns the deploy keys', summary: 'deploy: someone', state: 'intact' },
  { text: 'pricing tier names were decided on a call', summary: 'pricing: as discussed', state: 'intact' },
  { text: 'old API deprecated, 3 customers still on it', summary: 'api: deprecated something', state: 'intact' },
  { text: 'the migration must run before the deploy', summary: 'migration: order matters?', state: 'intact' },
];

let id = 1;
const seed = () => SEED.map((m) => ({ ...m, id: id++ }));

export default function CompactScreen() {
  const play = useSfx();
  const [tokens, setTokens] = useState(187_431);
  const [mems, setMems] = useState<Mem[]>(seed);
  const [compactions, setCompactions] = useState(0);
  const [line, setLine] = useState('context loaded · 9 facts in memory');

  const bar = useRef(new Animated.Value(187_431 / LIMIT)).current;

  useEffect(() => {
    Animated.timing(bar, {
      toValue: tokens / LIMIT,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [tokens, bar]);

  const intact = mems.filter((m) => m.state === 'intact');
  const lost = mems.filter((m) => m.state === 'compressed').length;
  const integrity = Math.round(((mems.length - lost) / mems.length) * 100);

  const compact = useCallback(() => {
    if (tokens <= 0) {
      setLine('nothing left to compact. nothing left.');
      return;
    }
    setTokens((t) => Math.max(0, t - PER_COMPACT));
    setCompactions((n) => n + 1);
    play('compact');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    setMems((prev) => {
      const next = [...prev];
      const target = next.find((m) => m.state === 'intact');
      if (target) {
        target.state = 'compressed';
        setLine(`"${target.text}" → "${target.summary}"`);
      } else {
        setLine('no facts left. only vibes.');
      }
      return next;
    });
  }, [play, tokens]);

  useWaveHandler({
    onWave: compact,
    onHold: () => {
      setMems((prev) => {
        const next = [...prev];
        const target = next.find((m) => m.state === 'intact');
        if (target) {
          target.state = 'pinned';
          setLine(`pinned: "${target.text}" — survives compaction`);
          play('approve');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } else {
          setLine('nothing intact left to pin.');
        }
        return next;
      });
    },
    onDouble: () => {
      setTokens(0);
      setMems((prev) => prev.map((m) => (m.state === 'pinned' ? m : { ...m, state: 'compressed' })));
      setLine('HARD RESET. you have forgotten why you started.');
      play('deny');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    },
  });

  const barWidth = bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const barColor = tokens / LIMIT > 0.5 ? C.green : tokens / LIMIT > 0.2 ? C.amber : C.red;

  return (
    <View style={s.root}>
      <View style={s.topRow}>
        <Text style={s.label}>CONTEXT WINDOW</Text>
        <Text style={s.mono}>
          {fmt(tokens)} <Text style={s.dim}>/ {fmt(LIMIT)}</Text>
        </Text>
      </View>

      <View style={s.barTrack}>
        <Animated.View style={[s.barFill, { width: barWidth, backgroundColor: barColor }]} />
      </View>

      <View style={s.statRow}>
        <Text style={s.stat}>
          compactions <Text style={s.cyan}>{compactions}</Text>
        </Text>
        <Text style={s.stat}>
          facts lost <Text style={s.red}>{lost}</Text>
        </Text>
        <Text style={s.stat}>
          integrity <Text style={integrity > 60 ? s.green : s.amber}>{integrity}%</Text>
        </Text>
      </View>

      <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: 12 }}>
        {mems.map((m) => (
          <View key={m.id} style={s.mem}>
            <Text style={s.bullet}>{m.state === 'intact' ? '●' : m.state === 'pinned' ? '◈' : '○'}</Text>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  s.memText,
                  m.state === 'compressed' && s.memDead,
                  m.state === 'pinned' && { color: C.cyan },
                ]}
              >
                {m.text}
              </Text>
              {m.state === 'compressed' && <Text style={s.summary}>↳ {m.summary}</Text>}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={s.footer}>
        <Text style={s.hint}>wave to compact · hold to pin a fact · double-wave to reset</Text>
        <Text style={s.line}>{line}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontFamily: MONO, fontSize: 10, letterSpacing: 1.8, color: C.dim },
  mono: { fontFamily: MONO, fontSize: 13, color: C.text },
  dim: { color: C.faint },
  barTrack: { height: 10, backgroundColor: C.panel2, borderRadius: 5, marginTop: 8, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  barFill: { height: '100%', borderRadius: 5 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  stat: { fontFamily: MONO, fontSize: 11, color: C.dim },
  cyan: { color: C.cyan },
  green: { color: C.green },
  amber: { color: C.amber },
  red: { color: C.red },
  list: { flex: 1, marginTop: 16 },
  mem: { flexDirection: 'row', gap: 8, marginBottom: 11 },
  bullet: { fontFamily: MONO, fontSize: 12, color: C.faint, marginTop: 1 },
  memText: { fontFamily: MONO, fontSize: 13, color: C.text, lineHeight: 19 },
  memDead: { color: C.faint, textDecorationLine: 'line-through' },
  summary: { fontFamily: MONO, fontSize: 11.5, color: C.amber, marginTop: 2 },
  footer: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, paddingBottom: 6 },
  hint: { fontFamily: MONO, fontSize: 10, color: C.faint },
  line: { fontFamily: MONO, fontSize: 12, color: C.dim, marginTop: 6, minHeight: 32 },
});
