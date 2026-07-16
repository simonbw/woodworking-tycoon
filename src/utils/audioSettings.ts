/**
 * Persisted audio preferences (master / SFX / music volume + mute).
 *
 * This is a small framework-agnostic observable store — no React, no Web Audio.
 * The audio graph (`audioBus.ts`) subscribes to it to set gain levels, and the
 * settings UI reads/writes it through the `useAudioSettings` hook. Preferences
 * live under their own `localStorage` key, deliberately separate from the game
 * save (`saveLoad.ts`): they are a per-device/user preference, not save data.
 */

export interface AudioSettings {
  /** Master output level, 0..1. Multiplies every category. */
  master: number;
  /** Sound-effects bus level, 0..1. */
  sfx: number;
  /** Music bus level, 0..1. (No tracks yet — see #33.) */
  music: number;
  /** When true the master output is silenced without losing the levels above. */
  muted: boolean;
}

const STORAGE_KEY = "woodworking-tycoon-audio";

const DEFAULTS: AudioSettings = {
  master: 0.8,
  sfx: 1,
  music: 0.7,
  muted: false,
};

const clamp01 = (n: unknown, fallback: number): number =>
  typeof n === "number" && Number.isFinite(n)
    ? Math.min(1, Math.max(0, n))
    : fallback;

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      master: clamp01(parsed.master, DEFAULTS.master),
      sfx: clamp01(parsed.sfx, DEFAULTS.sfx),
      music: clamp01(parsed.music, DEFAULTS.music),
      muted: Boolean(parsed.muted),
    };
  } catch {
    // Corrupt/blocked storage — fall back to defaults rather than break audio.
    return { ...DEFAULTS };
  }
}

let current: AudioSettings = load();
const listeners = new Set<() => void>();

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Ignore — persistence is best-effort.
  }
}

/** Current settings. Stable reference until `setAudioSettings` changes them. */
export function getAudioSettings(): AudioSettings {
  return current;
}

/** Merge a patch into the settings, clamp, persist, and notify subscribers. */
export function setAudioSettings(patch: Partial<AudioSettings>): void {
  const next: AudioSettings = {
    master: clamp01(patch.master ?? current.master, current.master),
    sfx: clamp01(patch.sfx ?? current.sfx, current.sfx),
    music: clamp01(patch.music ?? current.music, current.music),
    muted: patch.muted ?? current.muted,
  };
  current = next;
  persist();
  listeners.forEach((l) => l());
}

/** Subscribe to changes; returns an unsubscribe function. */
export function subscribeAudioSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
