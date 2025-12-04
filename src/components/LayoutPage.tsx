import { Application } from "@pixi/react";
import React, { useState } from "react";
import { CellMap, useCellMap } from "../game/CellMap";
import {
  canPlaceMachine,
  removeMachineToStorageAction,
} from "../game/game-actions/machine-actions";
import {
  MACHINE_TYPES,
  Machine,
  MachineId,
  MachineType,
} from "../game/Machine";
import { Direction } from "../game/Vectors";
import { groupBy } from "../utils/arrayUtils";
import { useTexture } from "../utils/useTexture";
import { NavBar } from "./NavBar";
import { FloorTileSprite } from "./shop-view/FloorTileSprite";
import { MachineSprite } from "./shop-view/MachineSprite";
import { MaterialPilesSprite } from "./shop-view/MaterialPileSprite";
import { PIXELS_PER_CELL, cellToPixel } from "./shop-view/shop-scale";
import {
  gameStateContext,
  useApplyGameAction,
  useGameState,
  useLoadGame,
  useMachines,
  useNewGame,
  useSaveGame,
} from "./useGameState";
import { useKeyDown } from "./useKeyDown";

interface PlacementMode {
  machineType: MachineType;
  machineTypeId: MachineId;
  rotation: Direction;
}

type EditMode = "none" | "placing" | "moving";

export const LayoutPage: React.FC = () => {
  const [placementMode, setPlacementMode] = useState<PlacementMode | null>(
    null,
  );
  const [selectedMachineIndex, setSelectedMachineIndex] = useState<
    number | null
  >(null);
  const [moveRotation, setMoveRotation] = useState<Direction>(0);
  const [hoverPosition, setHoverPosition] = useState<[number, number] | null>(
    null,
  );

  const gameState = useGameState();
  const machines = useMachines();
  const updateGameState = useApplyGameAction();

  // Determine current edit mode
  const editMode: EditMode = placementMode
    ? "placing"
    : selectedMachineIndex !== null
      ? "moving"
      : "none";

  useKeyDown((event) => {
    switch (event.key) {
      case "Escape":
        setPlacementMode(null);
        setSelectedMachineIndex(null);
        return;
      case "r":
      case "R":
        if (placementMode) {
          setPlacementMode({
            ...placementMode,
            rotation: ((placementMode.rotation + 1) % 4) as Direction,
          });
        } else if (selectedMachineIndex !== null) {
          setMoveRotation(((moveRotation + 1) % 4) as Direction);
        }
        break;
      case "Delete":
      case "Backspace":
        if (selectedMachineIndex !== null) {
          updateGameState(removeMachineToStorageAction(selectedMachineIndex));
          setSelectedMachineIndex(null);
        }
        break;
    }
  });

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
    <main className="p-8 space-y-6">
      <NavBar />

      <div className="grid grid-cols-2">
        <section>
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
                  onClick={() => {
                    // Click on background deselects
                    setSelectedMachineIndex(null);
                  }}
                />
                {cellMap.getCells().map((cell) => (
                  <FloorTileSprite
                    cell={cell}
                    key={`cell-${cell.position.join(",")}`}
                    placementMode={placementMode}
                    selectedMachineIndex={selectedMachineIndex}
                    moveRotation={moveRotation}
                    onPlacementComplete={() => setPlacementMode(null)}
                    onMoveComplete={() => {
                      setSelectedMachineIndex(null);
                      setMoveRotation(0);
                    }}
                    onHover={(position) => setHoverPosition(position)}
                    onHoverOut={() => setHoverPosition(null)}
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
                      onClick={() => {
                        if (editMode === "none") {
                          // Toggle selection
                          if (selectedMachineIndex === index) {
                            setSelectedMachineIndex(null);
                          } else {
                            setSelectedMachineIndex(index);
                            setMoveRotation(machinePlacement.state.rotation);
                          }
                        }
                      }}
                    />
                  </pixiContainer>
                ))}
                {placementMode && (
                  <GhostMachinePreview
                    placementMode={placementMode}
                    cellMap={cellMap}
                    hoverPosition={hoverPosition}
                  />
                )}
                {selectedMachineIndex !== null && (
                  <GhostMovePreview
                    selectedMachineIndex={selectedMachineIndex}
                    moveRotation={moveRotation}
                    cellMap={cellMap}
                    hoverPosition={hoverPosition}
                  />
                )}
              </pixiContainer>
            </gameStateContext.Provider>
          </Application>
        </section>
        <StorageSection
          placementMode={placementMode}
          setPlacementMode={setPlacementMode}
          editMode={editMode}
          selectedMachineIndex={selectedMachineIndex}
          machines={machines}
        />
      </div>
    </main>
  );
};

