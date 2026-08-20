import { Persistence } from "../../config/constants";
import { TickLayerName } from "../../config/tickLayers";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { CellMap } from "../../game/CellMap";
import {
  materialSourceKey,
  materialSources,
  offsetForSource,
} from "../../game/interact";
import { atTruckCab } from "../../game/lot";
import { Machine, machineKey as machineStateKey } from "../../game/Machine";
import {
  Direction,
  rotateVec,
  translateVec,
  Vector,
  vectorKey,
} from "../../game/Vectors";
import { interactFacts } from "../../sim/commands/interact-commands";
import {
  findMachineEntity,
  shopCellMap,
} from "../../sim/commands/machine-commands";
import { MachineEntity } from "../../sim/entities/MachineEntity";
import { Player } from "../../sim/entities/Player";
import { projectShopInfo } from "../../sim/projection";

/**
 * Which machine on the player's square the keyboard acts on, which
 * station's sheet is open, and where the rummage cursor sits — the old
 * TargetedMachineContext as a shell entity. Transient UI state, never
 * serialized.
 *
 * The default target follows the player's facing — turning toward a
 * machine is selecting it. `cycleTarget` steps through the square's
 * machines for the stacked cases facing can't split; any manual choice
 * lasts until the player moves or turns, which hands the pick back to
 * facing. All the folding rules (sheets fold when their station leaves
 * reach, the trip card folds away from the cab, the rummage ring resets
 * when its entries change) run in the per-frame tick, porting the old
 * provider's effects.
 */

const DIRECTION_VECTORS: Record<Direction, Vector> = {
  0: [1, 0],
  1: [0, -1],
  2: [-1, 0],
  3: [0, 1],
};

/** The center of a machine's occupied cells, in world cell coordinates. */
function machineCenter(machine: Machine): Vector {
  const cells = machine.type.cellsOccupied.map((cell) =>
    translateVec(rotateVec(cell, machine.rotation), machine.position),
  );
  const sum = cells.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1]]);
  return [sum[0] / cells.length, sum[1] / cells.length];
}

/**
 * The machine the player is most facing: highest alignment between the
 * facing direction and the offset toward each machine's center.
 */
