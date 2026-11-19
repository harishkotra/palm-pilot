# Palm Pilot: building a touchless interface for AI coding agents

*A phone that you control by waving at it — and a real model behind every word on screen.*

---

There is a specific moment in AI-assisted development that this app is about. Your agent
has been running for forty minutes. A card appears:

```
Bash
"rm -rf node_modules && npm i"
risk: medium
[Approve] [Deny]
```

You click **Allow** without reading it. You have done this 60 times today. The tool call
was probably fine. You would not have noticed if it wasn't.

Palm Pilot takes that moment and removes the last physical step: there is no screen to
touch. You wave a hand over the top of the phone — lights drop, sensor fires, model
answers — and the agent has been approved, denied, or told to forget everything it knew.

Four modes. Five gestures. One sensor. Zero scripted lines.

```
┌──────────────────────────────────────────────────────────────────────┐
│  PALM PILOT            312 lx · base 402              particle-1     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ AGENT · particle-1                             882 ms · 187 tok │  │
│  │  Bash                                                          │  │
│  │  "List repo root files"                                        │  │
│  │  risk: low · wave = approve · hold = deny · double = auto      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ✓ waved: Bash List repo root files                           782 ms │
│  The approved command ran and listed the repo root files.      820 ms │
└──────────────────────────────────────────────────────────────────────┘
```

Tab 4, `/REPO`, is where the joke becomes useful: it fetches a real GitHub repository's
open issues and recent commits, then asks the model to triage the backlog. The current
pick is always an issue that actually exists — the validator refuses anything else.

---

## 1. Choosing the sensor (or: what Expo Go actually gives you)

I wanted "hand near phone" with no native build, because the demo has to run from a QR
code in Expo Go on a borrowed Galaxy S24 Ultra.

The obvious candidate is the IR proximity sensor — the one that blanks the screen during
a call. It is not in Expo's SDK:

| Route | Verdict |
|---|---|
| `expo-sensors` `LightSensor` | works in Expo Go on Android |
| `expo-sensors` `ProximitySensor` | does not exist |
| `expo-sensors` `Accelerometer` | measures the phone moving, not a hand above it |
| Camera + MediaPipe | needs permissions, drains battery, and you must point the phone at yourself |
| Native IR proximity bridge | needs a dev build |

So the signal is **illuminance**, ~one sample every 80 ms. That reframes the problem
completely: you cannot know *where* the hand is, only *whether* light dropped and *for
how long*. Every gesture in the app is therefore built from two numbers — duration and
repetition.

That constraint is a feature. A duration/count grammar needs no ML, no calibration
model, no camera, and costs no battery. It also unit-tests perfectly on a laptop.

## 2. The detector: four decisions that make a light sensor usable

`src/waveDetector.ts` is 170 lines of pure TypeScript. No React, no sensors, no timers —
`push(lux, now)` and `tick(now)` in, `WaveEvent[]` out. Everything interesting about
this project lives in four decisions.

### 2a. Learn the room instead of assuming it

Rooms range from 0 lx to 60,000 lx. Hardcoding thresholds means the app works in exactly
one room. Instead the detector tracks an exponential moving average of ambient light and
treats *relative* drops as coverage:

```ts
// inside push()
if (this.base === null) {
  this.base = value;
  if (++this.warm < warmupSamples) return out;   // don't arm on the first sample
}
const coverAt = Math.max(1.5, this.base * coverRatio);   // 50% of ambient
const releaseAt = Math.max(1.5, this.base * releaseRatio); // 75% of ambient
```

The baseline drifts while you're covered, so a long hold doesn't decay into "still dark,
therefore normal". `minBaseline` (12 lx) stops the detector from arming in a dark room
where it can't tell a palm from nothing.

### 2b. Hysteresis, or you get 20 events per wave

A single threshold makes a hovering hand chatter: cross down, cross up, cross down. Two
thresholds — 50% to cover, 75% to release — create a dead band. A hand near the
threshold produces silence instead of a burst of taps.

### 2c. Defer naming a tap

The hard part of counting taps is that you only learn it was a double when the second tap
lands. If you emit `wave` on the first release, a triple becomes `wave, wave, wave`.

So a tap is *recorded* immediately but *named* 240 ms later:

```ts
if (this.taps.length > 0 && now - this.taps[0] <= tapWindowMs) this.taps.push(now);
else this.taps = [now];
this.pendingAt = now;

// ...later, in tick()
if (!this.covered && this.pendingAt !== null && now - this.pendingAt >= singleDelayMs) {
  const n = Math.min(this.taps.length, 3);
  this.clearPending();
  if (n >= 1) out.push(TAP_NAMES[n - 1]);   // wave | double | triple
}
```

`tapWindowMs` is 1500 ms — generous, because people wave from a seated position with a
phone on a stand, and a tight window makes doubles feel like a rhythm game.

### 2d. Escalate a hold instead of adding a gesture

I wanted a fourth "undo everything" action but had no gestures left. A hold is a
duration, so a longer hold can mean something else — and physically it costs the user
nothing:

