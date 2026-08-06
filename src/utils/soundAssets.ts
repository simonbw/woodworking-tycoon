import { getRoomBus, IMPULSE_RESPONSE_URL } from "./audioBus";
import { HOLD_MUSIC } from "./musicTrack";
import { clipUrl, preloadSound, UI_SOUND_NAMES } from "./sfx";

/**
 * Every sound the game can play, and how to have them decoded before
 * anything asks to hear one.
 *
 * The textures and fonts gate boot, and `uiImages.ts` warms the overlay
 * images right after it — but until this module, most clips were fetched
 * and decoded on their first play: the layers warmed their own sets (UI
 * clicks in `UiSoundLayer`, footsteps in `FootstepSoundLayer`), while the
 * one-shots `GameSoundLayer` bridges — the mallet, the sanding, the cash
 * register — each arrived a fetch late the first time their event fired.
 * The garage impulse response was worst placed: it downloads when the bus
 * first builds, which was the first play, so the opening sounds of every
 * session came out dry and the reverb faded in afterward.
 *
 * Like the image list, this is deliberately not "every file in
 * `static/sounds`": the sample-machine experiment left placeholder clips
 * behind that no code plays (the synth voices in `machineSynth.ts` won —
 * see docs/sound-design.md), and decoding those would be memory spent on
 * nothing. They're listed in {@link SOUND_FILES_NOT_PRELOADED} so
 * `soundAssets.test.ts` can hold both lists against the directory: a new
 * clip file must land in one of them, and an entry whose file goes away
 * fails loudly.
 */

/**
 * One-shots played through `GameSoundLayer`'s event bridge,
 * `RewardFlightLayer`, and the trip performance
 * (`TripTransitionLayer`). Bare clip names, as `playSound` takes them.
 */
const GAME_SOUND_CLIPS = [
  "assembly-mallet",
  "cash-register",
  "commission-complete",
  "dispose-toss",
  "drill-driver",
  "glue-clamp",
  "hand-sanding",
  "material-drop",
  "material-pickup",
  "nail-pry",
  "orbital-sander",
  "pallet-dismantle",
  "pallet-load",
  "truck-arrive",
  "truck-start",
  "ui-notification",
];

/** Every clip name the game can ask `playSound` for. */
export const SOUND_CLIPS: readonly string[] = Array.from(
  new Set([...UI_SOUND_NAMES, ...GAME_SOUND_CLIPS, "footstep"]),
);

/**
 * Every file under `/sounds/` the game fetches, for the completeness test.
 * Three kinds: the playable clips, the room reverb's impulse response
 * (which is not a clip — nothing plays it, the convolver wears it), and the
 * music tracks, which stream through an `<audio>` element rather than the
 * decode cache (see `musicTrack.ts`) and so are never preloaded here.
 */
export const SOUND_ASSET_FILES: readonly string[] = [
  ...SOUND_CLIPS.map(clipUrl),
  IMPULSE_RESPONSE_URL,
  HOLD_MUSIC.url,
];

/**
 * Files in `static/sounds` that ship but are deliberately not warmed,
 * because nothing plays them. Two groups:
 *
 * - The sample-based machine-sound experiment's placeholder clips. The
 *   pure-synth voices replaced them (docs/sound-design.md, "Pure-synth
 *   experiment"); these stay as reference material for the planned
 *   real-recording comparison.
 * - Clips recorded for UI cues that haven't been wired to anything yet.
 *
 * Wire one up and the test will insist it move into the manifest.
 */
export const SOUND_FILES_NOT_PRELOADED: readonly string[] = [
  // Sample-experiment placeholders
  "/sounds/miter-cut.ogg",
  "/sounds/planer-cut-loop.ogg",
  "/sounds/planer-pass.ogg",
  "/sounds/planer-run-loop.ogg",
  "/sounds/planer-start.ogg",
  "/sounds/planer-stop.ogg",
  "/sounds/table-saw-rip.ogg",
  // Recorded but not yet wired to a cue
  "/sounds/ui-error.flac",
];

/**
 * Warm every sound in the background: decode all the clips and build the
 * audio bus so the impulse response is downloading too.
 *
 * Same posture as `preloadUiImages`: none of this gates boot. Nothing can
 * even be heard before the first user gesture unlocks the AudioContext,
 * so blocking the first frame on audio would be pure delay — but decode
 * works fine while the context is suspended, so by the time a gesture
 * lands the whole kit is in hand. The per-layer warms (`preloadUiSounds`,
 * `preloadSound("footstep")`) stay where they are as the fallback that
 * keeps each layer self-sufficient; the decode cache makes the overlap
 * free.
 */
export function preloadSounds(): void {
  if (typeof window === "undefined") return;

  const start = () => {
    for (const name of SOUND_CLIPS) preloadSound(name);
    // Building the bus is what kicks off the impulse-response fetch, so the
    // room's acoustics are ready before the first diegetic sound.
    getRoomBus();
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(start, { timeout: 2000 });
  } else {
    setTimeout(start, 0);
  }
}
