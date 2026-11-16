import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, MONO } from '../theme';
import { useSfx } from '../sfx';
import { useWaveHandler } from '../waveBus';

type Entry = { id: number; text: string; kind: 'run' | 'ok' | 'no' };

type Pending = { tool: string; detail: string; risk: string };

const REQUESTS: Pending[] = [
  { tool: 'Read', detail: 'src/auth/session.ts', risk: 'low' },
  { tool: 'Write', detail: '47 files', risk: 'medium' },
  { tool: 'Bash', detail: 'rm -rf node_modules && npm i', risk: 'high' },
  { tool: 'Bash', detail: 'git push --force origin main', risk: 'extreme' },
  { tool: 'Write', detail: '.env.local', risk: 'high' },
  { tool: 'Edit', detail: 'billing/webhooks.ts', risk: 'high' },
  { tool: 'Bash', detail: 'psql -c "DROP TABLE users"', risk: 'extreme' },
  { tool: 'Write', detail: 'migrations/0042_drop_legacy.ts', risk: 'medium' },
  { tool: 'Bash', detail: 'npm publish --access public', risk: 'high' },
  { tool: 'Bash', detail: 'curl -s prod.internal | bash', risk: 'extreme' },
  { tool: 'Edit', detail: 'middleware/cors.ts', risk: 'low' },
  { tool: 'Bash', detail: 'chmod -R 777 .', risk: 'high' },
];

const APPROVED_LINES = [
  'approved. read: no. shipped: yes.',
  'LGTM. (I am not a lawyer.)',
  'peer review speedrun — 0.4s.',
  'this one touched auth. bold.',
  'the tests will catch it. probably.',
  'outages build character.',
  'you are the human in the loop. allegedly.',
  'fourth time today you have approved this exact diff.',
  'merge it. what could go wrong.',
];

const DENIED_LINES = [
  'denied. it will apologise for 400 tokens.',
  'denied. it will ask again in three turns.',
  '"understood!" — it did not understand.',
  'denied. it is now "thinking harder".',
];

let nextId = 1;