- hand down 0.9 s → `hold` (deny the tool call)
- keep the same hand there past 2.4 s → `holdLong` (kill the session, start over)

Which means one parked hand can legitimately emit two events, and the detector has to
remember what it already announced or you get duplicates on release:

```ts
if (this.covered) {
  const held = now - this.coverStart;
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
```

On release, if `holdEmitted` was set, the release is *not* a new event. That single
variable took two failing tests to get right — and the tests are why it landed at all.

### The full vocabulary

| Gesture | Physical action | Event | Defaults |
|---|---|---|---|
| wave | one pass under 700 ms | `wave` | `maxWaveMs 700` |
| double | two passes in one 1.5 s window | `double` | `tapWindowMs 1500` |
| triple | three passes in that window | `triple` | `singleDelayMs 240` |
| hold | hand parked ≥ 0.9 s | `hold` | `holdMs 900` |
| holdLong | parked past 2.4 s | `holdLong` | `longHoldMs 2400` |

## 3. Architecture: three boundaries

```
LightSensor (80 ms)  →  useWave (React, throttled)  →  WaveDetector (pure)
                                                             │
                                                             ▼
                                        waveBus  →  exactly one mounted screen
                                                             │
                                          ┌──────────────────┼──────────────────┐
                                          ▼                  ▼                  ▼
                                     llmTasks.ts        llmClient.ts       github.ts
                                     (prompts)          (fetch/parse)      (issues)
                                          │                  │                  │
                                          └────────────► particle-1 ◄──────────┘
```

**Boundary 1 — the sensor never touches UI state.** `LightSensor` fires 12.5×/s. Putting
each sample into `useState` re-renders the tree and makes the animations stutter. The
hook keeps the latest reading in a ref and only pushes to React every ~220 ms, forcing an
update when `covered` changes:

```ts
// src/useWave.ts (abridged)
const tickUi = () => {
  const now = Date.now();
  if (!force && now - lastPush.current < 220) return;
  lastPush.current = now;
  setState({ lux, baseline: detector.baseline, covered, available, ready });
};
```

That one throttle turned a jittery screen into something that felt native.

**Boundary 2 — the detector knows nothing about screens.** Because `WaveDetector` is
pure, the entire gesture grammar is testable in Node with no phone, no emulator, and no
80 ms waits. `npm test` runs 23 detector assertions in well under a second.

**Boundary 3 — only the visible screen receives gestures.** With four tabs mounted, a
naive emitter would make four model calls per wave — four bills, four loading spinners.
`src/waveBus.ts` holds one handler set, registered by whichever screen is mounted:

```ts
let handlers: WaveHandlers = {};
export function dispatchWave(e: WaveEvent) {
  handlers[KEYS[e]]?.();
}
export function useWaveHandler(h: WaveHandlers) {
  useEffect(() => { handlers = h; return () => { handlers = {}; }; }, [JSON.stringify(h)]);
}
```

## 4. The model layer: every word is a live call

No SDK. `src/llmClient.ts` is 168 lines: normalise a base URL, POST `/chat/completions`,
extract JSON from prose or fences, throw a typed error.

