import { LRUCache } from "typescript-lru-cache";
import { useGameState } from "../components/useGameState";
import { GameState, MaterialPile } from "./GameState";
import { getMachines, Machine } from "./Machine";
import { pileFootprint } from "./pile-helpers";
import { Vector, rotateVec, translateVec } from "./Vectors";

export type CellInfo = {
  readonly position: Vector;
  /**
   * The topmost machine here: a benchtop machine if one is mounted on a
   * worktable at this cell, otherwise the machine (or table) itself. This
   * is what blocks walking and placement — everything physical.
   */
  readonly machine: Machine | undefined;
  /**
   * The worktable underneath, when a benchtop machine sits on it here.
   * (A table cell with nothing mounted is just `machine`.)
   */
  readonly tableMachine: Machine | undefined;
  readonly operableMachines: ReadonlyArray<Machine>;
  /** Machines whose outfeed lands here — outputs are collected from this cell. */
  readonly outputMachines: ReadonlyArray<Machine>;
  /** Piles anchored to this cell (this is where they render). */
  readonly materialPiles: ReadonlyArray<MaterialPile>;
  /**
   * Piles grabbable from this cell: anchored here or overhanging from a
   * neighbor (long boards span several cells — see pileFootprint).
   */
  readonly grabbablePiles: ReadonlyArray<MaterialPile>;
};

const vecToKey = (vec: Vector): string => vec.join(",");

// The type used internally by the cell map to allow mutation
type MutableCellInfo = {
  readonly position: Vector;
  machine: Machine | undefined;
  tableMachine: Machine | undefined;
  readonly operableMachines: Machine[];
  readonly outputMachines: Machine[];
  readonly materialPiles: MaterialPile[];
  readonly grabbablePiles: MaterialPile[];
};

// Keep computed cell maps for game states.
const cellMapCache = new LRUCache<GameState, CellMap>({
  maxSize: 100,
});

export class CellMap {
  private _cells: CellInfo[];
  private _map = new Map<string, CellInfo>();

  static fromGameState(gameState: GameState): CellMap {
    if (!cellMapCache.has(gameState)) {
      const cellMap = new CellMap();

      const [width, height] = gameState.shopInfo.size;
      for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
          cellMap.addCell([j, i]);
        }
      }

      const machines = getMachines(gameState.machines);
      for (const machine of machines) {
        cellMap.addMachine(machine);
      }

      for (const materialPile of gameState.materialPiles) {
        cellMap.addMaterialPile(materialPile);
      }

      cellMapCache.set(gameState, cellMap);
    }

    return cellMapCache.get(gameState)!;
  }

  constructor(cells: CellInfo[] = []) {
    this._cells = [...cells];
    for (const cell of this._cells) {
      this._map.set(vecToKey(cell.position), cell);
    }
  }

  has([x, y]: Vector): boolean {
    return this._map.has(`${x},${y}`);
  }

  at(position: Vector): CellInfo | undefined {
    const [x, y] = position;
    return this._map.get(vecToKey(position));
  }

  private _at(position: Vector): MutableCellInfo {
    return this.at(position) as MutableCellInfo;
  }

  getCells(): readonly CellInfo[] {
    return this._cells;
  }

  getFreeCells(): readonly CellInfo[] {
    return this._cells.filter((cell) => cell.machine === undefined);
  }

  addCell(position: Vector, partial: Partial<CellInfo> = {}): void {
    if (!this.has(position)) {
      const cell = {
        position,
        machine: partial.machine ?? undefined,
        tableMachine: partial.tableMachine ?? undefined,
        operableMachines: partial.operableMachines ?? [],
        outputMachines: partial.outputMachines ?? [],
        materialPiles: partial.materialPiles ?? [],
        grabbablePiles: partial.grabbablePiles ?? [],
      };
      this._cells.push(cell);
      this._map.set(vecToKey(position), cell);
    }
  }

  addMachine(machine: Machine) {
    const machineCells = machine.type.cellsOccupied.map((cell) =>
      translateVec(rotateVec(cell, machine.rotation), machine.position),
    );
    for (const position of machineCells) {
      const cell = this._at(position)!;
      // A benchtop machine mounted on a worktable shares the table's cell:
      // the machine goes on top, the table underneath. Machines can be
      // added in either order (gameState.machines is unordered).
      const occupant = cell.machine;
      if (occupant !== undefined && machine.type.worktable) {
        cell.tableMachine = machine;
      } else {
        if (occupant?.type.worktable) {
          cell.tableMachine = occupant;
        }
        cell.machine = machine;
      }
    }

    // A body is bigger than a 1-ft cell, so machines are operable from a
    // small apron of cells around the operation position, not one exact
    // cell — and outputs are collected from an apron around the outfeed.
    for (const cell of machine.operationZone) {
      if (this.has(cell)) {
        this._at(cell)!.operableMachines.push(machine);
      }
    }
    for (const cell of machine.outputZone) {
      if (this.has(cell)) {
        this._at(cell)!.outputMachines.push(machine);
      }
    }
  }

  addMaterialPile(materialPile: MaterialPile) {
    const [x, y] = materialPile.position;
    this._at([x, y])!.materialPiles.push(materialPile);
    for (const cell of pileFootprint(materialPile)) {
      if (this.has(cell)) {
        this._at(cell)!.grabbablePiles.push(materialPile);
      }
    }
  }

  getMinX(): number {
    return Math.min(...this._cells.map((cell) => cell.position[0]));
  }

  getMaxX(): number {
    return Math.max(...this._cells.map((cell) => cell.position[0]));
  }

  getMinY(): number {
    return Math.min(...this._cells.map((cell) => cell.position[1]));
  }

  getMaxY(): number {
    return Math.max(...this._cells.map((cell) => cell.position[1]));
  }

  getWidth(): number {
    return this.getMaxX() - this.getMinX() + 1;
  }

  getHeight(): number {
    return this.getMaxY() - this.getMinY() + 1;
  }
}

export const useCellMap = () => {
  const gameState = useGameState();
  return CellMap.fromGameState(gameState);
};
