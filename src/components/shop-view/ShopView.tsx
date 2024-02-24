import React from "react";
import { useCellMap } from "../../game/CellMap";
import { useGameState } from "../useGameState";
import { FloorTileSprite } from "./FloorTileSprite";
import { MachineSprite } from "./MachineSprite";
import { MaterialPilesSprite } from "./MaterialPileSprite";
import { PersonSprite } from "./PersonSprite";
import { ShopKeyboardShortcuts } from "./ShopKeyboardShortcuts";
import { WorkQueueSprite } from "./WorkQueueSprite";

export const CELL_SIZE = 100;
export const SPACING = 2;
export function scaled(n: number): number {
  return n * CELL_SIZE;
}

export const ShopView: React.FC = () => {
  const gameState = useGameState();
  const cellMap = useCellMap();

  const materialPileGroups = cellMap
    .getCells()
    .filter((cell) => cell.materialPiles.length > 0)
    .map((cell) => cell.materialPiles);

  const viewX = scaled(cellMap.getMinX()) - SPACING;
  const viewY = scaled(cellMap.getMinY()) - SPACING;
  const width = scaled(cellMap.getWidth()) + 2 * SPACING;
  const height = scaled(cellMap.getHeight()) + 2 * SPACING;

  return (
    <>
      <ShopKeyboardShortcuts />
      <svg
        viewBox={`${viewX} ${viewY} ${width} ${height}`}
        className="w-64 "
        shapeRendering="geometricPrecision"
      >
        {cellMap.getCells().map((cell) => (
          <FloorTileSprite
            cell={cell}
            key={`cell-${cell.position.join(",")}`}
          />
        ))}

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

        <WorkQueueSprite />

        <PersonSprite person={gameState.player} />
      </svg>
    </>
  );
};
