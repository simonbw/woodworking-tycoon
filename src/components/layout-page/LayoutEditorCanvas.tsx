import { Application } from "@pixi/react";
import React from "react";
import { CellMap } from "../../game/CellMap";
import { MachineId, Machine } from "../../game/Machine";
import { Direction } from "../../game/Vectors";
import { useTexture } from "../../utils/useTexture";
import { FloorTileSprite } from "../shop-view/FloorTileSprite";
import { MachineSprite } from "../shop-view/MachineSprite";
import { MaterialPilesSprite } from "../shop-view/MaterialPileSprite";
import { PIXELS_PER_CELL, cellToPixel } from "../shop-view/shop-scale";
import {
  gameStateContext,
  useApplyGameAction,
  useGameState,
  useLoadGame,
  useMachines,
  useNewGame,
  useSaveGame,
} from "../useGameState";
import { MachineGhostPreview } from "./MachineGhostPreview";

interface LayoutEditorCanvasProps {
  cellMap: CellMap;
  placementMode: {
    machineTypeId: MachineId;
    rotation: Direction;
  } | null;
  selectedMachineIndex: number | null;
  moveRotation: Direction;
  hoverPosition: [number, number] | null;
  editMode: "none" | "placing" | "moving";
  onFloorTileClick: (position: [number, number]) => void;
  onHover: (position: [number, number]) => void;
  onHoverOut: () => void;
  onMachineClick: (index: number) => void;
  onBackgroundClick: () => void;
}

export const LayoutEditorCanvas: React.FC<LayoutEditorCanvasProps> = ({
  cellMap,
  placementMode,
  selectedMachineIndex,
  moveRotation,
  hoverPosition,
  editMode,
  onFloorTileClick,
  onHover,
  onHoverOut,
  onMachineClick,
  onBackgroundClick,
}) => {
  const gameState = useGameState();
  const machines = useMachines();
  const updateGameState = useApplyGameAction();
  const saveGame = useSaveGame();
  const loadGame = useLoadGame();
  const newGame = useNewGame();
  const floorTexture = useTexture("/images/concrete-floor-2-big.png");

  const materialPileGroups = cellMap
    .getCells()
    .filter((cell) => cell.materialPiles.length > 0)
    .map((cell) => cell.materialPiles);

  const width = cellToPixel(cellMap.getWidth());
  const height = cellToPixel(cellMap.getHeight());

  return (
    <Application
      width={width}
      height={height}
      backgroundAlpha={0}
      antialias={true}
    >
      <gameStateContext.Provider
        value={{
          gameState,
          updateGameState,
          saveGame,
          loadGame,
          newGame,
        }}
      >
        <pixiContainer sortableChildren={true}>
          <pixiTilingSprite
            eventMode="static"
            texture={floorTexture}
            tilePosition={{ x: 0, y: 0 }}
            tileScale={{ x: 0.25, y: 0.25 }}
            width={width}
            height={height}
            onClick={onBackgroundClick}
          />
          {cellMap.getCells().map((cell) => (
            <FloorTileSprite
              cell={cell}
              key={`cell-${cell.position.join(",")}`}
              onClick={onFloorTileClick}
              onHover={onHover}
              onHoverOut={onHoverOut}
            />
          ))}
          {materialPileGroups.map((materialPiles, i) => (
            <pixiContainer
              key={`pile${materialPiles[0].position.join(",")}`}
              x={materialPiles[0].position[0] * PIXELS_PER_CELL}
              y={materialPiles[0].position[1] * PIXELS_PER_CELL}
            >
              <MaterialPilesSprite materialPiles={materialPiles} />
            </pixiContainer>
          ))}
          {machines.map((machinePlacement, index) => (
            <pixiContainer key={`machine-${index}`} zIndex={1000 + index}>
              <MachineSprite
                machine={machinePlacement}
                isSelected={selectedMachineIndex === index}
                onClick={editMode === "none" ? () => onMachineClick(index) : undefined}
              />
            </pixiContainer>
          ))}
          {placementMode && (
            <MachineGhostPreview
              machineTypeId={placementMode.machineTypeId}
              position={hoverPosition}
              rotation={placementMode.rotation}
              cellMap={cellMap}
            />
          )}
          {selectedMachineIndex !== null && (
            <MachineGhostPreview
              machineTypeId={
                gameState.machines[selectedMachineIndex]?.machineTypeId
              }
              position={hoverPosition}
              rotation={moveRotation}
              cellMap={cellMap}
              excludeMachineIndex={selectedMachineIndex}
            />
          )}
        </pixiContainer>
      </gameStateContext.Provider>
    </Application>
  );
};
