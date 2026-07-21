import { Application } from "@pixi/react";
import React from "react";
import { useCellMap } from "../../game/CellMap";
import { useTexture } from "../../utils/useTexture";
import {
  gameStateContext,
  useApplyGameAction,
  useGameState,
  useMachines,
  useQuitToMenu,
  useSaveGame,
} from "../useGameState";
import { BroomSprite } from "./BroomSprite";
import { DustLayer } from "./DustLayer";
import { FloorTileSprite } from "./FloorTileSprite";
import { MachineSprite } from "./MachineSprite";
import { MaterialPilesSprite } from "./MaterialPileSprite";
import { PersonSprite } from "./PersonSprite";
import { ShopKeyboardShortcuts } from "./ShopKeyboardShortcuts";
import { ShopVacSprite } from "./ShopVacSprite";
import { WorkQueueSprite } from "./WorkQueueSprite";
import { cellToPixel, cellToPixelVec } from "./shop-scale";

export const ShopView: React.FC = () => {
  const gameState = useGameState();
  const machines = useMachines();
  const updateGameState = useApplyGameAction();
  const saveGame = useSaveGame();
  const quitToMenu = useQuitToMenu();
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
        <gameStateContext.Provider
          value={{ gameState, updateGameState, saveGame, quitToMenu }}
        >
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
          {/* Settled sawdust sits on the floor, under everything that moves */}
          <DustLayer width={width} height={height} />
          {gameState.progression.sweepingUnlocked && <BroomSprite />}

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
          {[...machines]
            // Worktables draw first so mounted benchtop machines sit on top
            .sort(
              (a, b) =>
                Number(b.type.worktable ?? false) -
                Number(a.type.worktable ?? false),
            )
            .map((machinePlacement) => (
              <MachineSprite
                key={
                  machinePlacement.type.id + machinePlacement.position.join(",")
                }
                machine={machinePlacement}
              />
            ))}
          <WorkQueueSprite />
          <ShopVacSprite />
          {!gameState.player.away && <PersonSprite person={gameState.player} />}
        </gameStateContext.Provider>
      </Application>
    </>
  );
};
