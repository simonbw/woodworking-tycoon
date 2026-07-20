import { getSfxBus } from "./audioBus";
import { getAudioContext } from "./getAudioContext";

/**
 * Lightweight sound-effect player built on the shared AudioContext.
 *
 * Sounds live under `static/sounds/` and are served at `/sounds/<name>.ogg`.
 * Everything is Ogg — MP3 can't loop gaplessly and the Electron target means
 * Chromium's decoder everywhere (see `docs/sound-design.md`). Each clip is
 * fetched and decoded on first use, then cached so subsequent plays are
 * instant. Playback goes through a per-play gain node (for relative per-sound
 * trim) into the shared SFX bus, so master/SFX volume and mute from the
 * settings menu apply uniformly (see `audioBus.ts`).
 *
 * `playUiSound` covers the named UI clicks; `playSound` plays any clip by name
 * and is what the game-event → sound bridge (`GameSoundLayer`) uses.
 * `loadSoundBuffer` exposes the decode cache to the continuous machine-sound
 * player (`loopingSound.ts`), which manages its own sources.
 */

export type UiSoundName =
  "ui-click" | "ui-hover" | "ui-tab" | "ui-purchase" | "ui-back";

// Per-sound gain. Hover is deliberately subtle so it doesn't fatigue.
const SOUND_GAIN: Record<UiSoundName, number> = {
  "ui-click": 0.6,
  "ui-hover": 0.25,
  "ui-tab": 0.6,
  "ui-purchase": 0.8,
  "ui-back": 0.6,
};

const bufferCache = new Map<string, Promise<AudioBuffer>>();

async function fetchClip(name: string): Promise<ArrayBuffer> {
  const res = await fetch(`/sounds/${name}.ogg`);
  if (!res.ok) throw new Error(`sfx: failed to fetch ${name} (${res.status})`);
  return res.arrayBuffer();
}

/** Fetch and decode a clip by bare name, cached across all users. */
export function loadSoundBuffer(name: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(name);
  if (cached) return cached;

  const promise = fetchClip(name).then((data) =>
    getAudioContext().decodeAudioData(data),
  );

  // Don't poison the cache on a transient failure — allow a later retry.
  promise.catch(() => bufferCache.delete(name));
  bufferCache.set(name, promise);
  return promise;
}

/**
 * Play a clip by file name (without extension) at the given relative gain.
 * Never throws and never blocks the caller — failures (missing file, decode
 * error, locked audio) are swallowed so a missing asset can't break anything.
 */
export function playSound(name: string, gain = 1): void {
  void (async () => {
    try {
      const ctx = getAudioContext();
      // The context starts suspended until a user gesture; our sounds follow
      // gestures/ticks after one, so resuming here unlocks it on first use.
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const buffer = await loadSoundBuffer(name);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gainNode = ctx.createGain();
      gainNode.gain.value = gain;
      source.connect(gainNode).connect(getSfxBus());
      source.start();
    } catch {
      // Audio is a nice-to-have; ignore any failure.
    }
  })();
}

/** Fire one of the named UI sounds at its configured level. */
export function playUiSound(name: UiSoundName): void {
  playSound(name, SOUND_GAIN[name]);
}

/** Warm the decode cache so the first play has no fetch/decode latency. */
export function preloadUiSounds(): void {
  (Object.keys(SOUND_GAIN) as UiSoundName[]).forEach((name) => {
    void loadSoundBuffer(name).catch(() => {});
  });
}
