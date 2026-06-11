# Video Coach Cam — tu propia cámara de iPhone para el Video Coach

App de iPhone (Expo SDK 56 + VisionCamera v5) que reemplaza a Camo/DroidCam:

- **Graba el video final en el iPhone** con calidad nativa (4K, cámara trasera) y lo
  **transfiere automáticamente a la PC** al terminar (con reanudación si se corta).
- Manda un **stream en vivo** (360x640 JPEG ~12fps) a la PC para el coaching en tiempo real.
- Funciona por **Wi-Fi** (la PC se conecta a la IP del teléfono) y por **USB**
  (túnel usbmux vía iTunes) con el mismo protocolo (`docs/protocolo_vcp.md` del repo PC).
- La app **escucha** en el puerto TCP 47474; la PC siempre hace la conexión saliente.
- Emparejamiento por PIN (persistente) + token de reconexión.

El lado PC vive en `../video-coach/` (cliente Python, análisis MediaPipe/Whisper, MCP
para Claude, y `sim_phone.py` — el simulador que define el comportamiento esperado de
esta app).

## Cómo se compila (sin Mac, sin pagar Apple)

GitHub Actions (runner macOS, gratis e ilimitado en repos públicos) corre
`.github/workflows/ios-build.yml`: `expo prebuild` → `pod install` → `xcodebuild` con
`CODE_SIGNING_ALLOWED=NO` → artefacto `.ipa` SIN firmar. Se instala con **Sideloadly**
en Windows usando un Apple ID gratis (re-firma automática cada 7 días).

Pasos completos para humanos: **PASOS_CESAR.md**.

## Desarrollo diario desde Windows

- Cambios JS/TS (el 95%): `npx expo start` en la PC y abrir el IPA **dev-client** en el
  iPhone → conecta a Metro por la LAN → recarga al instante. Sin rebuilds.
- Cambios nativos (dependencias con código nativo, app.config.ts): push → CI (~15 min)
  → descargar IPA → Sideloadly.
- `npm run typecheck` valida contra los tipos reales de VisionCamera v5 (ya pasa limpio).

## Estructura

```
src/
├── config/constants.ts      puertos, defaults del stream, límites
├── protocol/                framing VCP/1 (espejo de coach/protocol.py)
├── net/
│   ├── TcpCoachServer.ts    servidor TCP, AUTH por PIN/token, ruteo de mensajes
│   ├── SendQueue.ts         backpressure: control > frames (slot de 1), drop automático
│   └── FileSender.ts        entrega del 4K con sha256, reanudación y pendiente persistido
├── camera/
│   ├── pipeline.ts          frame output RGB 360x640 → JPEG (nitro-image) → TCP
│   └── recording.ts         grabación 4K local + hash + alta del pendiente
├── app/useCoachApp.ts       orquestador (server + stream + grabación + stats)
├── state/appStore.ts        zustand
├── screens/MainScreen.tsx   preview + badge de conexión + PIN/QR + botón grabar
└── components/              PairingCard, ConnectionBadge, RecordButton
```

## Validación

- `npm run typecheck` — 0 errores contra VisionCamera 5.0.11 / SDK 56.
- El comportamiento del protocolo se valida contra el cliente real de la PC:
  `python e2e_test.py` (repo video-coach) usa `sim_phone.py`, que es la especificación
  ejecutable que esta app replica. Para probar la app real: `python phone.py live`.
