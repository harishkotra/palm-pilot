# Palm Pilot

A touchless demo for people who spend their day clicking **Allow** on an AI agent.

Your hand over the top edge of the phone is the input. No touch, no screen press —
the ambient-light sensor sees the room go dark for as long as your palm is there,
and how long it stays dark is the gesture. Every line the app shows is generated
by `particle-1` while you watch; there is no scripted content and no fallback copy.

## The three modes

| Tab | The joke | Gestures |
|---|---|---|
| **LGTM** | You approve everything your agent proposes without reading it | wave = approve · hold = deny · double = auto-approve loop |
| **/COMPACT** | Compaction quietly destroys the context you spent an hour building | wave = compact a fact · hold = pin one · double = re-seed |
| **PANIC** | The agent is stuck and will never know why | wave = next line · hold = abandon task · double = two turns |

Each of those maps to one model call, shown with its real latency and token count.
LGTM's footer reads `approved N · denied M · read 0`.

## Setup

```sh
cp .env.example .env     # then fill in your key
npm install
npx expo start -c        # -c is required after changing .env
```

Scan the QR with **Expo Go** on the S24 Ultra on the same Wi-Fi. `expo-sensors`,
`expo-audio` and `expo-haptics` all ship inside Expo Go, so there is no build step.

## Configure everything in `.env`

Every value is read once at build time. Change one, restart with `npx expo start -c`,
reload the app. Tap the model badge in the header to see what the app actually
loaded and to run a live round trip against it.

| Variable | Meaning |
|---|---|
| `EXPO_PUBLIC_LLM_BASE_URL` | Any OpenAI-compatible base. Particle global `https://api.particle.ai/v1`, US-only `https://us.api.particle.ai/v1`, or `http://192.168.x.x:11434/v1` for Ollama |
| `EXPO_PUBLIC_LLM_API_KEY` | Bearer key. Placeholder only in `.env.example`; `.env` is gitignored and never bundled |
| `EXPO_PUBLIC_LLM_MODEL` | `particle-1`, `deepseek-ai/deepseek-v41-flash-1017`, `z-ai/glm-5.3-flash` — or any model the endpoint lists |
| `EXPO_PUBLIC_LLM_REASONING_EFFORT` | `none` suppresses thinking tokens so the whole budget goes to the answer. Use `low`/`medium` for better jokes, or leave blank for models that reject the field |
| `EXPO_PUBLIC_LLM_MAX_TOKENS` | Cap on the short replies (proposal, reaction, diagnosis). Structural calls get their own budget internally |
| `EXPO_PUBLIC_DEBUG_GESTURES` | `1` shows a SIM WAVE / HOLD / ×2 row for phones with no light sensor. Default `0`: gestures only |

With no key the app refuses to run the modes and shows the setup screen instead —
it will not pretend to be intelligent.

## The five prompts

| Where | Function | What the model returns |
|---|---|---|
| LGTM card | `proposeNext(history)` | `{"tool":"Read\|Write\|Edit\|Bash","detail":"<=52 chars","risk":"low\|medium\|high\|extreme"}` |
| LGTM after wave | `reaction(p,'approve')` | one past-tense sentence about what just happened |
| LGTM after hold | `reaction(p,'deny')` | one line of passive-aggressive compliance |
| /COMPACT on mount | `seedContext()` | six load-bearing facts the agent is holding |
| /COMPACT on wave | `compactFact(facts)` | `{"from":"<fact>","to":"<<=44 chars, subtly wrong>"}` |
| PANIC on wave | `diagnose(prior, seconds)` | the next line of false confidence, given elapsed time |

Output is validated: wrong tool name, missing risk, a fact that was not in the list,
non-JSON prose — any of these throws, and the screen shows the error with a tap-to-retry
instead of inventing a line. Nothing is cached, so the same gesture twice gives you
different text.

## Verify it without a phone

```sh
npm test          # gesture detector + URL/JSON parsing, offline
npm run test:live # hits the endpoint in .env, checks all five prompts
npm run demo      # real lux samples → real detector → real model, printed
```

`npm run demo` feeds synthetic illuminance readings into the same `WaveDetector`
the phone uses, asserts the detector classified `wave` / `hold` / `double`, then
prints the model's answer for each. Sample output (particle-1, ~0.7–1.1 s per call):

```
— gesture 1: quick cover/release over the sensor
  detector: wave
  model:    Bash · "List repo root files" · risk low · 882 ms / 187 tok
  approved: "The approved command ran and listed the repo root files." · 820 ms
  denied:   "Fine. I'll just guess at the repo structure instead." · 1067 ms
```

## How the gesture works

`LightSensor` fires every 80 ms. `src/waveDetector.ts` learns the ambient baseline,
treats a drop below `max(1.5, baseline × 0.5)` as *covered*, and classifies on release:

- covered < 700 ms → **wave**
- covered ≥ 900 ms → **hold**
- two covers inside 650 ms → **double**

The band between 700 and 900 ms is deliberately silent. Tuning constants sit in
`DEFAULTS` in the same file; the window is 60–70 ms, so a wave is a real hand
movement, not a screen tap. On iOS `expo-sensors` has no `LightSensor`, so the
readout stays at 0 and you need `EXPO_PUBLIC_DEBUG_GESTURES=1` to drive it by touch.

## Files

```
App.tsx                     tabs, header, gesture wiring, setup gate
src/config.ts               .env → typed config, the only place env is read
src/llmClient.ts            OpenAI-compatible fetch, URL normalizer, JSON extractor
src/llmTasks.ts             the five prompts, schema validation, no fallbacks
src/waveDetector.ts         pure gesture state machine (tested headlessly)
src/useWave.ts              LightSensor → detector → React, throttled to ~220 ms
src/waveBus.ts              only the mounted screen receives gestures
src/screens/*.tsx           LGTM · /COMPACT · PANIC · setup sheet
tools/live-demo.ts          gesture → model transcript, no phone
test/*.test.ts              detector, parser, live endpoint
```

## Key handling

`.env` is gitignored and excluded from the packaged zip. `EXPO_PUBLIC_*` values are
inlined into the JS bundle at build time, so this pattern is right for a demo running
in Expo Go on your own phone and wrong for anything you ship to a store — for that,
proxy the call through a server and keep the key off the device.