```ts
export async function chat(target: ChatTarget, messages: Msg[], opts?: { maxTokens?: number }) {
  const t0 = Date.now();
  const res = await fetch(`${normaliseBaseUrl(target.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${target.apiKey}` },
    body: JSON.stringify({
      model: target.model,
      messages,
      max_tokens: opts?.maxTokens ?? target.maxTokens,
      temperature: 0.9,
      ...(target.reasoningEffort ? { reasoning_effort: target.reasoningEffort } : {}),
    }),
  });
  const ms = Date.now() - t0;
  const body = await res.json();
  if (!res.ok) throw new LlmError(res.status, body?.error?.message ?? `HTTP ${res.status}`);
  return { text: body.choices[0].message.content ?? '', ms, usage: body.usage };
}
```

### The bug that cost an hour: thinking tokens vs `max_tokens`

First version: `max_tokens: 200`, and half the replies came back empty or 400. The model
was fine — it was *thinking* first, and the reasoning tokens were spending the entire
budget before the answer started.

Two fixes, both required:

1. Send `reasoning_effort: "none"` on `particle-1`, so the whole budget goes to output.
2. Give structural calls a bigger cap — 700 for seeding six facts, 300 for rewriting one.

```ts
// src/llmTasks.ts
const target = () => ({ ...LLM, reasoningEffort: LLM.reasoningEffort || undefined });
// seedContext → chat(target(), msgs, { maxTokens: 700 })
// compactFact → chat(target(), msgs, { maxTokens: 300 })
```

Not universal: `z-ai/glm-5.3-flash` rejects `"none"` outright, so the config treats an
empty value as "omit the field" and you can run either model with one env var.

### Validation is the feature

The interesting design constraint is **no fallback copy**. If the model returns prose
instead of JSON, a tool name that isn't `Read|Write|Edit|Bash`, a fact that wasn't in the
list, an issue number that doesn't exist — the app shows an error with tap-to-retry. It
never invents a line to keep the demo moving.

```ts
// src/repoTasks.ts
function fail(msg: string): never { throw new LlmError(0, `unusable model output: ${msg}`); }

const raw = pickJson<{ number: number; why: string; action: string }>(reply.text);
const number = Number(raw.number);
if (!Number.isInteger(number)) fail(`bad issue number: ${raw.number}`);
if (!open.some((i) => i.number === number)) fail(`issue #${number} was never offered`);
```

That last line is why `/REPO` can be trusted. The model is given a roster of real issues
(`#302 [blocker] Helm Link staging reuses ~/.helm-link · 7 comments`) and may only choose
from it. It is a closed-set task, so hallucination is detectable rather than plausible.

Real output on a 25-issue backlog:

```
github   1013 ms — pharos-hq/Helm-pwa · 25 open · 25 read · 12 commits
TRIAGE   1392 ms / 1366 tok — #302 "Blocker-tagged ops: without rotated staging
         VERCEL_TOKEN…" → "Rotate VERCEL_TOKEN in staging secrets, re-run Pin staging alias"
PLAN     3478 ms — 1. gh variable set VERCEL_TOKEN --env staging … 2. rotate in dashboard
         3. update GH Environments 4. rerun workflow
STANDUP   683 ms — "Shipped README and tracked AGENTS.md for contributors plus repo cleanup."
ROAST     930 ms — "#322 still reuses ~/.helm-link while #316 keeps the poll alive — fix the
         profile before the bridge leaks staging creds into prod."
```

## 5. Testing without a phone

The phone is the least reliable part of any demo, so it is the last thing in the loop:

```sh
npm test           # 23 detector assertions + 14 parser assertions, offline
npm run typecheck  # tsc --noEmit → 0 errors
npm run test:live  # every prompt against the real endpoint in .env
npm run test:repo  # real GitHub → triage → plan → standup → roast
npm run demo       # lux script → real detector → real model, printed
```

`npm run demo` is the one that matters. It replays illuminance samples at the sensor's
real 80 ms cadence into the same `WaveDetector` the phone uses, *asserts* the
classification, then prints whatever the model actually said:

```
— gesture 1: quick cover/release over the sensor
  detector: wave
  model:    Bash · "List repo root files" · risk low · 882 ms / 187 tok
  approved: "The approved command ran and listed the repo root files." · 820 ms
  denied:   "Fine. I'll just guess at the repo structure instead." · 1067 ms

— gesture 4: three quick covers (triple) on the /REPO tab
  detector: triple
  github:   pharos-hq/Helm-pwa · 25 open · 12 commits · 821 ms
  triage:   #322 — Helm Link staging reuses ~/.helm-link · 725 ms

— gesture 5: hand parked past 2.4 s (holdLong)
  detector: holdLong
```

That transcript is the whole demo, minus the hand.

## 6. What I'd change next

- **Streaming.** 0.7–1.1 s is the only place the app feels slow. `stream: true` and
  render tokens as they arrive.
- **Diff review.** The real agent interaction isn't "approve a Bash string", it's "review
  this diff". GitHub's compare API gives unified diffs; wave = accept hunk, hold = reject.
- **An actual execution loop.** The model currently *narrates* an agent. Running the
  approved tool call in a sandbox and feeding results back would make LGTM real.
- **Calibration.** 700/900/2400 ms are guesses. A 10-second "cover, release, cover"
  routine could persist per-room thresholds.
- **Accelerometer fusion.** A wave while the phone is in your hand looks exactly like a
  lamp dimming; stillness from the accelerometer would disambiguate.

## 7. Honest limits

- Illuminance has **no direction**. No swipes. Duration and repetition are the vocabulary.
- Bright rooms with a baseline under ~12 lx: the detector refuses to arm rather than
  firing randomly.
- **iOS cannot run this** — `expo-sensors` has no `LightSensor`; the SIM row exists for
  that, and for stage fallback.
- `EXPO_PUBLIC_*` is **inlined into the bundle**. Fine for a personal demo build; wrong
  for a store release, where you'd proxy both the model key and the GitHub token through
  a server.
- Gestures are proven as **data**, not on glass. The detector is tested against real lux
  sequences; the physical wave is verified by a human, not CI.

---

## Run it

```sh
git clone https://github.com/harishkotra/palm-pilot
cd palm-pilot && npm install
cp .env.example .env       # particle.ai key + a read-only GitHub token
npx expo start -c          # or: npx expo start --tunnel ngrok -c
```

Android phone with a light sensor, Expo Go, wave your hand over the top edge.

---

**Built by [Harish Kotra](https://harishkotra.me)** — [check out my other builds](https://dailybuild.xyz)

Inference by [particle.ai](https://particle.ai) (`particle-1`). Sensors via
[Expo](https://expo.dev). Sound effects generated locally with `tools/gen_sfx.py`.
