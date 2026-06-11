import { create } from 'zustand';

import { STREAM_DEFAULTS } from '../config/constants';

export type RecPhase = 'inactivo' | 'grabando' | 'preparando' | 'entregando';

interface AppState {
  // conexion
  clientConnected: boolean;
  clientAddress: string | null;
  serverReady: boolean;
  myIp: string | null;
  pin: string;
  // stream
  streamOn: boolean;
  maxFps: number;
  jpegQuality: number; // 0-100
  // grabacion
  recPhase: RecPhase;
  recStartedAt: number | null;
  deliverPct: number;
  lastError: string | null;

  set: (partial: Partial<AppState>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  clientConnected: false,
  clientAddress: null,
  serverReady: false,
  myIp: null,
  pin: '',
  streamOn: true,
  maxFps: STREAM_DEFAULTS.maxFps,
  jpegQuality: Math.round(STREAM_DEFAULTS.jpegQuality * 100),
  recPhase: 'inactivo',
  recStartedAt: null,
  deliverPct: 0,
  lastError: null,
  set: (partial) => set(partial),
}));
