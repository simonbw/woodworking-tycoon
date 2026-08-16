import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";
import { deriveMachineCutLoad } from "../game/cut-load";
import { getMachines, machineKey } from "../game/Machine";
import { deriveMachineSoundPhase } from "../game/machine-sound-helpers";
import { MACHINE_VOICES } from "../utils/machineVoices";
import { MachineVoice } from "../utils/machineVoice";
import { projectGameState } from "../sim/projection";
import { Player } from "../sim/entities/Player";

/**
 * The shop's continuous machine voices. One-shots ride the `sound` event
 * (SoundView); machine hum can't, because operations pause, resume, and
 * survive a reload — a missed "stop" would leave a saw screaming
 * forever. So each placed machine gets a voice that converges on the
 * phase derived from the shop's own state, every tick.
 *
 * The voice table and the phase rule are both shared with the old
 * shell, so a planer sounds the same in either world.
 */
export class MachineSoundView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private voices = new Map<string, MachineVoice>();

  // Once per frame, not once per tick: the old layer re-derived on each
  // React render, and a machine's phase can't change faster than the
  // eye or ear can follow.
  @on("slowTick")
  onSlowTick() {
    if (!this.game.entities.tryGetSingleton(Player)) {
      this.silenceAll();
      return;
    }
    const gameState = projectGameState(this.game);
    const seen = new Set<string>();
    for (const machine of getMachines(gameState.machines)) {
      const makeVoice = MACHINE_VOICES[machine.state.machineTypeId];
      if (!makeVoice) continue;
      const key = machineKey(machine.state);
      seen.add(key);
      let voice = this.voices.get(key);
      if (!voice) {
        voice = makeVoice(key);
        this.voices.set(key, voice);
      }
      voice.setPhase(
        deriveMachineSoundPhase(
          machine,
          gameState.player.position,
          gameState.player.away !== null,
          gameState.player.operating === true,
          gameState.progression,
        ),
        deriveMachineCutLoad(machine),
      );
    }
    // Machines sold or picked up since the last tick: silence them.
    for (const [key, voice] of this.voices) {
      if (!seen.has(key)) {
        voice.dispose();
        this.voices.delete(key);
      }
    }
  }

  /** Quitting to the menu takes the shop quiet with it. */
  private silenceAll(): void {
    if (this.voices.size === 0) return;
    this.voices.forEach((voice) => voice.dispose());
    this.voices.clear();
  }

  onDestroy() {
    this.silenceAll();
  }
}
