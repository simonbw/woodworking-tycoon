---
name: generate-game-audio
description: Generate an in-game sound effect or voice line for Woodworking Tycoon via ElevenLabs and drop it into the project's static asset folder. Use whenever a player-facing sound is needed — machine operations (table saw, planer, miter saw), UI feedback (clicks, purchases), reward stingers (commission complete, cash), or the occasional narration line. Wraps the official ElevenLabs `sound-effects` and `text-to-speech` skills with this project's placement + naming conventions.
---

# Generate game audio (SFX or voice line)

This skill ties the official ElevenLabs `sound-effects` and `text-to-speech` skills to Woodworking Tycoon's static-asset pipeline. The official skills handle the API call; this one covers naming the file, where it lands, and how to make it sound like this game.

Woodworking Tycoon has no audio registry, transcode step, or mixing bus — sounds are plain files served straight from `static/`. Keep it that simple.

## Pick the upstream skill and category

| You need…                                                       | Upstream skill   | Example names                                  |
| --------------------------------------------------------------- | ---------------- | ---------------------------------------------- |
| Machine operation sounds (saw rip/crosscut, planer pass, sand)  | `sound-effects`  | `table-saw-rip`, `planer-pass`, `miter-cut`    |
| Assembly / hand-tool sounds (mallet, screwdriver, pallet break) | `sound-effects`  | `mallet-tap`, `pallet-dismantle`, `hand-plane` |
| UI feedback (button clicks, purchase, panel open/close, error)  | `sound-effects`  | `ui-click`, `purchase-chime`, `error-buzz`     |
| Reward stingers (commission complete, cash, reputation up)      | `sound-effects`  | `commission-complete`, `cash-register`         |
| Looping shop ambience (idle workshop hum, background)           | `sound-effects`  | `shop-ambience-loop`                           |
| Narration / voice lines (tutorial, shopkeeper) — optional       | `text-to-speech` | `voice-tutorial-welcome`, `voice-order-ready`  |

The category is just an organizing hint for the file name — there's no routing behind it. Match the game's vocabulary: machines are the **Jobsite Table Saw** (rip), **Miter Saw** (crosscut), **Lunchbox Planer** (plane), **Makeshift Bench** (assembly / dismantle pallets), and **Garbage Can** (dispose).

## End-to-end flow

1. **Check the API key.** If `$ELEVENLABS_API_KEY` is unset and `.env` doesn't define it, run the `setup-api-key` skill first.
2. **Pick a kebab-case name** matching the existing static-asset style (the image files use kebab-case: `jobsite-table-saw.png`, `miter-saw.png`). Target path is always `static/sounds/<name>.mp3`. Create `static/sounds/` if it doesn't exist yet.
3. **Generate** to a temp file (e.g. `/tmp/<name>.mp3`):
   - SFX → `sound-effects` skill. Default model `eleven_text_to_sound_v2`, output format `mp3_44100_128`.
   - Voice → `text-to-speech` skill. Default model `eleven_multilingual_v2`, pick a `voice_id` from the skill's list.
4. **Place** the take you want into `static/sounds/<name>.mp3`. Files under `static/` are copied to `dist/` at build time and served at the root path, so the asset is reachable in-game at `/sounds/<name>.mp3` (the same way images are referenced, e.g. `/images/miter-saw.png` — see `src/utils/loadAssets.ts`). No transcode or normalize step — MP3 plays directly in the browser, and ElevenLabs already returns a sensible level.
5. **Wire up playback** if the sound is new to the game. `src/utils/getAudioContext.ts` exposes a shared `AudioContext`; play through it (or a plain `new Audio("/sounds/<name>.mp3")` for one-shots). Trigger it from the relevant game action / component. Skip this step if you're just replacing an existing asset.

## Prompt-writing notes

**SFX.** Cozy woodworking-shop tone — warm, tactile, wooden. Prefer the real sounds of a small workshop: the whir of a saw biting into a board, the zip of a hand plane taking a shaving, a mallet tap on a joint, sandpaper on wood, the clatter of a dismantled pallet. Avoid sci-fi, synthetic, or cartoony textures unless explicitly requested.

- **One-shots** (a single cut, a button click, a mallet tap): keep them short, ≤1.5 s, with high `prompt_influence` (~0.6–0.8) so they stay crisp.
- **Machine / ambience loops** (a running saw, planer pass, shop hum): use `loop=True` + ~2–4 s `duration_seconds` so they cycle seamlessly.
- **UI sounds**: soft and woody rather than electronic — a wooden click, a drawer sliding, a page turn. Purchases can be a light register chime.
- **Reward stingers** (commission complete, cash earned, reputation up): warm and satisfying — a pleasant short chime or a cash-register ka-ching, not a fanfare.

**Voice lines (optional).** This game has no voiced protagonist; use TTS only for something like a friendly tutorial narrator or shopkeeper callout. Aim for a calm, warm, conversational delivery — pick a friendly voice from the `text-to-speech` skill's list (e.g. George for narration, Charlotte for a lighter tone). For a multi-line sequence, use the upstream skill's `previous_text` / `next_text` request-stitching so lines flow into each other without tone jumps.

## Iterating

ElevenLabs is non-deterministic — the same prompt produces different audio each call. Save iterations to numbered temp files (`/tmp/take1.mp3`, `/tmp/take2.mp3`) and only copy the take you want into `static/sounds/`. Once placed, the file is committed alongside whatever code references it.

## References

- `static/sounds/` — where generated audio lives (create if absent); served at `/sounds/<name>.mp3`
- `src/utils/loadAssets.ts` — how static assets are referenced by root path (mirror this for sounds)
- `src/utils/getAudioContext.ts` — shared `AudioContext` for playback
- `sound-effects` / `text-to-speech` skills — the upstream ElevenLabs API wrappers
- `setup-api-key` skill — configures `ELEVENLABS_API_KEY` when missing
