import { Persistence } from "../config/constants";
import { GameEventMap } from "../core/entity/Entity";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";
import { clipBus, clipFor, clipGain, clipMinGapMs } from "../game/sound-clips";
import { playSound } from "../utils/sfx";

/**
 * The sim's one-shot cues, played. Commands and systems dispatch a
 * semantic `sound` event saying what happened — a nail pulled, an
 * operation finished — and this view is the only thing that knows what
 * that sounds like (the table lives in `game/sound-clips.ts`, shared
 * with the old shell so the two can't drift).
 *
 * Cues arriving in the same tick collapse to one play per clip: three
 * machines finishing together should sound like one hit, not a flam.
 * The same throttle then keeps a clip from machine-gunning under
 * fast-forward.
 */
export class SoundView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private lastPlayedAt = new Map<string, number>();
  /** Clips cued this tick, played once at the end of it. */
  private pending = new Set<string>();

  @on("sound")
  onSound({ sound }: GameEventMap["sound"]) {
    const clip = clipFor(sound);
    if (clip) this.pending.add(clip);
  }

  @on("afterTick")
  onAfterTick() {
    if (this.pending.size === 0) return;
    for (const clip of this.pending) this.play(clip);
    this.pending.clear();
  }

  private play(clip: string): void {
    const now = this.game.elapsedUnpausedTime * 1000;
    const last = this.lastPlayedAt.get(clip);
    if (last !== undefined && now - last < clipMinGapMs(clip)) return;
    this.lastPlayedAt.set(clip, now);
    playSound(clip, clipGain(clip), clipBus(clip));
  }
}
