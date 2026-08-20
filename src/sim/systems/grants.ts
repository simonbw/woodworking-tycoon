import { Game } from "../../core/Game";
import { CellMap } from "../../game/CellMap";
import { addConsumables } from "../../game/Consumable";
import { freshMachineState } from "../../game/game-actions/machine-actions";
import { OperationCompletion } from "../../game/game-actions/operation-actions";
import { levelForXp } from "../../game/skill-helpers";
import { Vector, vectorEquals } from "../../game/Vectors";
import { MachineState } from "../../game/Machine";
import { MachineCrateEntity } from "../entities/MachineCrateEntity";
import { projectGameState } from "../projection";
import { Consumables } from "../singletons/Consumables";
import { Progression } from "../singletons/Progression";
import { StorageUpgrades } from "../singletons/StorageUpgrades";

/**
 * Land everything a batch of operation completions carries — the entity
 * world's `applyCompletionGrants`. The machines themselves must already
 * hold their post-completion state; this applies the side grants: sounds
 * (as events), upgrades to storage, crated machines to the floor,
 * salvaged supplies to the stock, and XP with its level-ups.
 */
export function applyCompletionGrants(
  game: Game,
  completions: ReadonlyArray<OperationCompletion>,
): void {
  for (const completion of completions) {
    for (const sound of completion.soundEvents) {
      game.dispatch("sound", { sound });
    }
  }

  const upgradesGranted = completions.flatMap((c) => c.upgradesGranted);
  if (upgradesGranted.length > 0) {
    const storage = game.entities.getSingleton(StorageUpgrades);
    storage.upgrades.push(...upgradesGranted);
  }

  for (const completion of completions) {
    for (const granted of completion.machinesGranted) {
      deliverMachineCrate(
        game,
        freshMachineState(
          granted.machineTypeId,
          projectGameState(game).progression,
        ),
        granted.near,
      );
    }
  }

  const consumablesGranted = completions.flatMap((c) => c.consumablesGranted);
  if (consumablesGranted.length > 0) {
    const consumables = game.entities.getSingleton(Consumables);
    consumables.stock = addConsumables(consumables.stock, consumablesGranted);
  }

  grantXp(
    game,
    completions.reduce((sum, c) => sum + c.xp, 0),
  );
}

/** The old `withXp`: lifetime XP plus a skill point per level gained. */
export function grantXp(game: Game, amount: number): void {
  if (amount <= 0) {
    return;
  }
  const progression = game.entities.getSingleton(Progression);
  const newXp = progression.xp + amount;
  const levelsGained = levelForXp(newXp) - levelForXp(progression.xp);
  progression.xp = newXp;
  progression.skillPoints += levelsGained;
}

/**
 * Lands a machine crate on the open floor nearest `near` (walkable, no
 * crate there yet), falling back to sharing a cell when the shop is that
 * full — the old `deliverMachineCrate`, delivering an entity.
 */
export function deliverMachineCrate(
  game: Game,
  machine: MachineState,
  near?: Vector,
): MachineCrateEntity {
  const gameState = projectGameState(game);
  const target = near ?? gameState.shopInfo.entrancePosition;
  const cellMap = CellMap.fromGameState(gameState);
  const distance = (cell: Vector) =>
    Math.abs(cell[0] - target[0]) + Math.abs(cell[1] - target[1]);
  const openCells = cellMap
    .getFreeCells()
    .map((cell) => cell.position)
    .filter(
      (position) =>
        !gameState.machineCrates.some((crate) =>
          vectorEquals(crate.position, position),
        ),
    )
    .sort((a, b) => distance(a) - distance(b));
  const position = openCells[0] ?? target;
  return game.addEntity(new MachineCrateEntity(machine, position));
}
