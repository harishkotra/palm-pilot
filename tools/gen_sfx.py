#!/usr/bin/env python3
"""Generate small demo SFX as 44.1k mono 16-bit WAVs (stdlib only)."""
import math, os, struct, wave, random

SR = 44100
OUT = "/Users/shk/.hermes/cache/scratch/wave-sounds"
os.makedirs(OUT, exist_ok=True)


def env(i, n, attack=0.01, release=0.35, curve=2.0):
    a = int(n * attack) or 1
    r = int(n * release) or 1
    if i < a:
        return i / a
    if i > n - r:
        return ((n - i) / r) ** curve
    return 1.0


def write(name, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    data = b"".join(struct.pack("<h", int(max(-1, min(1, s / peak * 0.85)) * 32767)) for s in samples)
    with wave.open(os.path.join(OUT, name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)
    print(f"{name:16s} {len(samples)/SR:5.2f}s")


def tone(freq, dur, wave_kind="sine", partials=1.0):
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        ph = 2 * math.pi * freq * t
        if wave_kind == "sine":
            v = math.sin(ph)
        elif wave_kind == "square":
            v = 0.6 * math.tanh(3 * math.sin(ph))
        elif wave_kind == "saw":
            v = 2 * ((freq * t) % 1.0) - 1
        else:
            v = math.sin(ph)
        v += partials * 0.35 * math.sin(2 * ph) + partials * 0.12 * math.sin(3 * ph)
        out.append(v * env(i, n))
    return out


def glide(f0, f1, dur, kind="sine", noise=0.0):
    n = int(SR * dur)
    out, phase = [], 0.0
    for i in range(n):
        k = i / n
        f = f0 + (f1 - f0) * (k ** 0.7)
        phase += 2 * math.pi * f / SR
        v = math.sin(phase)
        if kind == "square":
            v = 0.6 * math.tanh(3 * v)
        if noise:
            v = v * (1 - noise) + random.uniform(-1, 1) * noise
        out.append(v * env(i, n, 0.02, 0.5))
    return out


def seq(*parts):
    out = []
    for p in parts:
        out.extend(p)
    return out


# wave detected: short bright tick
write("wave.wav", glide(1800, 900, 0.09, noise=0.15))

# approve: two-note major chime
write("approve.wav", seq(tone(880, 0.11, partials=0.5), tone(1318.5, 0.22, partials=0.4)))

# deny: low buzzy thud
write("deny.wav", seq(tone(190, 0.10, "square", partials=0.8), tone(120, 0.22, "square", partials=1.0)))

# yolo: rising arpeggio
write("yolo.wav", seq(tone(523.25, 0.07), tone(659.25, 0.07), tone(783.99, 0.07), tone(1046.5, 0.18)))

# compact: descending sweep, machine powering down
write("compact.wav", glide(1200, 130, 0.75, "saw", noise=0.05))

# panic: double heartbeat
def thump(f=62, d=0.13):
    n = int(SR * d)
    return [math.sin(2 * math.pi * f * (i / SR)) * math.exp(-6 * i / n) for i in range(n)]

write("panic.wav", seq(thump(), tone(0.0, 0.10), thump(58, 0.16)))
print("done ->", OUT)
