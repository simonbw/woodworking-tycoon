import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { CellMap } from "../../game/CellMap";
import { floorMachines } from "../entities/MachineEntity";
import { ShopInfo } from "./ShopInfo";

/**
 * The shop floor's live cell index (issue #230, phase 2): the same
 * `CellMap` the pure helpers walk, owned by the world and kept current
 * by the domain events instead of rebuilt per question. Anything holding
 * a `Game` reads `cellMap()` here; the pure `src/game` helpers keep
 * taking a map (or building one from a snapshot) and never know this
 * entity exists.
 *
 * The index is rebuilt lazily: any machine event (or a whole-world load)
 * marks it stale, and the next read rebuilds from the live entities. A
 * machine's placement *and* its wrapped state feed the map's cells, so a
 * state replacement invalidates too — cost stays proportional to
 * mutations, not questions.
 *
 * Transient — never serialized; added per session by the bootstrap.
 */
export class ShopGrid extends BaseEntity implements Entity {
  id = "shopGrid";
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private map: CellMap | null = null;

  /** The current floor, indexed by cell. Valid until the next mutation. */
  cellMap(): CellMap {
    if (this.map === null) {
      this.map = this.build();
    }
    return this.map;
  }

  @on("machineAdded")
  onMachineAdded() {
    this.map = null;
  }

  @on("machineRemoved")
  onMachineRemoved() {
    this.map = null;
  }

  @on("machineStateChanged")
  onMachineStateChanged() {
    this.map = null;
  }

  @on("worldLoaded")
  onWorldLoaded() {
    this.map = null;
  }

  private build(): CellMap {
    const map = new CellMap();
    const [width, height] = this.game.entities.getSingleton(ShopInfo).info
      .size;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        map.addCell([x, y]);
      }
    }
    for (const machine of floorMachines(this.game)) {
      map.addMachine(machine);
    }
    return map;
  }
}
