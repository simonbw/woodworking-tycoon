import React from "react";
import { Machine, Person } from "../game/GameState";
import { rotateVec, translateVec } from "../game/Vectors";
import { getMachineCells, useGameHelpers } from "./useGameHelpers";
import { useGameState } from "./useGameState";

const GRID_SPACING = 0.05;
const MACHINE_OVERHANG = 0.02;

export const ShopView: React.FC = () => {
  const { gameState } = useGameState();
  const { getCellMap } = useGameHelpers();

  const cells = getCellMap();
  const width = cells[0].length;
  const height = cells.length;

  const [px, py] = gameState.people[0].position;
  const playerCell = cells[py][px];

  return (
    <div>
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
      <ul>
        {playerCell.operableMachines.map((machine) => (
          <li key={machine.type.name + machine.position.join(",")}>
            {machine.type.name}
          </li>
        ))}
      </ul>
    </div>
  );
};

const PersonView: React.FC<{ person: Person }> = ({ person }) => {
  const [x, y] = person.position;
  return (
    <>
      <circle
        cx={0.5}
        cy={0.5}
        r={0.3}
        // fill="url(#person-radial-gradient)"
        className="transition-transform fill-blue-600 drop-shadow-[0_5px_5px_rgba(0,0,0,1)]"
        style={{ transform: `translate(${x}px, ${y}px)` }}
      />
    </>
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
      <defs>
        <radialGradient id="operator-position-gradient">
          <stop offset="0%" className="stop-sky-400/20" />
          <stop offset="75%" className="stop-sky-400/60" />
          <stop offset="80%" className="stop-sky-400/20" />
          <stop offset="100%" className="stop-sky-400/0" />
        </radialGradient>
      </defs>
      <circle
        cx={operatorPosition[0] + 0.5}
        cy={operatorPosition[1] + 0.5}
        fill="url(#operator-position-gradient)"
        className="opacity-20"
        r={0.48}
      />
    </>
  );
};
