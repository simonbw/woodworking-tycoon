import React from "react";
import { useGameHelpers } from "../useGameHelpers";
import { useGameState } from "../useGameState";
import { MachineSprite } from "./MachineSprite";
import { MaterialPilesSprite } from "./MaterialPileSprite";
import { PersonSprite } from "./PersonSprite";
import { useGameActions } from "../useGameActions";
import { useKeyDown } from "../useKeyDown";

export const CELL_SIZE = 100;
export const GRID_SPACING = 2;
export function scaled(n: number): number {
  return n * CELL_SIZE;
}

export const ShopView: React.FC = () => {
  const { gameState } = useGameState();
  const { getCellMap } = useGameHelpers();

  const cells = getCellMap();
  const height = cells.length;
  const width = cells[0].length;

  const materialPileGroups = cells.flatMap((row) =>
    row
      .filter((cell) => cell.materialPiles.length > 0)
      .map((cell) => cell.materialPiles)
  );

  const { movePlayer } = useGameActions();
  useKeyDown((event) => {
    switch (event.code) {
      case "Escape":
        console.log("Escape key pressed");
        break;
      case "KeyD":
      case "ArrowRight":
        movePlayer(0);
        break;
      case "KeyW":
      case "ArrowUp":
        movePlayer(1);
        break;
      case "KeyA":
      case "ArrowLeft":
        movePlayer(2);
        break;
      case "KeyS":
      case "ArrowDown":
        movePlayer(3);
        break;
    }
  });

  return (
    <svg
      viewBox={`${-GRID_SPACING} ${-GRID_SPACING} ${
        scaled(width) + GRID_SPACING
      } ${scaled(height) + GRID_SPACING}`}
      className="w-64 "
      shapeRendering="geometricPrecision"
    >
      {cells.flatMap((row) =>
        row.map((cell) => (
          <rect
            key={`cell-${cell.x},${cell.y}`}
            x={cell.x * CELL_SIZE + GRID_SPACING}
            y={cell.y * CELL_SIZE + GRID_SPACING}
            width={CELL_SIZE - GRID_SPACING * 2}
            height={CELL_SIZE - GRID_SPACING * 2}
            className="fill-zinc-700"
          />
        ))
      )}

      {/* TODO: Sort these by ones in the same square */}
      {materialPileGroups.map((materialPiles, i) => (
        <g
          key={`pile${materialPiles[0].position.join(",")}`}
          style={{
            transform: `translate(${scaled(
              materialPiles[0].position[0]
            )}px, ${scaled(materialPiles[0].position[1])}px)`,
          }}
        >
          <MaterialPilesSprite materialPiles={materialPiles} />
        </g>
      ))}

      {gameState.machines.map((machinePlacement) => (
        <MachineSprite
          key={machinePlacement.type.id + machinePlacement.position.join(",")}
          machinePlacement={machinePlacement}
        />
      ))}

      <PersonSprite person={gameState.player} />
    </svg>
  );
};
