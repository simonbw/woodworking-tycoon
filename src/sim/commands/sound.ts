import { Game } from "../../core/Game";
import { SoundEventKind } from "../../game/SoundEvent";

/**
 * Emit a sound cue by kind, shared by every command file that only needs to
 * name the cue (no `machineTypeId`/`operationId`). Commands that need those
 * fields dispatch the `sound` event directly.
 */
export function emitSound(game: Game, kind: SoundEventKind): void {
  game.dispatch("sound", { sound: { kind } });
}
