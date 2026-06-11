import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppStore } from '../state/appStore';

export default function RecordButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  const phase = useAppStore((s) => s.recPhase);
  const startedAt = useAppStore((s) => s.recStartedAt);
  const pct = useAppStore((s) => s.deliverPct);

  if (phase === 'preparando' || phase === 'entregando') {
    return (
      <View style={styles.busy}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.busyText}>
          {phase === 'preparando' ? 'Preparando archivo...' : `Enviando a la PC ${pct}%`}
        </Text>
      </View>
    );
  }

  const grabando = phase === 'grabando';
  const elapsed = grabando && startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
  return (
    <View style={styles.column}>
      {grabando ? <Text style={styles.timer}>{elapsed}s</Text> : null}
      <Pressable onPress={onPress} style={[styles.outer, grabando && styles.outerRec]}>
        <View style={[styles.inner, grabando && styles.innerRec]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: 6 },
  timer: { color: '#ff5b5b', fontWeight: '700', fontVariant: ['tabular-nums'] },
  outer: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#ffffffcc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRec: { borderColor: '#ff5b5b' },
  inner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#ff3b30' },
  innerRec: { width: 30, height: 30, borderRadius: 6 },
  busy: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: '#000000aa',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  busyText: { color: '#fff', fontSize: 14 },
});
