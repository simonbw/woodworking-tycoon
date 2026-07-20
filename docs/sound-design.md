# Sound Design: Recording List & Playback Architecture

Plan for filling out the game's audio with real recordings, and for the code
that plays them. Two tiers of sound:

1. **One-shots** — fire-and-forget clips. The pipeline already exists
   (`sfx.ts` → SFX bus, `SoundEvent` queue → `GameSoundLayer`).
2. **Continuous machine sounds** — multi-phase: spin-up → idle loop →
   cutting loop → wind-down. New system, described below.

---

## Part 1: The recording shot list

### Machine sound sets (the complex ones)

For each powered machine, record one continuous take per row where possible —
long takes are easier to edit into pieces than separate short takes, and they
guarantee the levels match across phases (critical for crossfades).

| Machine | Clips needed | Notes |
| --- | --- | --- |
| Jobsite table saw | start-up, idle loop (15–20s steady), rip-cut loop (several feeds, varied pressure), wind-down | The flagship. Also grab: blade brake/click at the end of wind-down, an offcut dropping. |
| Lunchbox planer | start-up, idle loop, board-feed pass (full pass incl. the snipe *thunk* at the end), wind-down | Universal motor scream — very characterful. Record 2–3 full passes at different widths. |
| Jointer | start-up, idle loop, pass loop, wind-down | |
| Miter saw | trigger spin-up, chop cut, release wind-down | Momentary tool — the whole cycle is ~2s, so this can stay a **one-shot** (we already have `miter-cut`). Record 4–6 complete cut takes for variation. |
| Random orbit sander | start-up, free-spinning loop, on-wood loop, stop | Same 4-phase shape as the big machines. |
| Shop vac / dust collector | start-up, run loop, nozzle-on-debris loop, wind-down | For the dust & cleaning system (`docs/dust-and-cleaning.md`). |

### Hand-tool one-shots and short loops

- **Hand plane**: single strokes (the *shhhk*), 4–6 takes; also a slow rhythmic loop
- **Sanding block**: stroke pairs, loopable rhythm
- **Hammer/mallet**: taps on wood, nail driving (3-hit sequences), 4–6 takes
- **Pallet dismantling**: pry bar creak + nail squeal — this one is gold, record lots
- **Glue-up**: glue bottle squirt, clamp ratcheting, clamp screw tightening
- **Finish application**: rag wiping, brush strokes, can opening/stirring
- **Broom sweep** (loopable) + dustpan scrape, for the cleaning system

### Material handling one-shots

Record **4–6 takes of each** so the code can pick randomly (see "variation"
below) — repeated identical clips are the fastest route to audio fatigue:

- Board pickup / set down (a few sizes: stick, board, panel)
- Sheet-good wobble (plywood *whomp*)
- Pallet drop / drag
- Board tossed into garbage can (hollow metal *bong*)
- Boards knocking together (stacking)
- Hardware: nail/screw handful jingle, dropping into a bin

### UI one-shots (paperwork-themed re-records)

The UI set exists but generic. The paperwork design system suggests a re-record
with real props: pencil tick (click), paper slide (tab), page flip (back),
**rubber stamp** (purchase — perfect), pencil scribble, cash-register/coin.

### Meta / reward

- Commission-complete stinger (may stay synthesized — real-world sounds don't
  do "fanfare" well; a stamp + coin combo could work)
- Cash register (have one; re-record if a real one is available)

### Ambience (later, music bus / #33)

- Shop room tone (a minute of "silence" in the space — also useful in editing)
- Compressor kicking on occasionally, exterior birds/rain

### General recording tips

- **Don't touch the gain knob** between clips of the same machine, and keep the
  mic position fixed for the whole set. The crossfade between idle and cutting
  only sounds like "the same machine biting into wood" if the room and level
  are identical.
- Mono is fine (better, even) for machine/tool sounds — leaves room for
  future positional panning. Stereo only for ambience.
- Record long. 20 seconds of steady idle gives many candidate loop regions;
  8 seconds gives one, if lucky.

---

## Part 2: Playback architecture for continuous sounds

### Derive from state, don't chase events

The one-shot system is event-based (`SoundEvent` queue) and that's right for
one-shots. For continuous sounds, event-based is the wrong model: operations
**pause and resume** when the player steps away, the game can be saved and
reloaded mid-operation, and ticks batch. Start/stop events get missed or
doubled, and a missed "stop" means a saw that screams forever.

Instead, the sound layer **derives the desired audio phase from `GameState`
on every render** and converges the audio graph toward it:

```
machine.operationProgress.status !== "inProgress"        → "off"
inProgress, but paused (unattended phase boundary,
  or attended phase with player elsewhere)               → "running"  (idle loop)
inProgress and actively ticking an attended phase        → "cutting"
```

This gives a nice touch for free: walk away mid-rip and the saw drops to idle;
walk back and it bites into the wood again. Reload a save mid-operation and
the sound is simply correct.

### `LoopingSoundPlayer` (`src/utils/loopingSound.ts`)

One instance per placed machine, driven by a declarative def:

```ts
interface MachineSoundDef {
  start?: string;      // one-shot, ends at steady idle level
  runLoop: string;     // seamless idle loop
  cutLoop?: string;    // seamless under-load loop, same level/mic as runLoop
  stop?: string;       // one-shot, begins at steady idle level
  gain?: number;
  crossfadeMs?: number; // default ~60
}

class LoopingSoundPlayer {
  setPhase(phase: "off" | "running" | "cutting"): void;
  dispose(): void; // machine removed → immediate fade + cleanup
}
```

