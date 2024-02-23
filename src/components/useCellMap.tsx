import React, { ReactNode, createContext, useContext, useMemo } from "react";
import { GameState, Machine, MaterialPile } from "../game/GameState";
import { rotateVec, translateVec } from "../game/Vectors";
import { range } from "../utils/arrayUtils";
import { getMachineCells } from "./useGameHelpers";
import { useGameState } from "./useGameState";

type CellInfo = {
  x: number;
  y: number;
  machine: Machine | undefined;
  operableMachines: Machine[];
  materialPiles: MaterialPile[];
};

type CellMap = CellInfo[][];

const cellMapContext = createContext<CellMap | undefined>(undefined);

export const CellMapProvider: React.FC<{ children?: ReactNode }> = ({
  children,
}) => {
  const { gameState } = useGameState();
  const cellMap = useMemo(() => makeCellMap(gameState), [gameState]);
  return (
    <cellMapContext.Provider value={cellMap}>
      {children}
    </cellMapContext.Provider>
  );
};

export const useCellMap = () => {
  const cellMap = useContext(cellMapContext);
  if (cellMap === undefined) {
    throw new Error("useCellMap must be used within a CellMapProvider");
  }
  return cellMap;
};

export function makeCellMap(gameState: GameState): CellInfo[][] {
  const [width, height] = gameState.shopInfo.size;

  const cells: CellInfo[][] = range(0, height - 1).map((y) =>
    range(0, width - 1).map((x) => ({
      x,
      y,
      machine: undefined,
      operableMachines: [],
      materialPiles: [],
    }))
  );

  for (const machine of gameState.machines) {
    const machineCells = getMachineCells(machine);
    for (const cell of machineCells) {
      const [x, y] = cell;
      cells[y][x].machine = machine;
    }

    if (machine.type.operationPosition !== undefined) {
      const [ox, oy] = translateVec(
        rotateVec(machine.type.operationPosition, machine.rotation),
        machine.position
      );

      if (ox >= 0 && ox < width && oy >= 0 && oy < height) {
        cells[oy][ox].operableMachines.push(machine);
      }
    }
  }

  for (const materialPile of gameState.materialPiles) {
    const [x, y] = materialPile.position;
    cells[y][x].materialPiles.push(materialPile);
  }

  return cells;
}
