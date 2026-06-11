# Pasos para César — de cero a la app corriendo en tu iPhone

Todo esto se hace UNA vez (menos el paso 6, que es por cada build nueva).
Claude te puede guiar en vivo en cada paso.

## 1. Cuenta GitHub + subir el repo (gratis)

1. Crea cuenta en https://github.com (si no tienes).
2. Crea un repositorio **público** llamado `video-coach-app`
   (público = minutos ilimitados gratis del runner macOS; la app no tiene secretos).
3. En la PC, dentro de `mini-projects\video-coach-app\`:
   ```powershell
   git init -b main
   git add .
   git commit -m "Video Coach Cam v0.1"
   git remote add origin https://github.com/TU_USUARIO/video-coach-app.git
   git push -u origin main
   ```
4. El push dispara el workflow "Build iOS (sin firma)" automáticamente.
   Míralo en la pestaña **Actions** del repo (~15-20 min la primera vez).

## 2. Instalar iTunes (necesario 2 veces: Sideloadly Y el modo USB)

- Descarga iTunes de https://www.apple.com/itunes/ (instalador clásico de Apple,
  no el de Microsoft Store si te da problemas).
- Conecta el iPhone por cable, desbloquéalo y toca **"Confiar en este ordenador"**.

## 3. Instalar Sideloadly

- Descarga de https://sideloadly.io e instala.
- Si tu Apple ID tiene verificación en dos pasos, crea una **contraseña de aplicación**
  en https://appleid.apple.com → Iniciar sesión y seguridad → Contraseñas de apps.

## 4. Descargar el IPA del CI

- GitHub → tu repo → **Actions** → el run verde más reciente → **Artifacts** →
  descarga `VideoCoachCam-release` → descomprime el `.zip` → dentro está el `.ipa`.

## 5. Activar Modo de Desarrollador en el iPhone (una vez)

- iOS 16+: Ajustes → Privacidad y seguridad → **Modo de desarrollador** → activar →
  reiniciar → confirmar. (Si no aparece, hazlo después del primer intento de instalación.)

## 6. Instalar con Sideloadly (esto se repite por cada build nueva)

1. Abre Sideloadly, conecta el iPhone por USB.
2. Arrastra el `.ipa`, escribe tu Apple ID, **Start**.
3. Primera vez: en el iPhone → Ajustes → General → VPN y gestión de dispositivos →
   tu Apple ID → **Confiar**.
4. En Sideloadly activa **Auto refresh** y déjalo en la bandeja de Windows:
   re-firma la app sola antes de que caduquen los 7 días del Apple ID gratis.

Límites del Apple ID gratis: 3 apps sideloaded a la vez (usamos 2: release y dev-client)
y 10 App IDs nuevos por semana (por eso el bundleId `com.cesar.videocoachcam` NUNCA se cambia).

## 7. Probar

1. Abre **Video Coach Cam** en el iPhone (pide permisos de cámara/micrófono → Permitir;
   cuando la PC se conecte por Wi-Fi te pedirá **Red local** → Permitir).
2. La pantalla muestra `IP:47474` y un **PIN**.
3. En la PC:
   ```powershell
   cd mini-projects\video-coach
   python phone.py live --pin TU_PIN          # Wi-Fi (auto-escanea) o --host IP
   python phone.py doctor                     # diagnóstico del modo USB
   python phone.py live --transport usb --pin TU_PIN
   python phone.py record --seconds 20        # sesión completa con reporte
   ```
4. O dile a Claude: "conéctate al iPhone" (usa las tools MCP connect/live_analyze/
   start_practice...).

## Desarrollo con recarga instantánea (opcional, recomendado)

1. En Actions corre el workflow manualmente con profile `dev-client` y sideloadea
   también ese IPA (convive con el release).
2. En la PC: `cd video-coach-app; npx expo start` (permite node.exe en el firewall,
   redes privadas).
3. Abre el dev-client en el iPhone → escanea el QR de Metro → cualquier cambio JS/TS
   aparece al instante. Solo los cambios nativos requieren volver al CI.