function facingIndex(
  machines: readonly Machine[],
  playerCell: Vector,
  direction: Direction,
): number {
  if (machines.length < 2) return 0;
  const facing = DIRECTION_VECTORS[direction];
  let best = 0;
  let bestScore = -Infinity;
  machines.forEach((machine, index) => {
    const [cx, cy] = machineCenter(machine);
    const [dx, dy] = [cx - playerCell[0], cy - playerCell[1]];
    const length = Math.hypot(dx, dy);
    const score = length === 0 ? 1 : (dx * facing[0] + dy * facing[1]) / length;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

export class TargetingState extends BaseEntity implements Entity {
  id = "targetingState";
  persistenceLevel: number = Persistence.Permanent;
  tickLayer: TickLayerName = "input";

  private offset = 0;
  pileOffset = 0;
  private sheetKey: string | undefined;
  private truckMenuOpenRaw = false;
  floorSheetOpen = false;

  private lastPositionKey = "";
  private lastDirection: Direction | null = null;
  private lastSourcesKey = "";

  /** The operable machines on the player's square, facing-first order. */
  machines(): Machine[] {
    const player = this.game.entities.getSingleton(Player);
    if (player.away) return [];
    const cellMap = shopCellMap(this.game);
    return [...(cellMap.at(player.cell)?.operableMachines ?? [])];
  }

  /** The machine the keys act on, as its live entity. */
  targeted(): MachineEntity | null {
    const machines = this.machines();
    if (machines.length === 0) return null;
    const player = this.game.entities.getSingleton(Player);
    const index = facingIndex(machines, player.cell, player.direction);
    const machine = machines[(index + this.offset) % machines.length];
    return findMachineEntity(this.game, machine.state);
  }

  /** The station whose full sheet is open, if it's still at hand. */
  sheetMachine(): MachineEntity | null {
    if (!this.sheetKey) return null;
    const machine = this.machines().find(
      (candidate) => machineStateKey(candidate.state) === this.sheetKey,
    );
    return machine ? findMachineEntity(this.game, machine.state) : null;
  }

  get truckMenuOpen(): boolean {
    if (!this.truckMenuOpenRaw) return false;
    const player = this.game.entities.getSingleton(Player);
    return (
      !player.away && atTruckCab(projectShopInfo(this.game), player.cell)
    );
  }

  cycleTarget(): void {
    this.offset += 1;
  }

  /** Whether the keys are already aimed at this machine — what tells a
   * click on it apart from a click that just picks it. */
  isTargeted(candidate: Machine): boolean {
    const targeted = this.targeted();
    return (
      targeted != null &&
      machineStateKey(targeted.state) === machineStateKey(candidate.state)
    );
  }

  /** The cursor picking a machine outright (the pointing version of G). */
  setTarget(candidate: Machine): void {
    const machines = this.machines();
    const index = machines.findIndex(
      (m) => machineStateKey(m.state) === machineStateKey(candidate.state),
    );
    if (index === -1) return;
    const player = this.game.entities.getSingleton(Player);
    const defaultIndex = facingIndex(machines, player.cell, player.direction);
    const len = machines.length;
    this.offset = (((index - defaultIndex) % len) + len) % len;
  }

  /** The cursor picking a floor piece outright (the pointing R). */
  setPileTarget(pile: { material: { id: string } }): void {
    const gs = interactFacts(this.game);
    const targetedView = this.targeted()?.view();
    const match = gs.materialPiles.find(
      (candidate) => candidate.material.id === pile.material.id,
    );
    if (!match) return;
    const offset = offsetForSource(gs, shopCellMap(this.game), targetedView, {
      kind: "floor-pile",
      pile: match,
    });
    if (offset !== null) this.pileOffset = offset;
  }

  openSheet(target: Machine): void {
    this.sheetKey = machineStateKey(target.state);
  }

  openFloorSheet(): void {
    this.floorSheetOpen = true;
  }

  closeFloorSheet(): void {
    this.floorSheetOpen = false;
  }

  cyclePile(step: 1 | -1): void {
    this.pileOffset += step;
  }

  toggleSheet(): void {
    if (this.sheetMachine()) {
      this.sheetKey = undefined;
    } else {
      const machine = this.targeted();
      if (machine) this.sheetKey = machineStateKey(machine.state);
    }
  }

  closeSheet(): void {
    this.sheetKey = undefined;
  }

  openTruckMenu(): void {
    this.truckMenuOpenRaw = true;
  }

  closeTruckMenu(): void {
    this.truckMenuOpenRaw = false;
  }

  @on("tick")
  onTick() {
    const player = this.game.entities.tryGetSingleton(Player);
    if (!player) return;
    const gs = interactFacts(this.game);

    // A manual target pick lasts until the player moves or turns.
    const positionKey = vectorKey(player.cell);
    if (
      positionKey !== this.lastPositionKey ||
      player.direction !== this.lastDirection
    ) {
      this.lastPositionKey = positionKey;
      this.lastDirection = player.direction;
      this.offset = 0;
    }

    // The rummage ring starts over when its entries change.
    const targetedView = this.targeted()?.view();
    const sourcesKey = materialSources(gs, shopCellMap(this.game), targetedView)
      .map(materialSourceKey)
      .join("|");
    if (sourcesKey !== this.lastSourcesKey) {
      this.lastSourcesKey = sourcesKey;
      this.pileOffset = 0;
    }

    // The floor card belongs to what's in reach.
    if (
      this.floorSheetOpen &&
      !materialSources(gs, shopCellMap(this.game), targetedView).some(
        (s) => s.kind === "floor-pile",
      )
    ) {
      this.floorSheetOpen = false;
    }

    // Folding a sheet is for good: once the station is out of reach the
    // key goes with it.
    if (
      this.sheetKey != null &&
      (this.sheetMachine() == null ||
        player.away != null ||
        player.carriedMachine != null)
    ) {
      this.sheetKey = undefined;
    }

    // The trip card belongs to the cab.
    if (
      this.truckMenuOpenRaw &&
      (player.away != null || !atTruckCab(gs.shopInfo, player.cell))
    ) {
      this.truckMenuOpenRaw = false;
    }
  }
}
