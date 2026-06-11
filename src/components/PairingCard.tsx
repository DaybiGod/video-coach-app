import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { SERVER_PORT } from '../config/constants';
import { useAppStore } from '../state/appStore';

export default function PairingCard(): React.JSX.Element {
  const myIp = useAppStore((s) => s.myIp);
  const pin = useAppStore((s) => s.pin);
  const direccion = myIp ? `${myIp}:${SERVER_PORT}` : 'sin Wi-Fi (usa USB)';
  const qrValue = `vc://${myIp ?? '0.0.0.0'}:${SERVER_PORT}?pin=${pin}`;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.card}>
        <Text style={styles.title}>Conecta desde tu PC</Text>
        {myIp ? (
          <View style={styles.qr}>
            <QRCode value={qrValue} size={120} backgroundColor="white" />
          </View>
        ) : null}
        <Text style={styles.line}>
          Wi-Fi: <Text style={styles.mono}>{direccion}</Text>
        </Text>
        <Text style={styles.line}>
          PIN: <Text style={styles.pin}>{pin || '----'}</Text>
        </Text>
        <Text style={styles.hint}>USB: conecta el cable y corre `python phone.py live`</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: '#000000cc',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    maxWidth: '85%',
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  qr: { backgroundColor: 'white', padding: 8, borderRadius: 8, marginBottom: 6 },
  line: { color: '#ddd', fontSize: 15 },
  mono: { fontFamily: 'Menlo', color: '#9fd3ff' },
  pin: { fontFamily: 'Menlo', color: '#ffd24d', fontSize: 22, fontWeight: '700', letterSpacing: 4 },
  hint: { color: '#8a8a8a', fontSize: 12, marginTop: 6, textAlign: 'center' },
});