const StorageSection: React.FC<{
  placementMode: PlacementMode | null;
  setPlacementMode: (mode: PlacementMode | null) => void;
  editMode: EditMode;
  selectedMachineIndex: number | null;
  machines: readonly any[];
}> = ({
  placementMode,
  setPlacementMode,
  editMode,
  selectedMachineIndex,
  machines,
}) => {
  const gameState = useGameState();
  const groupedMachines = [
    ...groupBy(gameState.storage.machines, (machineId) => machineId).values(),
  ];

  return (
    <section className="space-y-4">
      <h2 className="section-heading">Layout Editor</h2>

      {/* Mode indicator */}
      <div className="p-4 bg-brown-800 rounded-lg border-2 border-brown-700">
        <div className="mb-2">
          <span className="text-sm font-semibold text-brown-300">Mode: </span>
          <span className="text-brown-100 font-bold">
            {editMode === "placing" && "Placing Machine"}
            {editMode === "moving" && "Moving Machine"}
            {editMode === "none" && "Select or Place"}
          </span>
        </div>

        {/* Keyboard shortcuts */}
        <div className="text-xs text-brown-400 space-y-1">
          {editMode === "placing" && (
            <>
              <div>• Click to place machine</div>
              <div>• R to rotate</div>
              <div>• ESC to cancel</div>
            </>
          )}
          {editMode === "moving" && (
            <>
              <div>
                • Moving:{" "}
                {selectedMachineIndex !== null &&
                  machines[selectedMachineIndex]?.type.name}
              </div>
              <div>• Click to move</div>
              <div>• R to rotate</div>
              <div>• Delete to remove</div>
              <div>• ESC to cancel</div>
            </>
          )}
          {editMode === "none" && (
            <>
              <div>• Click machine to select</div>
              <div>• Click "Place" to add from storage</div>
            </>
          )}
        </div>
      </div>

      {/* Storage inventory */}
      <div>
        <h3 className="text-lg font-semibold text-brown-100 mb-2">Storage</h3>
        {groupedMachines.length === 0 ? (
          <p className="text-brown-400 text-sm italic">
            No machines in storage
          </p>
        ) : (
          <ul className="space-y-2">
            {groupedMachines.map((machineIds) => {
              const machineType = MACHINE_TYPES[machineIds[0]];
              const isSelected = placementMode?.machineTypeId === machineIds[0];
              return (
                <li
                  key={machineIds[0]}
                  className="flex items-center justify-between p-3 bg-brown-900 rounded border border-brown-700 hover:border-brown-600"
                >
                  <div>
                    <div className="font-medium text-brown-100">
                      {machineType.name}
                    </div>
                    <div className="text-xs text-brown-400">
                      {machineType.description}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {machineIds.length > 1 && (
                      <span className="text-sm text-brown-300">
                        ×{machineIds.length}
                      </span>
                    )}
                    <button
                      className={`button text-sm ${
                        isSelected ? "bg-brown-600" : ""
                      }`}
                      onClick={() =>
                        setPlacementMode({
                          machineType,
                          machineTypeId: machineIds[0],
                          rotation: 0,
                        })
                      }
                      disabled={editMode !== "none"}
                    >
                      {isSelected ? "Placing..." : "Place"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

const GhostMachinePreview: React.FC<{
  placementMode: PlacementMode;
  cellMap: CellMap;
  hoverPosition: [number, number] | null;
}> = ({ placementMode, cellMap, hoverPosition }) => {
  const isValid =
    hoverPosition && cellMap.has(hoverPosition)
      ? canPlaceMachine(
          cellMap,
          placementMode.machineType,
          hoverPosition,
          placementMode.rotation,
        )
      : false;

  // Create a temporary machine state for rendering
  const ghostMachine = hoverPosition
    ? {
        machineTypeId: placementMode.machineTypeId,
        position: hoverPosition,
        rotation: placementMode.rotation,
        selectedOperationId:
          placementMode.machineType.operations.length > 0
            ? placementMode.machineType.operations[0].id
            : "none",
        operationProgress: {
          status: "notStarted" as const,
          ticksRemaining: 0,
        },
        inputMaterials: [],
        processingMaterials: [],
        outputMaterials: [],
      }
    : null;

  // Render ghost preview - non-interactive, just visual
  if (!ghostMachine || !hoverPosition || !cellMap.has(hoverPosition)) {
    return null;
  }

  return (
    <pixiContainer
      alpha={0.6}
      tint={isValid ? 0xffffff : 0xff6666}
      eventMode="none"
    >
      <MachineSprite machine={new Machine(ghostMachine)} />
    </pixiContainer>
  );
};

const GhostMovePreview: React.FC<{
  selectedMachineIndex: number;
  moveRotation: Direction;
  cellMap: CellMap;
  hoverPosition: [number, number] | null;
}> = ({ selectedMachineIndex, moveRotation, cellMap, hoverPosition }) => {
  const gameState = useGameState();

  const selectedMachine = gameState.machines[selectedMachineIndex];
  if (!selectedMachine) return null;

  const machineType = MACHINE_TYPES[selectedMachine.machineTypeId];

  const isValid =
    hoverPosition && cellMap.has(hoverPosition)
      ? canPlaceMachine(
          cellMap,
          machineType,
          hoverPosition,
          moveRotation,
          selectedMachineIndex,
        )
      : false;

  // Create a temporary machine state for rendering
  const ghostMachine = hoverPosition
    ? {
        machineTypeId: selectedMachine.machineTypeId,
        position: hoverPosition,
        rotation: moveRotation,
        selectedOperationId: selectedMachine.selectedOperationId,
        operationProgress: {
          status: "notStarted" as const,
          ticksRemaining: 0,
        },
        inputMaterials: [],
        processingMaterials: [],
        outputMaterials: [],
      }
    : null;

  // Render ghost preview - non-interactive, just visual
  if (!ghostMachine || !hoverPosition || !cellMap.has(hoverPosition)) {
    return null;
  }

  return (
    <pixiContainer
      alpha={0.6}
      tint={isValid ? 0xffffff : 0xff6666}
      eventMode="none"
    >
      <MachineSprite machine={new Machine(ghostMachine)} />
    </pixiContainer>
  );
};
