import React from "react";
import { GameState, Machine, Person } from "../game/GameState";
import { Vector, rotateVec, translateVec } from "../game/Vectors";
import { range } from "../utils/arrayUtils";
import { useGameState } from "./useGameState";

const GRID_SPACING = 0.05;
const MACHINE_OVERHANG = 0.02;

export const ShopView: React.FC = () => {
  const { gameState } = useGameState();
  const [width, height] = gameState.shopInfo.size;

  const cells = getCellMap(gameState);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-64 bg-zinc-800"
      shapeRendering="crispEdges"
    >
      {cells.flatMap((row) =>
        row.map((cell) => (
          <rect
            key={`${cell.x}-${cell.y}`}
            x={cell.x + GRID_SPACING}
            y={cell.y + GRID_SPACING}
            width={1 - GRID_SPACING * 2}
            height={1 - GRID_SPACING * 2}
            className="fill-zinc-600"
          />
        ))
      )}

      {gameState.machines.map((machinePlacement) => (
        <MachineView
          key={machinePlacement.type.id}
          machinePlacement={machinePlacement}
        />
      ))}

      {gameState.people.map((person) => (
        <PersonView key={person.name} person={person} />
      ))}
    </svg>
  );
};

const PersonView: React.FC<{ person: Person }> = ({ person }) => {
  const [x, y] = person.position;
  return (
    <circle
      cx={0.5}
      cy={0.5}
      r={0.3}
      style={{ transform: `translate(${x}px, ${y}px)` }}
      className="fill-green-500 stroke-green-600 stroke-[0.05] transition-transform"
    />
  );
};

const MachineView: React.FC<{ machinePlacement: Machine }> = ({
  machinePlacement,
}) => {
  const cells = getMachineCells(machinePlacement);

  const operatorPosition = translateVec(
    rotateVec(
      machinePlacement.type.operationPosition,
      machinePlacement.rotation
    ),
    machinePlacement.position
  );

  return (
    <>
      {cells.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x - MACHINE_OVERHANG}
          y={y - MACHINE_OVERHANG}
          width={1 + MACHINE_OVERHANG * 2}
          height={1 + MACHINE_OVERHANG * 2}
          className={
            machinePlacement.type.className ?? "fill-amber-600 drop-shadow"
          }
        />
      ))}
      <circle
        cx={operatorPosition[0] + 0.5}
        cy={operatorPosition[1] + 0.5}
        className="fill-blue-500/50 stroke-blue-500/80 stroke-[0.05]"
        r={0.35}
      />
    </>
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

function getMachineCells(machinePosition: Machine): ReadonlyArray<Vector> {
  return machinePosition.type.cellsOccupied.map((cell) =>
    translateVec(
      rotateVec(cell, machinePosition.rotation),
      machinePosition.position
    )
  );
}
