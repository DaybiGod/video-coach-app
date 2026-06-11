import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Video Coach Cam',
  slug: 'video-coach-cam',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  ios: {
    // NO cambiar nunca: el Apple ID gratis limita a 10 App IDs nuevos por semana.
    bundleIdentifier: 'com.cesar.videocoachcam',
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription:
        'Esta app usa la camara para grabar tus videos y enviar la vista previa a tu PC.',
      NSMicrophoneUsageDescription:
        'Esta app usa el microfono para grabar el audio de tus videos.',
      NSLocalNetworkUsageDescription:
        'Se necesita acceso a la red local para que tu PC se conecte a esta camara.',
      UIRequiresFullScreen: true,
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    },
  },
  plugins: [
    // VisionCamera v5 (Nitro) ya no trae config plugin: los permisos van por infoPlist.
    'expo-dev-client',
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '16.4' },
      },
    ],
  ],
};

export default config;
