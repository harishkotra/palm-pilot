import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { C, MONO } from './src/theme';
import { useWave } from './src/useWave';
import { dispatchWave } from './src/waveBus';
import LgtmScreen from './src/screens/LgtmScreen';
import CompactScreen from './src/screens/CompactScreen';
import PanicScreen from './src/screens/PanicScreen';

const TABS = [
  { key: 'lgtm', label: 'LGTM' },
  { key: 'compact', label: '/COMPACT' },
  { key: 'panic', label: 'PANIC' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function App() {
  useKeepAwake();
  const [tab, setTab] = useState<TabKey>('lgtm');

  const wave = useWave({
    onWave: () => dispatchWave('wave'),
    onHold: () => dispatchWave('hold'),
    onDouble: () => dispatchWave('double'),
  });

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.header}>
          <View>
            <Text style={s.wordmark}>PALM PILOT</Text>
            <Text style={s.tagline}>your agent, approved by hand</Text>
          </View>
          <View style={s.sensor}>
            <View style={[s.dot, { backgroundColor: wave.covered ? C.amber : wave.ready ? C.green : C.faint }]} />
            <Text style={s.sensorText}>{wave.lux === null ? 'no data' : `${Math.round(wave.lux)} lux`}</Text>
          </View>
        </View>

        <View style={s.tabs}>
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[s.tab, tab === t.key && s.tabActive]}>
              <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={s.body}>
          {tab === 'lgtm' && <LgtmScreen />}
          {tab === 'compact' && <CompactScreen />}
          {tab === 'panic' && <PanicScreen />}
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>
            {wave.available === false
              ? 'light sensor unavailable — use the sim buttons'
              : !wave.ready
                ? 'calibrating… hold still, phone in normal light'
                : `base ${wave.baseline} lux · wave over the top edge of the phone`}
          </Text>
          <View style={s.simRow}>
            <Pressable onPress={() => wave.simulate('wave')} style={s.sim}>
              <Text style={s.simText}>SIM WAVE</Text>
            </Pressable>
            <Pressable onPress={() => wave.simulate('hold')} style={s.sim}>
              <Text style={s.simText}>SIM HOLD</Text>
            </Pressable>
            <Pressable onPress={() => wave.simulate('double')} style={s.sim}>
              <Text style={s.simText}>SIM ×2</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  wordmark: { fontFamily: MONO, fontSize: 20, letterSpacing: 3, color: C.text },
  tagline: { fontFamily: MONO, fontSize: 10, color: C.faint, letterSpacing: 0.6, marginTop: 2 },
  sensor: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  sensorText: { fontFamily: MONO, fontSize: 11, color: C.dim },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 14, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  tabActive: { borderColor: C.greenDim, backgroundColor: '#0c1a12' },
  tabText: { fontFamily: MONO, fontSize: 11, letterSpacing: 1.4, color: C.dim },
  tabTextActive: { color: C.green },
  body: { flex: 1 },
  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border, gap: 8, paddingBottom: 4 },
  footerText: { fontFamily: MONO, fontSize: 10, color: C.faint },
  simRow: { flexDirection: 'row', gap: 8 },
  sim: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 4, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border },
  simText: { fontFamily: MONO, fontSize: 9.5, color: C.dim, letterSpacing: 1 },
});
