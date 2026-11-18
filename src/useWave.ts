import { useCallback, useEffect, useRef, useState } from 'react';
import { LightSensor } from 'expo-sensors';
import { WaveDetector, type WaveEvent } from './waveDetector';

type Options = {
  onWave?: () => void;
  onDouble?: () => void;
  onTriple?: () => void;
  onHold?: () => void;
  onHoldLong?: () => void;
};

export type WaveState = {
  lux: number | null;
  baseline: number;
  covered: boolean;
  available: boolean | null;
  ready: boolean;
  simulate: (e: WaveEvent) => void;
};

/**
 * Turns the ambient-light sensor into a touchless "wave over the phone" gesture.
 * A hand over the top edge collapses illuminance toward zero; how long it stays
 * collapsed separates a wave, a hold and a double wave. The decision logic lives
 * in WaveDetector so it can be tested without a phone.
 */
export function useWave({ onWave, onDouble, onTriple, onHold, onHoldLong }: Options): WaveState {
  const [lux, setLux] = useState<number | null>(null);
  const [baseline, setBaseline] = useState(0);
  const [covered, setCovered] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);

  const cb = useRef<Options>({});
  cb.current = { onWave, onDouble, onTriple, onHold, onHoldLong };

  const det = useRef<WaveDetector | null>(null);
  if (!det.current) det.current = new WaveDetector();

  const emit = useCallback((events: WaveEvent[]) => {
    for (const e of events) {
      if (e === 'wave') cb.current.onWave?.();
      else if (e === 'double') cb.current.onDouble?.();
      else if (e === 'triple') cb.current.onTriple?.();
      else if (e === 'hold') cb.current.onHold?.();
      else cb.current.onHoldLong?.();
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let sub: { remove: () => void } | null = null;
    const detector = det.current!;

    const pump = setInterval(() => {
      if (!mounted) return;
      const events = detector.tick(Date.now());
      if (events.length) emit(events);
    }, 60);

    (async () => {
      let ok = false;
      try {
        ok = await LightSensor.isAvailableAsync();
      } catch {
        ok = false;
      }
      if (!mounted) return;
      setAvailable(ok);
      if (!ok) return;

      LightSensor.setUpdateInterval(80);
      let lastUi = 0;
      let lastCovered = false;
      sub = LightSensor.addListener(({ illuminance }) => {
        if (!mounted) return;
        const now = Date.now();
        const events = detector.push(illuminance, now);
        if (events.length) emit(events);

        // Re-rendering the tree on every 80ms sample makes the animations
        // stutter, so the readout only refreshes a few times a second.
        const coveredNow = detector.isCovered;
        if (now - lastUi > 220 || coveredNow !== lastCovered) {
          lastUi = now;
          lastCovered = coveredNow;
          setLux(Math.max(0, illuminance ?? 0));
          setBaseline(Math.round(detector.baseline));
          setCovered(coveredNow);
          setReady(detector.isReady);
        }
      });
    })();

    return () => {
      mounted = false;
      clearInterval(pump);
      sub?.remove();
    };
  }, [emit]);

  const simulate = useCallback((e: WaveEvent) => emit([e]), [emit]);

  return { lux, baseline, covered, available, ready, simulate };
}
