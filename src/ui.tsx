import { StyleSheet, Text, View } from 'react-native';
import { C, MONO } from './theme';

export function Panel({ children, tone }: { children: React.ReactNode; tone?: 'bad' }) {
  return <View style={[s.panel, tone === 'bad' && { borderColor: '#40201f' }]}>{children}</View>;
}

export function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return <Text style={[s.tag, color ? { color } : null]}>{children}</Text>;
}

export function ErrLine({ msg, onRetry }: { msg: string | null; onRetry?: () => void }) {
  if (!msg) return null;
  return (
    <Text style={s.err} onPress={onRetry}>
      ✕ {msg}
      {onRetry ? '  ·  tap to retry' : ''}
    </Text>
  );
}

export function Meta({ ms, tokens }: { ms: number | null; tokens: number }) {
  return (
    <Text style={s.meta}>
      {ms === null ? '—' : `${ms} ms`} · {tokens} tok
    </Text>
  );
}

export function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    backgroundColor: C.panel,
    padding: 14,
  },
  tag: { fontFamily: MONO, fontSize: 9, letterSpacing: 1.8, color: C.faint },
  err: { fontFamily: MONO, fontSize: 10, color: C.red, lineHeight: 15, marginTop: 10 },
  meta: { fontFamily: MONO, fontSize: 9.5, color: C.faint, letterSpacing: 0.4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowLabel: { fontFamily: MONO, fontSize: 10, color: C.dim, letterSpacing: 1 },
  rowValue: { fontFamily: MONO, fontSize: 11, color: C.text },
});
