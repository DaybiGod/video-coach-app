import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppStore } from '../state/appStore';

export default function ConnectionBadge(): React.JSX.Element {
  const connected = useAppStore((s) => s.clientConnected);
  const address = useAppStore((s) => s.clientAddress);
  const serverReady = useAppStore((s) => s.serverReady);

  let texto = 'Iniciando...';
  let color = '#888';
  if (serverReady && !connected) {
    texto = 'Esperando a la PC';
    color = '#e0a93f';
  } else if (connected) {
    const esUsb = address?.startsWith('127.') || address === '::1';
    texto = `PC conectada (${esUsb ? 'USB' : 'Wi-Fi'})`;
    color = '#46c46e';
  }

  return (
    <View style={styles.badge}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.text}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#000000aa',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { color: '#eee', fontSize: 14, fontWeight: '600' },
});
