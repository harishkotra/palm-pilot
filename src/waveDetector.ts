export type WaveEvent = 'wave' | 'hold' | 'double';

export type DetectorConfig = {
  /** lux must fall below this fraction of the ambient baseline to count as "covered" */
  coverRatio: number;
  /** ...and rise above this fraction to count as "hand away" */
  releaseRatio: number;
  /** a hand parked this long becomes a hold (fires once) */
  holdMs: number;
  /** anything slower than this is not a wave */
  maxWaveMs: number;
  /** two waves inside this window collapse into one "double" */
  doubleWindowMs: number;
  /** a lone wave is held back this long in case a second one follows */
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
  maxWaveMs: 700,
  doubleWindowMs: 650,
  singleDelayMs: 240,
  minBaseline: 12,
  warmupSamples: 6,
};

/**
 * Pure gesture state machine: feed it illuminance samples and timestamps,
 * get back wave / hold / double events. No React, no sensors — so it can be
 * tested on a laptop instead of on a phone in a room.
 */
export class WaveDetector {
  private cfg: DetectorConfig;
  private warmup: number[] = [];
  private base = 0;
  private covered = false;
  private coverStart = 0;
  private holdFired = false;
  private waves: number[] = [];
  private pendingSingleAt: number | null = null;
  private frozen = false;

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
    this.holdFired = false;
    this.waves = [];
    this.pendingSingleAt = null;
  }

  push(rawLux: number, now: number): WaveEvent[] {
    const value = Math.max(0, Number.isFinite(rawLux) ? rawLux : 0);
    const out: WaveEvent[] = [];
    const { coverRatio, releaseRatio, holdMs, maxWaveMs, doubleWindowMs, warmupSamples } = this.cfg;

    if (this.warmup.length < warmupSamples || this.base === 0) {
      this.warmup.push(value);
      this.base = Math.max(this.base, value, 1);
      return out;
    }

    if (!this.covered) {
      if (value < Math.max(1.5, this.base * coverRatio)) {
        this.covered = true;
        this.coverStart = now;
        this.holdFired = false;
        // A second cover arriving while the first wave is still on the shelf is
        // the start of a possible double: freeze the pending single.
        if (this.pendingSingleAt !== null) this.frozen = true;
      } else {
        // slow adaptation: lamps change, clouds pass, nobody waves
        this.base = this.base * 0.85 + value * 0.15;
      }
      return out;
    }

    if (value > Math.max(1.5, this.base * releaseRatio)) {
      this.covered = false;
      const dur = now - this.coverStart;
      const holdAlready = this.holdFired;
      const hadPending = this.pendingSingleAt !== null;
      const flushPending = () => {
        if (hadPending) {
          this.pendingSingleAt = null;
          this.waves = [];
          out.push('wave');
        }
      };
      this.holdFired = false;
      this.frozen = false;

      // A hand parked long enough is a hold, whether or not a tick caught it.
      if (holdAlready || dur >= holdMs) {
        flushPending();
        if (!holdAlready) out.push('hold');
        return out;
      }

      // Too slow to be a wave, too fast to be a hold: a lazy hand, ignored.
      if (dur > maxWaveMs) {
        flushPending();
        return out;
      }

      this.waves = this.waves.filter((t) => now - t < doubleWindowMs);
      this.waves.push(now);

      if (this.waves.length >= 2) {
        this.waves = [];
        this.pendingSingleAt = null;
        out.push('double');
        return out;
      }

      this.pendingSingleAt = now;
    }

    return out;
  }

  /** Call regularly (e.g. every 60ms) to flush holds and deferred single waves. */
  tick(now: number): WaveEvent[] {
    const out: WaveEvent[] = [];
    const { holdMs, singleDelayMs } = this.cfg;

    if (this.covered && !this.holdFired && now - this.coverStart >= holdMs) {
      this.holdFired = true;
      out.push('hold');
    }

    if (!this.frozen && this.pendingSingleAt !== null && now - this.pendingSingleAt >= singleDelayMs) {
      this.pendingSingleAt = null;
      this.waves = [];
      out.push('wave');
    }

    return out;
  }
}
