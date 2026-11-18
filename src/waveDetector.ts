export type WaveEvent = 'wave' | 'double' | 'triple' | 'hold' | 'holdLong';

export type DetectorConfig = {
  /** lux must fall below this fraction of the ambient baseline to count as "covered" */
  coverRatio: number;
  /** ...and rise above this fraction to count as "hand away" */
  releaseRatio: number;
  /** a hand parked this long becomes a hold (fires once) */
  holdMs: number;
  /** ...and this long becomes a holdLong, so one gesture can mean two things */
  longHoldMs: number;
  /** anything slower than this is not a tap */
  maxWaveMs: number;
  /** taps must all land inside this window of the first one to chain */
  tapWindowMs: number;
  /** a tap is held back this long in case another one follows */
  singleDelayMs: number;
  /** below this ambient level the sensor cannot separate hand from room */
  minBaseline: number;
  /** samples of warm-up before the baseline is trusted */
  warmupSamples: number;
};

export const DEFAULTS: DetectorConfig = {
  coverRatio: 0.5,
  releaseRatio: 0.75,
  holdMs: 900,
  longHoldMs: 2400,
  maxWaveMs: 700,
  tapWindowMs: 1500,
  singleDelayMs: 240,
  minBaseline: 12,
  warmupSamples: 6,
};

const TAP_NAMES = ['wave', 'double', 'triple'] as const;

/**
 * Pure gesture state machine: feed it illuminance samples and timestamps,
 * get back wave / double / triple / hold / holdLong events. No React, no
 * sensors — so it can be tested on a laptop instead of in a lit room.
 *
 * Taps are counted and only classified once the hand has been away for
 * singleDelayMs, which is what allows a third tap to turn a double into a triple.
 */
export class WaveDetector {
  private cfg: DetectorConfig;
  private warmup: number[] = [];
  private base = 0;
  private covered = false;
  private coverStart = 0;
  private holdEmitted: 'hold' | 'holdLong' | null = null;
  private taps: number[] = [];
  private pendingAt: number | null = null;

  constructor(cfg: Partial<DetectorConfig> = {}) {
    this.cfg = { ...DEFAULTS, ...cfg };
  }

  get baseline() {
    return this.base;
  }

  get isCovered() {
    return this.covered;
  }

  get isReady() {
    return this.base >= this.cfg.minBaseline && this.warmup.length >= this.cfg.warmupSamples;
  }

  reset() {
    this.warmup = [];
    this.base = 0;
    this.covered = false;
    this.coverStart = 0;
    this.holdEmitted = null;
    this.taps = [];
    this.pendingAt = null;
  }

  private clearPending() {
    this.pendingAt = null;
    this.taps = [];
  }

  push(rawLux: number, now: number): WaveEvent[] {
    const value = Math.max(0, Number.isFinite(rawLux) ? rawLux : 0);
    const out: WaveEvent[] = [];
    const { coverRatio, releaseRatio, holdMs, longHoldMs, maxWaveMs, tapWindowMs, warmupSamples } =
      this.cfg;

    if (this.warmup.length < warmupSamples || this.base === 0) {
      this.warmup.push(value);
      this.base = Math.max(this.base, value, 1);
      return out;
    }

    if (!this.covered) {
      if (value < Math.max(1.5, this.base * coverRatio)) {
        this.covered = true;
        this.coverStart = now;
        this.holdEmitted = null;
      } else {
        // slow adaptation: lamps change, clouds pass, nobody waves
        this.base = this.base * 0.85 + value * 0.15;
      }
      return out;
    }

    if (value > Math.max(1.5, this.base * releaseRatio)) {
      this.covered = false;
      const dur = now - this.coverStart;
      const announced = this.holdEmitted;
      this.holdEmitted = null;

      // tick() may already have announced the hold while the hand was still there
      if (announced) {
        this.clearPending();
        return out;
      }

      if (dur >= holdMs) {
        this.clearPending();
        out.push(dur >= longHoldMs ? 'holdLong' : 'hold');
        return out;
      }

      // Too slow to be a tap, too fast to be a hold: a lazy hand, ignored.
      if (dur > maxWaveMs) {
        this.clearPending();
        return out;
      }

      if (this.taps.length > 0 && now - this.taps[0] <= tapWindowMs) this.taps.push(now);
      else this.taps = [now];
      this.pendingAt = now;
    }

    return out;
  }

  /** Call regularly (e.g. every 60ms) to flush holds and deferred taps. */
  tick(now: number): WaveEvent[] {
    const out: WaveEvent[] = [];
    const { holdMs, longHoldMs, singleDelayMs } = this.cfg;

    if (this.covered) {
      const held = now - this.coverStart;
      // Hold escalates: the gesture fires at 0.9s and again at 2.4s, so keeping
      // your hand there means "yes… no, undo it" without lifting.
      if (held >= longHoldMs && this.holdEmitted !== 'holdLong') {
        this.holdEmitted = 'holdLong';
        this.clearPending();
        out.push('holdLong');
      } else if (held >= holdMs && !this.holdEmitted) {
        this.holdEmitted = 'hold';
        this.clearPending();
        out.push('hold');
      }
    }

    if (!this.covered && this.pendingAt !== null && now - this.pendingAt >= singleDelayMs) {
      const n = Math.min(this.taps.length, 3);
      this.clearPending();
      if (n >= 1) out.push(TAP_NAMES[n - 1]);
    }

    return out;
  }
}
