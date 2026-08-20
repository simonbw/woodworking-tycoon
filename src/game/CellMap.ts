import { LRUCache } from "typescript-lru-cache";
import { GameState } from "./GameState";
import { Machine } from "./Machine";
import { Vector, rotateVec, translateVec, vectorKey } from "./Vectors";

/**
 * The machine side of the shop, indexed by cell. Material piles are not
 * here: they sit at continuous positions (see pile-helpers.ts) and only
 * machines and the shop layout live on the grid.
 */
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
};

// The type used internally by the cell map to allow mutation
type MutableCellInfo = {
  readonly position: Vector;
  machine: Machine | undefined;
  tableMachine: Machine | undefined;
  readonly operableMachines: Machine[];
  readonly outputMachines: Machine[];
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

      for (const state of gameState.machines) {
        cellMap.addMachine(new Machine(state));
      }

      cellMapCache.set(gameState, cellMap);
    }

    return cellMapCache.get(gameState)!;
  }

  constructor(cells: CellInfo[] = []) {
    this._cells = [...cells];
    for (const cell of this._cells) {
      this._map.set(vectorKey(cell.position), cell);
    }
  }

  has(position: Vector): boolean {
    return this._map.has(vectorKey(position));
  }

  at(position: Vector): CellInfo | undefined {
    return this._map.get(vectorKey(position));
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
      };
      this._cells.push(cell);
      this._map.set(vectorKey(position), cell);
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