Internals, phase by phase:

- **off → running**: play `start` as a one-shot. Schedule *both* loops
  (`runLoop` at full gain, `cutLoop` at zero gain) to begin at
  `startTime + startDuration - crossfadeMs`, with a short equal-power fade-in
  overlapping the tail of the start clip. Web Audio scheduling is
  sample-accurate, so this seam is reliable — no `setTimeout`.
- **running ↔ cutting**: both loops are already playing, so the transition is
  just two gain ramps (`setTargetAtTime`, ~60ms, equal-power). No source
  starting/stopping, no phase-alignment problems, no clicks. The cost of the
  always-running silent loop is negligible (one extra `AudioBufferSourceNode`
  per active machine).
- **running/cutting → off**: ramp both loops to zero over ~80ms, stop the
  sources shortly after, and play `stop` immediately. Fade-out under the
  wind-down clip masks the seam.
- **Hysteresis**: attendance can flap tick-to-tick (player nudges one cell
  away). Debounce downward transitions ~200ms — `cutting → running` and
  `running → off` only commit if the derived state holds. Upward transitions
  are instant. If `setPhase("running")` arrives during a wind-down, cancel it
  and crossfade back in rather than replaying the full start.
- Everything routes through `getSfxBus()` so existing volume/mute settings
  apply untouched.

### `MachineSoundLayer` (`src/components/MachineSoundLayer.tsx`)

Headless component next to `GameSoundLayer`. Each render:

1. Compute desired phase per machine (rules above) — only for machines whose
   type has a `MachineSoundDef`.
2. Keep a `Map<machineId, LoopingSoundPlayer>`; create players lazily,
   `setPhase` on the rest (no-op if unchanged), `dispose` players for removed
   machines.

Machines without a def (garbage can, workspace, makeshift bench, miter saw)
keep the existing one-shot path. The two systems coexist: continuous sound
*during* the operation, one-shot at completion (board drop, offcut clatter)
via the existing `SoundEvent` queue.

### One-shot variation (small upgrade to `sfx.ts`)

To use the multi-take recordings: name files `material-drop-1.ogg`,
`material-drop-2.ogg`, …, let the clip maps declare a variant count, and have
`playSound` pick randomly plus apply a small pitch jitter
(`source.playbackRate.value = 1 ± 0.03`). Cheap, and it kills the
machine-gun-same-sample effect.

---

## Part 3: Editing & export spec

### File formats — the one hard rule

**No MP3, and loops especially must never be MP3.** MP3 cannot loop
seamlessly: the encoder pads the start/end of every file (codec delay) with
no way for the decoder to trim it, so a perfectly edited loop gets an audible
gap or click after encoding. Ogg Vorbis/Opus fixed exactly this — the
container records the encoder delay and conformant decoders trim it
sample-accurately — so Ogg files *can* loop gaplessly. WAV has no codec delay
at all and is the bulletproof baseline.

**Everything ships as Ogg** (Opus preferred, Vorbis fine), one-shots and
loops alike, named `.ogg` — `sfx.ts` loads only `.ogg`. The game targets
Electron, i.e. Chromium's decoder everywhere, so Safari's patchy Ogg support
is irrelevant. If a loop's seam ever proves audible after Ogg encoding,
fall back to WAV (no codec delay at all) for that clip and teach the loader
the exception — but Opus's gapless metadata should make this unnecessary.

Handy: ElevenLabs' `opus_48000_128` output format arrives already
Ogg-encapsulated — placeholder clips save straight to `.ogg` with no
conversion step.

### Making a seamless loop

1. From the long steady take, pick a stable 2–4 second region (no swells,
   no room noises).
2. Use the **crossfade-loop** technique: extend the selection slightly, then
   crossfade the tail into the head (Reaper has actions for this; in Audacity,
   split the tail off and crossfade it under the head). Cutting at zero
   crossings alone is not enough for broadband motor noise.
3. Verify by looping playback ~10 times and listening for the seam at the
   boundary. If you can hear where it wraps, pick a different region.
4. Trim the final file to exactly the loop — no silence padding.

### Start and stop clips

- **Start**: trim so the file *ends* while the machine is at steady idle —
  the code overlaps the last ~60ms with the loop's fade-in, so the end of
  this clip must sound identical to the loop. Easiest path: cut the start
  clip and the idle loop from the *same take*.
- **Stop**: opposite — the file must *begin* at steady idle.

### Levels

- Peak-normalize everything to about **−6 dBFS** and keep clips within a
  machine's set at their natural relative levels (cut louder than idle, as
  recorded). Game-side balance lives in the per-clip gain maps, where it can
  be tuned without re-exporting.
- Naming: `<machine>-start.ogg`, `<machine>-run-loop.ogg`,
  `<machine>-cut-loop.ogg`, `<machine>-stop.ogg`, in `static/sounds/`.

---

## Rollout order

1. Extend `sfx.ts`: extension-aware loading, variant + pitch-jitter support.
2. Build `LoopingSoundPlayer` + `MachineSoundLayer`, wired for **one machine**
   (the planer — simplest, most distinctive) using **placeholder ElevenLabs
   clips** (the `generate-game-audio` skill can produce a start/loop/stop set)
   so the transition logic is proven *before* the recording session.
3. Add the table saw and jointer defs.
4. Recording day: capture the shot list, edit per the spec, drop files in —
   no code changes needed to swap placeholders for the real thing.
5. Later passes: sander/vac sets, one-shot variation takes, UI re-records,
   ambience (music bus, #33).
