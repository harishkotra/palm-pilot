import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, MONO } from '../theme';
import { LLM, hasKey } from '../config';
import { probe } from '../llmClient';
import { target } from '../llmTasks';
import { Row } from '../ui';

export default function SetupSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');

  if (!visible) return null;

  const test = async () => {
    setState('busy');
    setMsg('calling the API…');
    try {
      const r = await probe(target());
      setState('ok');
      setMsg(`ok · ${r.ms} ms · ${r.usage?.total ?? '?'} tok · "${r.text.slice(0, 40)}"`);
    } catch (e: any) {
      setState('err');
      setMsg(e?.message ?? 'failed');
    }
  };

  return (
    <View style={s.overlay}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.head}>
          <Text style={s.title}>inference</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={s.close}>CLOSE</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ gap: 8 }}>
          <Row label="BASE URL" value={LLM.baseUrl.replace(/^https?:\/\//, '')} />
          <Row label="MODEL" value={LLM.model} color={C.green} />
          <Row label="EFFORT" value={LLM.reasoningEffort} />
          <Row label="MAX TOKENS" value={String(LLM.maxTokens)} />
          <Row
            label="API KEY"
            value={hasKey ? `set · ${LLM.apiKey.length} chars` : 'missing'}
            color={hasKey ? C.green : C.red}
          />

          <Text style={s.note}>
            Read from .env at build time. Change a value, then restart with{'\n'}
            <Text style={s.code}>npx expo start -c</Text>
            {'\n'}and reload the app.
          </Text>

          <Pressable
            onPress={() => void test()}
            disabled={state === 'busy'}
            style={[s.btn, state === 'busy' && { opacity: 0.5 }]}
          >
            <Text style={s.btnText}>{state === 'busy' ? 'TESTING…' : 'TEST CONNECTION'}</Text>
          </Pressable>

          {!!msg && (
            <Text style={[s.result, state === 'ok' && { color: C.green }, state === 'err' && { color: C.red }]}>
              {msg}
            </Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000a' },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 20,
    maxHeight: '78%',
    backgroundColor: '#080d13',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 16,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontFamily: MONO, fontSize: 13, color: C.text, letterSpacing: 1.5 },
  close: { fontFamily: MONO, fontSize: 10, color: C.dim, letterSpacing: 1.5 },
  note: { fontFamily: MONO, fontSize: 10, color: C.faint, lineHeight: 16, marginTop: 8 },
  code: { color: C.cyan },
  btn: { borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  btnText: { fontFamily: MONO, fontSize: 11, color: C.text, letterSpacing: 2 },
  result: { fontFamily: MONO, fontSize: 10, color: C.dim, lineHeight: 15, marginTop: 4 },
});
