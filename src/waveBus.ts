import { useEffect, useRef } from 'react';
import type { WaveEvent } from './waveDetector';

export type WaveHandlers = {
  onWave?: () => void;
  onDouble?: () => void;
  onTriple?: () => void;
  onHold?: () => void;
  onHoldLong?: () => void;
};

const KEYS: Record<WaveEvent, keyof WaveHandlers> = {
  wave: 'onWave',
  double: 'onDouble',
  triple: 'onTriple',
  hold: 'onHold',
  holdLong: 'onHoldLong',
};

/**
 * Only the mounted screen gets gestures. Without this, every tab would react to
 * the same wave and three model calls would fire at once.
 */
let current: WaveHandlers | null = null;

export function dispatchWave(e: WaveEvent) {
  current?.[KEYS[e]]?.();
}

export function useWaveHandler(handlers: WaveHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const proxy: WaveHandlers = {
      onWave: () => ref.current.onWave?.(),
      onDouble: () => ref.current.onDouble?.(),
      onTriple: () => ref.current.onTriple?.(),
      onHold: () => ref.current.onHold?.(),
      onHoldLong: () => ref.current.onHoldLong?.(),
    };
    current = proxy;
    return () => {
      if (current === proxy) current = null;
    };
  }, []);
}
