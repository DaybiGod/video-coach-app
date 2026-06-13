import { registerRootComponent } from 'expo';

import MainScreen from './src/screens/MainScreen';

// Red de seguridad: en build Release no hay redbox, asi que una excepcion fatal
// no atrapada cierra la app. Convertimos los no-fatales en logs y evitamos que un
// caso imprevisto (p.ej. un write tardio a un socket muerto) termine el proceso.
// La correccion real vive en SendQueue (writes a prueba de cierre); esto es defensa
// en profundidad para una app de captura que debe permanecer abierta y estable.
type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsLike {
  getGlobalHandler?: () => GlobalHandler;
  setGlobalHandler?: (h: GlobalHandler) => void;
}
const eu = (globalThis as unknown as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
if (eu?.setGlobalHandler) {
  const prev = eu.getGlobalHandler?.();
  eu.setGlobalHandler((error, isFatal) => {
    // eslint-disable-next-line no-console
    console.warn('[ErrorUtils] fatal capturado:', isFatal, error);
    if (!isFatal && prev) prev(error, isFatal); // no propagar fatales -> no cierra el proceso
  });
}

registerRootComponent(MainScreen);
