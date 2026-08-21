import { Game } from "../core/Game";
import { stationWorkSpeed } from "../game/bench-mounting";
import { clampsFree } from "../game/Clamp";
import { machineDustMultiplier } from "../game/Dust";
import {
  Machine,
  MachineState,
  Operation,
  OperationPhase,
} from "../game/Machine";
import { ShopSupply } from "../game/machine-helpers";
import { getOperationPhases } from "../game/skill-helpers";
import { MachineEntity } from "./entities/MachineEntity";
import { projectProgression } from "./projection";
import { Consumables } from "./singletons/Consumables";
import { DustLayer } from "./singletons/DustLayer";
import { ShopGrid } from "./singletons/ShopGrid";
import { ShopInfo } from "./singletons/ShopInfo";

/**
 * The machine questions asked with a `Game` in hand (issue #230,
 * phase 4): thin assemblies of the pure helpers' narrow inputs from the
 * live singletons, shared by the commands, the MachineSystem, and the
 * views so no caller builds a world snapshot to answer them. The pure
 * rules stay in `src/game`; nothing here decides anything.
 */

/** Every placed machine's state, in entity order. */
export function machineStatesNow(game: Game): MachineState[] {
  return [...game.entities.byConstructor(MachineEntity)]
    .filter((entity) => !entity.isDestroyed)
    .map((entity) => entity.state);
}

/** The shop's live supply: the cabinet, the free clamps, and the floor. */
export function shopSupplyNow(game: Game): ShopSupply {
  const consumables = game.entities.getSingleton(Consumables);
  return {
    consumables: consumables.stock,
    freeClamps: clampsFree(consumables.clamps, machineStatesNow(game)),
    cellMap: game.entities.getSingleton(ShopGrid).cellMap(),
  };
}

/**
 * This operation's phases as they would run right now: the player's
 * unlocks, the dust drag on this machine, and its mounted-or-floor work
 * speed, read live.
 */
export function operationPhasesNow(
  game: Game,
  machine: Machine,
  operation: Operation,
): ReadonlyArray<OperationPhase> {
  const dust = game.entities.tryGetSingleton(DustLayer)?.map ?? {};
  return getOperationPhases(
    operation,
    projectProgression(game),
    machineDustMultiplier(
      dust,
      machine,
      game.entities.getSingleton(ShopInfo).info.size,
    ),
    stationWorkSpeed(machine, game.entities.getSingleton(ShopGrid).cellMap()),
  );
}
