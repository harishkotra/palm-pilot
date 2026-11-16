# Palm Pilot

A touchless demo for people who spend their day clicking **Allow** on an AI agent.

Your hand over the top edge of the phone is the input. No touch, no screen press —
the ambient‑light sensor sees the room go dark for as long as your palm is there,
and the duration of that darkness is the gesture.

## The three modes

| Tab | The joke | Gestures |
|---|---|---|
| **LGTM** | You approve everything your agent proposes without reading it | wave = approve · hold = deny · double‑wave = YOLO mode |
| **/COMPACT** | Compaction quietly destroys the context you spent an hour building | wave = compact a fact · hold = pin a fact so it survives · double‑wave = hard reset |
| **PANIC** | The agent is stuck, and it is never going to know why | wave = escalate the diagnosis · hold = reset the session |

Every approval is counted. The footer reads `approved N · read 0`.

## Run it

```sh
npm install
npx expo start
```

Scan the QR with **Expo Go** on the S24 Ultra (same Wi‑Fi). `expo-sensors`,
`expo-audio` and `expo-haptics` are all in Expo Go, so there is no build step.

## How the gesture works

`expo-sensors` has no proximity API, but it does expose **LightSensor**
(Android). Hand over the top of the phone → illuminance collapses toward zero.

`src/waveDetector.ts` is a pure state machine that turns that into events:

- baseline is learned from the first 6 samples and then drifts slowly, so a lamp
  turning on does not desensitise it
- **covered** = lux < 50% of baseline · **released** = lux > 75% of baseline
- covered < 700 ms and released → **wave**
- covered ≥ 900 ms → **hold** (fires once, while your hand is still there)
- two waves inside 650 ms → **double** (the single wave is held back 240 ms so a
  double never also fires an approve)
- 700–900 ms of cover is deliberately ignored: a lazy hand is not a gesture
- below 12 lux ambient the detector reports "not ready" rather than guessing

Everything is tunable through `DetectorConfig` / `DEFAULTS` in that file.

## Testing without a phone

```sh
npm test         # 14 assertions on the gesture state machine
npm run typecheck
```

The three `SIM WAVE / SIM HOLD / SIM ×2` buttons in the footer fire the same
events by hand, so the app is demoable even if a sensor misbehaves on stage.

## 30‑second demo script

1. Phone flat on the table, LGTM tab open. "This is my agent. It has been asking
   permission all morning."
2. Wave a hand over it. It approves `Write: 47 files`. "That's the whole
   workflow — I didn't read it, I waved at it."
3. Hold your hand over it. It denies, and the agent apologises for 400 tokens.
4. Double‑wave. YOLO mode: approvals start stamping themselves every 0.6s.
   "This is what shipping feels like."
5. Switch to /COMPACT, wave twice. "And this is what compaction does to
   everything I just told it." Facts get struck through and replaced by worse
   summaries.
6. End on `approved 143 · read 0`.

## Files

```
App.tsx                     shell, tabs, sensor readout, sim buttons
src/waveDetector.ts         pure gesture state machine (tested)
src/useWave.ts              sensor subscription + UI throttling
src/waveBus.ts              routes events to the mounted screen only
src/sfx.ts                  six generated WAVs via expo-audio
src/screens/LgtmScreen.tsx
src/screens/CompactScreen.tsx
src/screens/PanicScreen.tsx
assets/sounds/*.wav         generated with tools/gen_sfx.py (stdlib only)
```

## Limits

- Light‑based waving is a threshold, not a gesture recogniser: it knows
  *covered / not covered / how long*, not direction or speed.
- Bright, even overhead light works best. Direct sun on the sensor saturates the
  baseline and makes the drop smaller.
- iOS has no `LightSensor` in `expo-sensors`; this build is Android‑first.
