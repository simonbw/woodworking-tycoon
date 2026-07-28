import { getRoomBus, getSfxBus } from "./audioBus";
import { getAudioContext } from "./getAudioContext";

/**
 * Lightweight sound-effect player built on the shared AudioContext.
 *
 * Sounds live under `static/sounds/` and are served at `/sounds/<name>.<ext>`.
 * Most clips are Ogg — MP3 can't loop gaplessly and the Electron target means
 * Chromium's decoder everywhere (see `docs/sound-design.md`). A few are FLAC
 * (lossless source the author prefers); Chromium decodes both. The extension
 * defaults to `ogg`, with per-name overrides in `SOUND_EXTENSION`. Each clip is
 * fetched and decoded on first use, then cached so subsequent plays are
 * instant. Playback goes through a per-play gain node (for relative per-sound
 * trim) into the shared SFX bus, so master/SFX volume and mute from the
 * settings menu apply uniformly (see `audioBus.ts`).
 *
 * `playUiSound` covers the named UI clicks; `playSound` plays any clip by name
 * and is what the game-event → sound bridge (`GameSoundLayer`) uses.
 * `loadSoundBuffer` exposes the decode cache to the continuous machine-sound
 * player (`loopingSound.ts`), which manages its own sources.
 *
 * Clips that would otherwise machine-gun — footsteps above all — ship as
 * numbered takes and get a little pitch jitter; see `SOUND_VARIANTS`. That
 * lives here rather than at the call sites so a clip gains variation by
 * shipping more files and adding a row, not by changing who plays it.
 */

export type UiSoundName =
  | "ui-click"
  | "ui-click-start"
  | "ui-click-end"
  | "ui-hover"
  | "ui-tab"
  | "ui-purchase"
  | "ui-back"
  | "ui-page-turn";

// Per-sound gain. Hover is deliberately subtle so it doesn't fatigue.
// The page-turn clip is recorded ~14 dB hotter than the click set, so its
// gain sits low to land at a comparable level.
const SOUND_GAIN: Record<UiSoundName, number> = {
  "ui-click": 0.6,
  // Two-part press: down on pointerdown, up on release. Together they should
  // land at roughly the level of the single "ui-click".
  "ui-click-start": 0.6,
  "ui-click-end": 0.6,
  "ui-hover": 0.25,
  "ui-tab": 0.6,
  "ui-purchase": 0.8,
  "ui-back": 0.6,
  "ui-page-turn": 0.3,
};

/**
 * Clips recorded as several takes, stored as `<name>-1.ogg` … `<name>-N.ogg`.
 * A play picks one at random. Anything not listed here is a single file
 * named plainly, which is most of them.
 */
const SOUND_VARIANTS: Record<string, number> = {
  footstep: 5,
};

/**
 * Random playback-rate spread per clip, as a fraction either side of 1.
 * Even with several takes, a repeated sound needs the pitch to wander a
 * little before it stops reading as a sample. Keep it small — past a few
 * percent a footstep starts sounding like a different pair of boots.
 */
const SOUND_PITCH_JITTER: Record<string, number> = {
  footstep: 0.06,
};

/** Every named UI clip, for anything that wants to warm the whole set. */
export const UI_SOUND_NAMES = Object.keys(SOUND_GAIN) as UiSoundName[];

const bufferCache = new Map<string, Promise<AudioBuffer>>();

// Clips authored as FLAC rather than the default Ogg.
const SOUND_EXTENSION: Record<string, string> = {
  "ui-click": "flac",
  "ui-click-start": "flac",
  "ui-click-end": "flac",
  "ui-hover": "flac",
};

/** The URL a bare clip name resolves to, extension and all. */
export function clipUrl(name: string): string {
  return `/sounds/${name}.${SOUND_EXTENSION[name] ?? "ogg"}`;
}

async function fetchClip(name: string): Promise<ArrayBuffer> {
  const res = await fetch(clipUrl(name));
  if (!res.ok) throw new Error(`sfx: failed to fetch ${name} (${res.status})`);
  return res.arrayBuffer();
}

/**
 * The file a play of `name` should actually fetch: one of its numbered takes
 * when it has any, otherwise the name unchanged. `roll` is the 0..1 draw,
 * injectable so the choice can be tested.
 */
export function variantClipName(name: string, roll = Math.random()): string {
  const count = SOUND_VARIANTS[name];
  if (!count || count < 2) return name;
  // Math.random() never returns 1, but a caller-supplied roll might.
  const index = Math.min(count - 1, Math.floor(roll * count));
  return `${name}-${index + 1}`;
}

/** The rate to play `name` at: 1, plus this clip's random pitch jitter. */
export function variantPlaybackRate(
  name: string,
  roll = Math.random(),
): number {
  const jitter = SOUND_PITCH_JITTER[name];
  if (!jitter) return 1;
  return 1 + (roll * 2 - 1) * jitter;
}

/** Every file a clip can resolve to — one name, or all of its takes. */
export function clipFileNames(name: string): string[] {
  const count = SOUND_VARIANTS[name];
  if (!count || count < 2) return [name];
  return Array.from({ length: count }, (_, i) => `${name}-${i + 1}`);
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
 *
 * `bus: "room"` places the sound in the shop's acoustics (see `audioBus.ts`);
 * use it for diegetic sounds and leave UI feedback on the default sfx bus.
 *
 * Clips with numbered takes play a random one, and clips with a jitter entry
 * play slightly off-speed, so a sound heard hundreds of times isn't heard as
 * the same file hundreds of times.
 */
export function playSound(
  name: string,
  gain = 1,
  bus: "sfx" | "room" = "sfx",
): void {
  void (async () => {
    try {
      const ctx = getAudioContext();
      // The context starts suspended until a user gesture; our sounds follow
      // gestures/ticks after one, so resuming here unlocks it on first use.
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const buffer = await loadSoundBuffer(variantClipName(name));
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = variantPlaybackRate(name);
      const gainNode = ctx.createGain();
      gainNode.gain.value = gain;
      source
        .connect(gainNode)
        .connect(bus === "room" ? getRoomBus() : getSfxBus());
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

/**
 * Warm the decode cache for a clip and every take it can pick, so the first
 * play has no fetch/decode latency. Worth doing for anything that fires the
 * moment the player acts — a footstep that arrives after the fetch lands
 * behind the foot.
 */
export function preloadSound(name: string): void {
  clipFileNames(name).forEach((file) => {
    void loadSoundBuffer(file).catch(() => {});
  });
}

/** Warm the decode cache so the first play has no fetch/decode latency. */
export function preloadUiSounds(): void {
  UI_SOUND_NAMES.forEach((name) => {
    void loadSoundBuffer(name).catch(() => {});
  });
}
