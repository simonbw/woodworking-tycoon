import { LRUCache } from "typescript-lru-cache";
import { useGameState } from "../components/useGameState";
import { GameState, MaterialPile } from "./GameState";
import { Machine } from "./Machine";
import { Vector, rotateVec, translateVec } from "./Vectors";

export type CellInfo = {
  readonly position: Vector;
  readonly machine: Machine | undefined;
  readonly operableMachines: ReadonlyArray<Machine>;
  readonly materialPiles: ReadonlyArray<MaterialPile>;
};

const vecToKey = (vec: Vector): string => vec.join(",");

// The type used internally by the cell map to allow mutation
type MutableCellInfo = {
  readonly position: Vector;
  machine: Machine | undefined;
  readonly operableMachines: Machine[];
  readonly materialPiles: MaterialPile[];
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

      for (const machine of gameState.machines) {
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
        operableMachines: partial.operableMachines ?? [],
        materialPiles: partial.materialPiles ?? [],
      };
      this._cells.push(cell);
      this._map.set(vecToKey(position), cell);
    }
  }

  addMachine(machine: Machine) {
    const machineCells = machine.type.cellsOccupied.map((cell) =>
      translateVec(rotateVec(cell, machine.rotation), machine.position)
    );
    for (const position of machineCells) {
      this._at(position)!.machine = machine;
    }

    if (machine.type.operationPosition !== undefined) {
      const operationPosition = translateVec(
        rotateVec(machine.type.operationPosition, machine.rotation),
        machine.position
      );

      if (this.has(operationPosition)) {
        this._at(operationPosition)!.operableMachines.push(machine);
      }
    }
  }

  addMaterialPile(materialPile: MaterialPile) {
    const [x, y] = materialPile.position;
    this._at([x, y])!.materialPiles.push(materialPile);
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
