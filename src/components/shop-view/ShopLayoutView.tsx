// import "@pixi/events";
import { Container, Stage } from "@pixi/react-animated";
import React from "react";
import { useCellMap } from "../../game/CellMap";
import {
  gameStateContext,
  useApplyGameAction,
  useGameState,
} from "../useGameState";
import { FloorTileSprite } from "./FloorTileSprite";
import { MachineSprite } from "./MachineSprite";
import { MaterialPilesSprite } from "./MaterialPileSprite";
import { PIXELS_PER_CELL, cellToPixel } from "./shop-scale";

export const ShopLayoutView: React.FC = () => {
  const gameState = useGameState();
  const updateGameState = useApplyGameAction();
  const cellMap = useCellMap();

  const materialPileGroups = cellMap
    .getCells()
    .filter((cell) => cell.materialPiles.length > 0)
    .map((cell) => cell.materialPiles);

  const width = cellToPixel(cellMap.getWidth());
  const height = cellToPixel(cellMap.getHeight());

  return (
    <Stage
      width={width}
      height={height}
      options={{ backgroundAlpha: 0, antialias: true, eventMode: "auto" }}
    >
      <gameStateContext.Provider value={{ gameState, updateGameState }}>
        {cellMap.getCells().map((cell) => (
          <FloorTileSprite
            cell={cell}
            key={`cell-${cell.position.join(",")}`}
          />
        ))}
        {materialPileGroups.map((materialPiles, i) => (
          <Container
            key={`pile${materialPiles[0].position.join(",")}`}
            x={materialPiles[0].position[0] * PIXELS_PER_CELL}
            y={materialPiles[0].position[1] * PIXELS_PER_CELL}
          >
            <MaterialPilesSprite materialPiles={materialPiles} />
          </Container>
        ))}
        {gameState.machines.map((machinePlacement) => (
          <MachineSprite
            key={machinePlacement.type.id + machinePlacement.position.join(",")}
            machine={machinePlacement}
          />
        ))}
      </gameStateContext.Provider>
    </Stage>
  );
};
