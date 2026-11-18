import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { C, MONO } from '../theme';
import { useLlm, type LlmConfig } from '../llm';
import { normaliseBaseUrl } from '../llmClient';

const PRESETS: { label: string; baseUrl: string; model: string }[] = [
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'Ollama (this Mac)', baseUrl: 'http://192.168.68.59:11434/v1', model: 'qwen3:4b' },
  { label: 'LM Studio', baseUrl: 'http://192.168.68.59:1234/v1', model: 'local-model' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
];

export default function SetupSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const llm = useLlm();
  const [draft, setDraft] = useState<LlmConfig>(llm.config);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (visible) {
      setDraft(llm.config);
      setResult(null);
    }
  }, [visible, llm.config]);

  if (!visible) return null;

  const set = (patch: Partial<LlmConfig>) => setDraft((d) => ({ ...d, ...patch }));

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    const r = await llm.probe({ ...draft, enabled: true });
    setTesting(false);
    setResult(
      r.ok
        ? { ok: true, msg: `answered in ${r.ms} ms — "${r.text}"` }
        : { ok: false, msg: r.error ?? 'failed' },
    );
  };

  const save = async () => {
    await llm.save({ ...draft, enabled: draft.enabled && !!draft.model.trim() });
    onClose();
  };

  return (
    <View style={s.overlay}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheet}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.head}>
            <Text style={s.title}>MODEL</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={s.close}>✕</Text>
            </Pressable>
          </View>
          <Text style={s.sub}>
            Any OpenAI-compatible endpoint. With it off, every line is scripted and the demo still runs.
          </Text>

          <View style={s.toggleRow}>
            <Text style={s.label}>LIVE INFERENCE</Text>
            <Switch
              value={draft.enabled}
              onValueChange={(v) => set({ enabled: v })}
              trackColor={{ false: C.border, true: C.greenDim }}
              thumbColor={draft.enabled ? C.green : C.faint}
            />
          </View>

          <View style={s.presets}>
            {PRESETS.map((p) => {
              const active = normaliseBaseUrl(draft.baseUrl) === normaliseBaseUrl(p.baseUrl);
              return (
                <Pressable
                  key={p.label}
                  onPress={() => set({ baseUrl: p.baseUrl, model: p.model })}
                  style={[s.preset, active && s.presetOn]}
                >
                  <Text style={[s.presetText, active && { color: C.green }]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Field label="BASE URL" value={draft.baseUrl} onChange={(v) => set({ baseUrl: v })} placeholder="https://api.openai.com/v1" />
          <Field label="MODEL" value={draft.model} onChange={(v) => set({ model: v })} placeholder="gpt-4o-mini" />
          <Field
            label="API KEY (optional for local)"
            value={draft.apiKey}
            onChange={(v) => set({ apiKey: v })}
            placeholder="sk-…"
            secret
          />

          <Text style={s.note}>
            Key is stored in the app's local storage in plain text — fine for a demo phone, not for shipping.
            {draft.baseUrl.startsWith('http://192.168') || draft.baseUrl.includes('localhost')
              ? '\nOn a real phone, localhost is the phone: use your Mac’s LAN IP.'
              : ''}
          </Text>

          <View style={s.actions}>
            <Pressable onPress={runTest} disabled={testing} style={[s.btn, s.btnGhost]}>
              <Text style={s.btnGhostText}>{testing ? 'TESTING…' : 'TEST'}</Text>
            </Pressable>
            <Pressable onPress={save} style={[s.btn, s.btnGo]}>
              <Text style={s.btnGoText}>SAVE</Text>
            </Pressable>
          </View>

          {result && (
            <Text style={[s.result, { color: result.ok ? C.green : C.red }]}>
              {result.ok ? '✓ ' : '✕ '}
              {result.msg}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secret,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secret}
        style={s.input}
      />
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(3,5,8,0.96)' },
  sheet: { flex: 1 },
  body: { padding: 18, paddingTop: 28 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: MONO, fontSize: 16, letterSpacing: 3, color: C.text },
  close: { fontFamily: MONO, fontSize: 18, color: C.dim },
  sub: { fontFamily: MONO, fontSize: 11, color: C.dim, lineHeight: 17, marginTop: 8 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.panel,
  },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  preset: { borderWidth: 1, borderColor: C.border, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 6 },
  presetOn: { borderColor: C.greenDim, backgroundColor: '#0c1a12' },
  presetText: { fontFamily: MONO, fontSize: 10, color: C.dim, letterSpacing: 0.8 },
  label: { fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.6, color: C.faint },
  input: {
    fontFamily: MONO,
    fontSize: 13,
    color: C.text,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginTop: 5,
    backgroundColor: C.panel2,
  },
  note: { fontFamily: MONO, fontSize: 9.5, color: C.faint, lineHeight: 15, marginTop: 14 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { flex: 1, paddingVertical: 11, borderRadius: 6, alignItems: 'center', borderWidth: 1 },
  btnGhost: { borderColor: C.border, backgroundColor: C.panel },
  btnGhostText: { fontFamily: MONO, fontSize: 11, letterSpacing: 1.6, color: C.dim },
  btnGo: { borderColor: C.greenDim, backgroundColor: '#0c1a12' },
  btnGoText: { fontFamily: MONO, fontSize: 11, letterSpacing: 1.6, color: C.green },
  result: { fontFamily: MONO, fontSize: 10.5, lineHeight: 16, marginTop: 14 },
});
