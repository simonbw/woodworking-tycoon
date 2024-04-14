import { Container, Stage, TilingSprite } from "@pixi/react";
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
import { PersonSprite } from "./PersonSprite";
import { ShopKeyboardShortcuts } from "./ShopKeyboardShortcuts";
import { WorkQueueSprite } from "./WorkQueueSprite";
import { cellToPixel, cellToPixelVec } from "./shop-scale";

export const ShopView: React.FC = () => {
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
    <>
      <ShopKeyboardShortcuts />
      <Stage
        width={width}
        height={height}
        options={{ backgroundAlpha: 0, antialias: true, eventMode: "auto" }}
      >
        <gameStateContext.Provider value={{ gameState, updateGameState }}>
          <TilingSprite
            eventMode="static"
            image={"/images/concrete-floor-2-big.png"}
            tilePosition={[0, 0]}
            tileScale={0.25}
            width={width}
            height={height}
          />
          {cellMap.getCells().map((cell) => (
            <FloorTileSprite
              cell={cell}
              key={`cell-${cell.position.join(",")}`}
            />
          ))}
          {materialPileGroups.map((materialPiles, i) => (
            <Container
              key={`pile${materialPiles[0].position.join(",")}`}
              position={cellToPixelVec(materialPiles[0].position)}
            >
              <MaterialPilesSprite materialPiles={materialPiles} />
            </Container>
          ))}
          {gameState.machines.map((machinePlacement) => (
            <MachineSprite
              key={
                machinePlacement.type.id + machinePlacement.position.join(",")
              }
              machine={machinePlacement}
            />
          ))}
          <WorkQueueSprite />
          <PersonSprite person={gameState.player} />
        </gameStateContext.Provider>
      </Stage>
    </>
  );
};
