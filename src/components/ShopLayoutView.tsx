import React from "react";
import {
  GameState,
  Machine,
  MachinePlacement,
  Position,
} from "../game/GameState";
import { range } from "../utils/arrayUtils";
import { useGameState } from "./useGameState";

export const ShopLayoutView: React.FC = () => {
  const { gameState } = useGameState();
  const [width, height] = gameState.shopInfo.size;

  const cells = getCellMap(gameState);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-64">
      {cells.flatMap((row) =>
        row.map((cell) => (
          <rect
            key={`${cell.x}-${cell.y}`}
            x={cell.x}
            y={cell.y}
            width={1}
            height={1}
            fill={cell.machine ? "black" : "white"}
            className="stroke-[0.1] stroke-zinc-500"
          />
        ))
      )}
    </svg>
  );
};

type CellValue = { x: number; y: number; machine: boolean };

function getCellMap(gameState: GameState): CellValue[][] {
  const [width, height] = gameState.shopInfo.size;
  const machineCells = gameState.machines.flatMap(getMachineCells);

  const cells: CellValue[][] = range(0, height - 1).map((y) =>
    range(0, width - 1).map((x) => ({ x, y, machine: false }))
  );

  for (const machineCell of machineCells) {
    const [x, y] = machineCell;
    cells[y][x].machine = true;
  }

  return cells;
}

function getMachineCells(
  machinePosition: MachinePlacement
): readonly Position[] {
  return machinePosition.machine.cellsOccupied.map((cell) =>
    translateVec(
      rotateVec(cell, machinePosition.rotation),
      machinePosition.position
    )
  );
}

function rotateVec([x, y]: Position, rotation: 0 | 1 | 2 | 3): Position {
  switch (rotation) {
    case 0:
      return [x, y];
    case 1:
      return [y, -x];
    case 2:
      return [-x, -y];
    case 3:
      return [-y, x];
  }
}

function translateVec([x, y]: Position, [dx, dy]: Position): Position {
  return [x + dx, y + dy];
}
