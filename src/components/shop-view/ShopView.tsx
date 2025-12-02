import { Application } from "@pixi/react";
import React from "react";
import { useCellMap } from "../../game/CellMap";
import { useTexture } from "../../utils/useTexture";
import {
  gameStateContext,
  useApplyGameAction,
  useGameState,
  useRawGameState,
  useSaveGame,
  useLoadGame,
  useNewGame,
} from "../useGameState";
import { FloorTileSprite } from "./FloorTileSprite";
import { MachineSprite } from "./MachineSprite";
import { MaterialPilesSprite } from "./MaterialPileSprite";
import { PersonSprite } from "./PersonSprite";
import { ShopKeyboardShortcuts } from "./ShopKeyboardShortcuts";
import { WorkQueueSprite } from "./WorkQueueSprite";
import { cellToPixel, cellToPixelVec } from "./shop-scale";

export const ShopView: React.FC = () => {
  const gameStateView = useGameState();
  const gameState = useRawGameState();
  const updateGameState = useApplyGameAction();
  const saveGame = useSaveGame();
  const loadGame = useLoadGame();
  const newGame = useNewGame();
  const cellMap = useCellMap();
  const floorTexture = useTexture("/images/concrete-floor-2-big.png");

  const materialPileGroups = cellMap
    .getCells()
    .filter((cell) => cell.materialPiles.length > 0)
    .map((cell) => cell.materialPiles);

  const width = cellToPixel(cellMap.getWidth());
  const height = cellToPixel(cellMap.getHeight());

  return (
    <>
      <ShopKeyboardShortcuts />
      <Application
        width={width}
        height={height}
        backgroundAlpha={0}
        antialias={true}
      >
        <gameStateContext.Provider value={{ gameState, updateGameState, saveGame, loadGame, newGame }}>
          <pixiTilingSprite
            eventMode="static"
            texture={floorTexture}
            tilePosition={{ x: 0, y: 0 }}
            tileScale={{ x: 0.25, y: 0.25 }}
            width={width}
            height={height}
          />
          {cellMap.getCells().map((cell) => (
            <FloorTileSprite
              cell={cell}
              key={`cell-${cell.position.join(",")}`}
            />
          ))}
          {materialPileGroups.map((materialPiles, i) => {
            const [x, y] = cellToPixelVec(materialPiles[0].position);
            return (
              <pixiContainer
                key={`pile${materialPiles[0].position.join(",")}`}
                x={x}
                y={y}
              >
                <MaterialPilesSprite materialPiles={materialPiles} />
              </pixiContainer>
            );
          })}
          {gameStateView.machines.map((machinePlacement) => (
            <MachineSprite
              key={
                machinePlacement.type.id + machinePlacement.position.join(",")
              }
              machine={machinePlacement}
            />
          ))}
          <WorkQueueSprite />
          <PersonSprite person={gameStateView.player} />
        </gameStateContext.Provider>
      </Application>
    </>
  );
};
