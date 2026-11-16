import { useEffect, useRef } from 'react';
import type { WaveEvent } from './waveDetector';

type Handler = {
  onWave?: () => void;
  onHold?: () => void;
  onDouble?: () => void;
};

let handlers: Handler[] = [];

export function dispatchWave(e: WaveEvent) {
  for (const h of handlers) {
    if (e === 'wave') h.onWave?.();
    else if (e === 'hold') h.onHold?.();
    else h.onDouble?.();
  }
}

/** Register a screen's gesture handlers. Only mounted screens receive events. */
export function useWaveHandler(handler: Handler) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const entry: Handler = {
      onWave: () => ref.current.onWave?.(),
      onHold: () => ref.current.onHold?.(),
      onDouble: () => ref.current.onDouble?.(),
    };
    handlers.push(entry);
    return () => {
      handlers = handlers.filter((h) => h !== entry);
    };
  }, []);
}
