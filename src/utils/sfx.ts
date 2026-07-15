import { getAudioContext } from "./getAudioContext";

/**
 * Lightweight UI sound-effect player built on the shared AudioContext.
 *
 * Sounds live under `static/sounds/` and are served at `/sounds/<name>.mp3`.
 * Each clip is fetched and decoded on first use, then cached so subsequent
 * plays are instant. Playback goes through a per-play gain node so individual
 * sounds (e.g. the quiet hover tick) can sit at different levels.
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

const bufferCache = new Map<UiSoundName, Promise<AudioBuffer>>();

function loadBuffer(name: UiSoundName): Promise<AudioBuffer> {
  const cached = bufferCache.get(name);
  if (cached) return cached;

  const promise = fetch(`/sounds/${name}.mp3`)
    .then((res) => {
      if (!res.ok)
        throw new Error(`sfx: failed to fetch ${name} (${res.status})`);
      return res.arrayBuffer();
    })
    .then((data) => getAudioContext().decodeAudioData(data));

  // Don't poison the cache on a transient failure — allow a later retry.
  promise.catch(() => bufferCache.delete(name));
  bufferCache.set(name, promise);
  return promise;
}

/**
 * Fire a UI sound. Never throws and never blocks the caller — failures
 * (missing file, decode error, locked audio) are swallowed so a missing
 * asset can't break an interaction.
 */
export function playUiSound(name: UiSoundName): void {
  void (async () => {
    try {
      const ctx = getAudioContext();
      // The context starts suspended until a user gesture; UI sounds are
      // triggered by gestures, so resuming here unlocks it on first use.
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const buffer = await loadBuffer(name);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = SOUND_GAIN[name];
      source.connect(gain).connect(ctx.destination);
      source.start();
    } catch {
      // Audio is a nice-to-have; ignore any failure.
    }
  })();
}

/** Warm the decode cache so the first play has no fetch/decode latency. */
export function preloadUiSounds(): void {
  (Object.keys(SOUND_GAIN) as UiSoundName[]).forEach((name) => {
    void loadBuffer(name).catch(() => {});
  });
}
