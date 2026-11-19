import { useCallback, useState } from 'react';
import { Linking, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { C, MONO } from './src/theme';
import { useSfx } from './src/sfx';
import { useWave } from './src/useWave';
import { dispatchWave } from './src/waveBus';
import { DEBUG_GESTURES, LLM, hasKey } from './src/config';
import LgtmScreen from './src/screens/LgtmScreen';
import CompactScreen from './src/screens/CompactScreen';
import PanicScreen from './src/screens/PanicScreen';
import RepoScreen from './src/screens/RepoScreen';
import SetupSheet from './src/screens/SetupSheet';

const TABS = ['LGTM', '/COMPACT', 'PANIC', '/REPO'] as const;

function Gate({ onOpen }: { onOpen: () => void }) {
  return (
    <View style={g.wrap}>
      <Text style={g.title}>no inference</Text>
      <Text style={g.body}>
        Every line in this app comes from the model. Copy <Text style={g.code}>.env.example</Text> to{' '}
        <Text style={g.code}>.env</Text>, fill in the key, then restart:
      </Text>
      <Text style={g.cmd}>npx expo start -c</Text>
      <Pressable onPress={onOpen} style={g.btn}>
        <Text style={g.btnText}>WHAT IT READS</Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  useKeepAwake();
  const play = useSfx();
  const [tab, setTab] = useState(0);
  const [setup, setSetup] = useState(false);

  const onWave = useCallback(() => {
    play('wave');
    dispatchWave('wave');
  }, [play]);
  const onHold = useCallback(() => dispatchWave('hold'), []);
  const onDouble = useCallback(() => dispatchWave('double'), []);
  const onTriple = useCallback(() => dispatchWave('triple'), []);
  const onHoldLong = useCallback(() => dispatchWave('holdLong'), []);

  const wave = useWave({ onWave, onDouble, onTriple, onHold, onHoldLong });

  const sensorText =
    wave.available === false
      ? 'no light sensor'
      : wave.lux === null
        ? 'warming up'
        : `${Math.round(wave.lux)} lx · base ${wave.baseline}${wave.covered ? ' · covered' : ''}`;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="light-content" />

        <View style={s.header}>
          <View>
            <Text style={s.brand}>PALM PILOT</Text>
            <Text style={s.sensor}>{sensorText}</Text>
          </View>
          <Pressable onPress={() => setSetup(true)} hitSlop={12} style={s.badge}>
            <View style={[s.dot, { backgroundColor: hasKey ? C.green : C.red }]} />
            <Text style={[s.badgeText, { color: hasKey ? C.green : C.red }]}>{LLM.model}</Text>
          </Pressable>
        </View>

        <View style={s.tabs}>
          {TABS.map((t, i) => (
            <Pressable key={t} onPress={() => setTab(i)} style={[s.tab, i === tab && s.tabOn]}>
              <Text style={[s.tabText, i === tab && { color: C.text }]}>{t}</Text>
            </Pressable>
          ))}
        </View>

        <View style={s.body}>
          {!hasKey ? (
            <Gate onOpen={() => setSetup(true)} />
          ) : tab === 0 ? (
            <LgtmScreen />
          ) : tab === 1 ? (
            <CompactScreen />
          ) : tab === 2 ? (
            <PanicScreen />
          ) : (
            <RepoScreen />
          )}
        </View>

        {DEBUG_GESTURES && (
          <View style={s.sim}>
            {(['wave', 'double', 'triple', 'hold', 'holdLong'] as const).map((e) => (
              <Pressable key={e} onPress={() => wave.simulate(e)} style={s.simBtn}>
                <Text style={s.simText}>
                  {e === 'wave' ? '×1' : e === 'double' ? '×2' : e === 'triple' ? '×3' : e === 'hold' ? 'HOLD' : 'HOLD+'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <SetupSheet visible={setup} onClose={() => setSetup(false)} />

        <View style={s.foot}>
          <Pressable onPress={() => Linking.openURL('https://harishkotra.me')} hitSlop={10}>
            <Text style={s.footText}>
              built by <Text style={s.footLink}>Harish Kotra</Text>
            </Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL('https://dailybuild.xyz')} hitSlop={10}>
            <Text style={s.footLink}>other builds ↗</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 8 },
  brand: { fontFamily: MONO, fontSize: 15, color: C.text, letterSpacing: 3.5 },
  sensor: { fontFamily: MONO, fontSize: 9, color: C.faint, marginTop: 3, letterSpacing: 0.6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontFamily: MONO, fontSize: 9, letterSpacing: 1 },
  tabs: { flexDirection: 'row', gap: 6, marginTop: 14 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 7, borderWidth: 1, borderColor: '#131c25', alignItems: 'center' },
  tabOn: { borderColor: C.border, backgroundColor: '#0b1219' },
  tabText: { fontFamily: MONO, fontSize: 9, color: C.faint, letterSpacing: 1 },
  body: { flex: 1, marginTop: 12 },
  sim: { flexDirection: 'row', gap: 6, paddingVertical: 10 },
  simBtn: { flex: 1, borderWidth: 1, borderColor: '#131c25', borderRadius: 7, paddingVertical: 8, alignItems: 'center' },
  simText: { fontFamily: MONO, fontSize: 9, color: C.dim, letterSpacing: 1 },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: '#0e1720',
  },
  footText: { fontFamily: MONO, fontSize: 8, color: C.faint, letterSpacing: 0.8 },
  footLink: { fontFamily: MONO, fontSize: 8, color: C.dim, letterSpacing: 0.8 },
});

const g = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', gap: 14 },
  title: { fontFamily: MONO, fontSize: 18, color: C.amber, letterSpacing: 1 },
  body: { fontFamily: MONO, fontSize: 11, color: C.dim, lineHeight: 18 },
  code: { color: C.cyan },
  cmd: { fontFamily: MONO, fontSize: 11, color: C.green },
  btn: { borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  btnText: { fontFamily: MONO, fontSize: 10, color: C.text, letterSpacing: 2 },
});