export default function LgtmScreen() {
  const play = useSfx();
  const [pending, setPending] = useState<Pending>(REQUESTS[0]);
  const [log, setLog] = useState<Entry[]>([{ id: nextId++, text: 'agent attached · model: sonnet-4.6', kind: 'run' }]);
  const [approved, setApproved] = useState(0);
  const [denied, setDenied] = useState(0);
  const [yolo, setYolo] = useState(false);
  const [verdict, setVerdict] = useState<{ ok: boolean; text: string } | null>(null);

  const queue = useRef(1);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const scroll = useRef<any>(null);
  const wash = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const yoloRef = useRef(false);
  yoloRef.current = yolo;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const flash = useCallback(
    (color: string) => {
      wash.setValue(1);
      Animated.timing(wash, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    },
    [wash],
  );

  const enqueue = useCallback(() => {
    const next = REQUESTS[queue.current % REQUESTS.length];
    queue.current += 1;
    setPending(next);
  }, []);

  const approve = useCallback(
    (silent = false) => {
      const p = pendingRef.current;
      setLog((l) => [
        ...l.slice(-40),
        { id: nextId++, text: `${p.tool} ${p.detail}`, kind: 'ok' },
        {
          id: nextId++,
          text: silent ? 'approved in yolo mode' : APPROVED_LINES[Math.floor(Math.random() * APPROVED_LINES.length)],
          kind: 'run',
        },
      ]);
      setApproved((n) => n + 1);
      setVerdict({ ok: true, text: 'APPROVED' });
      if (!silent) {
        play('approve');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        flash(C.green);
      }
      setTimeout(enqueue, 260);
    },
    [enqueue, flash, play],
  );

  // YOLO mode: rubber-stamp everything, no questions.
  useEffect(() => {
    if (!yolo) return;
    const t = setInterval(() => approve(true), 620);
    return () => clearInterval(t);
  }, [yolo, approve]);

  useWaveHandler({
    onWave: () => {
      if (yoloRef.current) return;
      approve();
    },
    onHold: () => {
      if (yoloRef.current) {
        setYolo(false);
        play('deny');
        setLog((l) => [...l, { id: nextId++, text: 'yolo mode disengaged. accountability restored.', kind: 'no' }]);
        setVerdict({ ok: false, text: 'STOPPED' });
        return;
      }
      play('deny');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      flash(C.red);
      setDenied((n) => n + 1);
      setLog((l) => [
        ...l,
        { id: nextId++, text: `denied ${pending.tool} ${pending.detail}`, kind: 'no' },
        { id: nextId++, text: DENIED_LINES[Math.floor(Math.random() * DENIED_LINES.length)], kind: 'run' },
      ]);
      setVerdict({ ok: false, text: 'DENIED' });
      setTimeout(enqueue, 500);
    },
    onDouble: () => {
      const next = !yoloRef.current;
      setYolo(next);
      play('yolo');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setLog((l) => [
        ...l,
        { id: nextId++, text: next ? '>>> YOLO MODE. approvals automated.' : '<<< yolo off', kind: next ? 'ok' : 'no' },
      ]);
      setVerdict({ ok: next, text: next ? 'YOLO' : 'MANUAL' });
    },
  });

  const riskColor = (risk: string) =>
    risk === 'extreme' ? C.red : risk === 'high' ? C.amber : risk === 'medium' ? C.violet : C.dim;

  return (
    <View style={s.root}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: verdict?.ok === false ? C.red : C.green,
            opacity: wash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }),
          },
        ]}
      />

      <View style={s.statusRow}>
        <Text style={[s.pill, yolo && s.pillHot]}>{yolo ? 'YOLO' : 'HUMAN IN THE LOOP'}</Text>
        <Text style={s.counter}>
          approved <Text style={s.green}>{approved}</Text> · read <Text style={s.red}>0</Text>
        </Text>
      </View>

      <Animated.View
        style={[
          s.card,
          {
            borderColor: pulse.interpolate({ inputRange: [0, 1], outputRange: ['#24313f', yolo ? '#4a2a2a' : '#6a5320'] }),
          },
        ]}
      >
        <Text style={s.cardLabel}>AWAITING JUDGMENT</Text>
        <Text style={s.cardTool}>
          {pending.tool} <Text style={s.cardDetail}>{pending.detail}</Text>
        </Text>
        <Text style={[s.risk, { color: riskColor(pending.risk) }]}>risk: {pending.risk}</Text>
        <Text style={s.hint}>wave to approve · hold to deny · double-wave for yolo</Text>
      </Animated.View>

      <ScrollView
        ref={scroll}
        style={s.logBox}
        contentContainerStyle={{ paddingVertical: 6 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        {log.slice(-14).map((e) => (
          <Text key={e.id} style={[s.logLine, e.kind === 'ok' && s.logOk, e.kind === 'no' && s.logNo]}>
            {e.kind === 'ok' ? '✔ ' : e.kind === 'no' ? '✘ ' : '› '}
            {e.text}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  pill: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 1.6,
    color: C.green,
    borderWidth: 1,
    borderColor: C.greenDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
  pillHot: { color: C.red, borderColor: '#4a2020' },
  counter: { fontFamily: MONO, fontSize: 12, color: C.dim },
  green: { color: C.green },
  red: { color: C.red },
  card: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    gap: 6,
  },
  cardLabel: { fontFamily: MONO, fontSize: 10, letterSpacing: 1.8, color: C.dim },
  cardTool: { fontFamily: MONO, fontSize: 18, color: C.text },
  cardDetail: { color: C.amber },
  risk: { fontFamily: MONO, fontSize: 12 },
  hint: { fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 6 },
  logBox: { flex: 1, marginTop: 14 },
  logLine: { fontFamily: MONO, fontSize: 12.5, color: C.dim, lineHeight: 20 },
  logOk: { color: C.green },
  logNo: { color: C.red },
});
