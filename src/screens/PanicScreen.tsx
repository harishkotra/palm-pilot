import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, MONO } from '../theme';
import { useSfx } from '../sfx';
import { useWaveHandler } from '../waveBus';

const STAGES = [
  { title: 'still thinking', body: 'It is four minutes into a twelve-second task.', detail: 'no tool calls · no output · no clue' },
  { title: 'reading everything', body: 'It has opened 41 files and written none.', detail: 'the agent is "gathering context"' },
  { title: 'about to refactor', body: 'It is very confident. That is the worrying part.', detail: '18 files staged for "small cleanup"' },
  { title: 'loop detected', body: 'It is re-reading its own plan for the third time.', detail: 'you have said "continue" four times' },
  { title: 'it does not know', body: 'Neither do you. That is the real finding.', detail: 'recommended action: stop prompting' },
];

export default function PanicScreen() {
  const play = useSfx();
  const [stage, setStage] = useState(0);
  const [seconds, setSeconds] = useState(4 * 60 + 12);
  const [waves, setWaves] = useState(0);

  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const thump = useCallback(() => {
    ring1.setValue(0);
    ring2.setValue(0);
    Animated.timing(ring1, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    Animated.timing(ring2, {
      toValue: 1,
      duration: 1400,
      delay: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [ring1, ring2]);

  const escalate = useCallback(() => {
    setStage((s) => Math.min(s + 1, STAGES.length - 1));
    setWaves((w) => w + 1);
    play('panic');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    thump();
  }, [play, thump]);

  useWaveHandler({
    onWave: escalate,
    onHold: () => {
      setStage(0);
      setSeconds(0);
      setWaves(0);
      play('yolo');
      thump();
    },
    onDouble: escalate,
  });

  const st = STAGES[stage];
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <View style={s.root}>
      <View style={s.center}>
        {[ring1, ring2].map((r, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              s.ring,
              {
                opacity: r.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0.12, 0] }),
                transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.5 + i * 0.2] }) }],
                borderColor: stage >= 3 ? C.red : C.amber,
              },
            ]}
          />
        ))}
        <Text style={s.timer}>
          {mm}:{ss}
        </Text>
        <Text style={s.timerLabel}>since last tool call</Text>
      </View>

      <View style={[s.panel, stage >= 3 && { borderColor: '#40201f' }]}>
        <Text style={[s.stageTag, stage >= 3 && { color: C.red }]}>DIAGNOSIS {stage + 1}/5</Text>
        <Text style={s.title}>{st.title}</Text>
        <Text style={s.body}>{st.body}</Text>
        <Text style={s.detail}>↳ {st.detail}</Text>
      </View>

      <View style={s.footer}>
        <Text style={s.hint}>wave to escalate · hold to reset the session</Text>
        <Text style={s.waves}>waves offered: {waves}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, justifyContent: 'space-between', paddingBottom: 8 },
  center: { alignItems: 'center', justifyContent: 'center', height: 220 },
  ring: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 1.5 },
  timer: { fontFamily: MONO, fontSize: 46, color: C.text, letterSpacing: 2 },
  timerLabel: { fontFamily: MONO, fontSize: 10, color: C.faint, letterSpacing: 2, marginTop: 4 },
  panel: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 16, gap: 8 },
  stageTag: { fontFamily: MONO, fontSize: 10, letterSpacing: 1.8, color: C.amber },
  title: { fontFamily: MONO, fontSize: 20, color: C.text },
  body: { fontFamily: MONO, fontSize: 13, color: C.dim, lineHeight: 20 },
  detail: { fontFamily: MONO, fontSize: 11, color: C.faint },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hint: { fontFamily: MONO, fontSize: 10, color: C.faint },
  waves: { fontFamily: MONO, fontSize: 10, color: C.faint },
});
