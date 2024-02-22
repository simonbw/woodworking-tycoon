import React from "react";
import { useGameHelpers } from "../useGameHelpers";
import { useGameState } from "../useGameState";
import { MachineView } from "./MachineView";
import { MaterialPileView } from "./MaterialPileView";
import { PersonView } from "./PersonView";
import { useGameActions } from "../useGameActions";

const GRID_SPACING = 0.05;
export const MACHINE_OVERHANG = 0.02;

export const ShopView: React.FC = () => {
  const { gameState } = useGameState();
  const { getCellMap } = useGameHelpers();
  const { movePlayer } = useGameActions();

  const cells = getCellMap();
  const height = cells.length;
  const width = cells[0].length;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-64 bg-zinc-800"
      shapeRendering="crispEdges"
    >
      {cells.flatMap((row) =>
        row.map((cell) => (
          <rect
            key={`cell-${cell.x},${cell.y}`}
            x={cell.x + GRID_SPACING}
            y={cell.y + GRID_SPACING}
            width={1 - GRID_SPACING * 2}
            height={1 - GRID_SPACING * 2}
            className="fill-zinc-700"
          />
        ))
      )}

      {/* TODO: Sort these by ones in the same square */}
      {gameState.materialPiles.map((materialPile, i) => (
        <MaterialPileView key={`pile${i}`} materialPile={materialPile} />
      ))}

      {gameState.machines.map((machinePlacement) => (
        <MachineView
          key={machinePlacement.type.id + machinePlacement.position.join(",")}
          machinePlacement={machinePlacement}
        />
      ))}

      <PersonView person={gameState.player} />
    </svg>
  );
};
