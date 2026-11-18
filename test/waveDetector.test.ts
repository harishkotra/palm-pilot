import { WaveDetector, DEFAULTS, type WaveEvent } from '../src/waveDetector';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
  if (!cond) failures++;
}

/** Feed a sequence of [lux, msFromStart] pairs and collect events. */
function run(samples: [number, number][], tickEvery = 60, detector = new WaveDetector()) {
  const events: WaveEvent[] = [];
  let last = 0;
  for (const [lux, t] of samples) {
    for (let k = last + tickEvery; k < t; k += tickEvery) events.push(...detector.tick(k));
    events.push(...detector.push(lux, t));
    last = t;
  }
  for (let k = last + tickEvery; k < last + 1200; k += tickEvery) events.push(...detector.tick(k));
  return { events, detector };
}

const warm = (d = new WaveDetector(), base = 400) => {
  for (let t = 0; t < 600; t += 80) d.push(base, t);
  return d;
};

// 1. warm-up must not produce events
{
  const d = new WaveDetector();
  const evs = [0, 80, 160, 240].map((t) => d.push(400, t)).flat();
  check('warm-up emits nothing', evs.length === 0);
  check('not ready during warm-up', !d.isReady);
  for (let t = 320; t < 600; t += 80) d.push(400, t);
  check('ready after warm-up in lit room', d.isReady, `baseline=${d.baseline}`);
}

// 2. a quick pass of the hand is a wave
{
  const d = warm();
  const { events } = run([[400, 640], [3, 720], [3, 800], [420, 880]], 60, d);
  check('short cover = one wave', events.filter((e) => e === 'wave').length === 1, JSON.stringify(events));
  check('short cover is not a hold', !events.includes('hold'));
}

// 3. parking the hand is a hold, and not a wave
{
  const d = warm();
  const { events } = run([[400, 640], [3, 720], [3, 1600], [420, 1650]], 60, d);
  check('long cover = hold', events.includes('hold'), JSON.stringify(events));
  check('long cover is not a wave', !events.includes('wave'), JSON.stringify(events));
}

// 4. two quick passes collapse into a double
{
  const d = warm();
  const { events } = run(
    [[400, 640], [3, 720], [3, 780], [420, 860], [3, 980], [3, 1040], [420, 1120]],
    60,
    d,
  );
  check('two quick passes = double', events.filter((e) => e === 'double').length === 1, JSON.stringify(events));
  check('double suppresses the single wave', !events.includes('wave'), JSON.stringify(events));
}

// 5. ambient drift must not trigger
{
  const d = warm();
  const evs: WaveEvent[] = [];
  for (let t = 640; t < 4000; t += 80) {
    const lux = 400 * (1 - (t - 640) / 5000); // lamp slowly dimmed
    evs.push(...d.push(lux, t), ...d.tick(t));
  }
  check('slow ambient drift = no events', evs.length === 0, JSON.stringify(evs));
}

// 6. a dark room is refused as unusable
{
  const d = new WaveDetector();
  for (let t = 0; t < 600; t += 80) d.push(4, t);
  check('dark room not ready', !d.isReady, `baseline=${d.baseline}`);
}

// 7. hand held for 750ms (between wave and hold cutoffs) does nothing
{
  const d = warm();
  const { events } = run([[400, 640], [3, 720], [3, 1470], [420, 1520]], 60, d);
  check('ambiguous hold duration is silent', events.length === 0, JSON.stringify(events));
}

// 8. config is sane
check('hold cutoff is longer than wave cutoff', DEFAULTS.holdMs > DEFAULTS.maxWaveMs);

// 9. recovery: a wave still works after a hold
{
  const d = warm();
  const { events } = run(
    [[400, 640], [3, 700], [3, 1800], [420, 1850], [3, 2100], [3, 2160], [420, 2240]],
    60,
    d,
  );
  check('wave works again after a hold', events.filter((e) => e === 'wave').length === 1, JSON.stringify(events));
}

// 10. three quick passes are a triple, not a double plus a wave
{
  const d = warm();
  const { events } = run(
    [
      [400, 640], [3, 720], [3, 780], [420, 860],
      [3, 980], [3, 1040], [420, 1120],
      [3, 1240], [3, 1300], [420, 1380],
    ],
    60,
    d,
  );
  check('three quick passes = triple', events.filter((e) => e === 'triple').length === 1, JSON.stringify(events));
  check('triple does not also emit double', !events.includes('double'), JSON.stringify(events));
  check('triple does not also emit wave', !events.includes('wave'), JSON.stringify(events));
}

// 11. parking the hand long enough escalates hold to holdLong
{
  const d = warm();
  const { events } = run([[400, 640], [3, 720], [3, 3400], [420, 3450]], 60, d);
  check('very long cover escalates to holdLong', events.includes('holdLong'), JSON.stringify(events));
  check('holdLong is announced once', events.filter((e) => e === 'holdLong').length === 1, JSON.stringify(events));
  check('hold fires first, then holdLong', events.indexOf('hold') >= 0 && events.indexOf('hold') < events.indexOf('holdLong'), JSON.stringify(events));
}

// 12. tap window: two waves far apart are two waves, not a double
{
  const d = warm();
  const { events } = run(
    [[400, 640], [3, 720], [3, 780], [420, 860], [3, 2600], [3, 2660], [420, 2720]],
    60,
    d,
  );
  check('taps beyond the window stay separate', events.filter((e) => e === 'wave').length === 2, JSON.stringify(events));
  check('slow pair is not a double', !events.includes('double'), JSON.stringify(events));
}

check('holdLong is longer than hold', DEFAULTS.longHoldMs > DEFAULTS.holdMs);

console.log(failures === 0 ? '\nALL WAVE DETECTOR TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
