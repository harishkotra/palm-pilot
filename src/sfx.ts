import { useCallback } from 'react';
import { useAudioPlayer } from 'expo-audio';

export type SfxName = 'wave' | 'approve' | 'deny' | 'yolo' | 'compact' | 'panic';

const SRC = {
  wave: require('../assets/sounds/wave.wav'),
  approve: require('../assets/sounds/approve.wav'),
  deny: require('../assets/sounds/deny.wav'),
  yolo: require('../assets/sounds/yolo.wav'),
  compact: require('../assets/sounds/compact.wav'),
  panic: require('../assets/sounds/panic.wav'),
} as const;

export function useSfx() {
  const wave = useAudioPlayer(SRC.wave);
  const approve = useAudioPlayer(SRC.approve);
  const deny = useAudioPlayer(SRC.deny);
  const yolo = useAudioPlayer(SRC.yolo);
  const compact = useAudioPlayer(SRC.compact);
  const panic = useAudioPlayer(SRC.panic);

  const players = { wave, approve, deny, yolo, compact, panic } as const;

  const play = useCallback(
    (name: SfxName) => {
      const p = players[name];
      if (!p) return;
      try {
        p.seekTo(0)?.catch?.(() => {});
        p.play();
      } catch {
        // audio is decoration; never let it break the demo
      }
    },
    [wave, approve, deny, yolo, compact, panic],
  );

  return play;
}
