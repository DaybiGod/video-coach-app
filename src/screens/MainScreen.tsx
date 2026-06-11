import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';

import { useCoachApp } from '../app/useCoachApp';
import ConnectionBadge from '../components/ConnectionBadge';
import PairingCard from '../components/PairingCard';
import RecordButton from '../components/RecordButton';
import { useAppStore } from '../state/appStore';

export default function MainScreen(): React.JSX.Element {
  useKeepAwake();
  const device = useCameraDevice('back');
  const { granted, outputs, toggleRecording } = useCoachApp();
  const clientConnected = useAppStore((s) => s.clientConnected);
  const lastError = useAppStore((s) => s.lastError);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {granted && device ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          outputs={outputs}
          constraints={[{ fps: 30 }]}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.center}>
          <Text style={styles.hint}>
            {granted ? 'Buscando camara trasera...' : 'Esperando permisos de camara y microfono...'}
          </Text>
        </View>
      )}

      <View style={styles.topBar} pointerEvents="box-none">
        <ConnectionBadge />
      </View>

      {!clientConnected && <PairingCard />}

      <View style={styles.bottomBar} pointerEvents="box-none">
        {lastError ? <Text style={styles.error}>{lastError}</Text> : null}
        <RecordButton onPress={() => void toggleRecording()} />
        <Text style={styles.hint}>Tu monitor de la PC es el espejo: mira al lente</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center' },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 10,
  },
  hint: { color: '#9a9a9a', fontSize: 13 },
  error: {
    color: '#ffb4b4',
    backgroundColor: '#46121299',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: '90%',
    fontSize: 12,
  },
});
