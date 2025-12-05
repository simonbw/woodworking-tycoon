import React, { useCallback, useState } from "react";
import { useCellMap } from "../game/CellMap";
import {
  canPlaceMachine,
  moveMachineAction,
  placeMachineAction,
  removeMachineToStorageAction,
} from "../game/game-actions/machine-actions";
import { combineActions } from "../game/game-actions/misc-actions";
import {
  addWorkItemAction,
  applyWorkItemAction,
} from "../game/game-actions/work-item-actions";
import { GameState } from "../game/GameState";
import { MACHINE_TYPES, MachineId, MachineType } from "../game/Machine";
import { Direction } from "../game/Vectors";
import { findPath } from "../utils/pathingUtils";
import { NavBar } from "./NavBar";
import { LayoutEditorCanvas } from "./layout-page/LayoutEditorCanvas";
import { StorageSection } from "./layout-page/StorageSection";
import { useApplyGameAction, useGameState, useMachines } from "./useGameState";
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
  const cellMap = useCellMap();

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

  const handleFloorTileClick = useCallback(
    (position: [number, number]) => {
      // If in placement mode, try to place the machine
      if (placementMode) {
        const isValid = canPlaceMachine(
          cellMap,
          placementMode.machineType,
          position,
          placementMode.rotation,
        );

        if (isValid) {
          updateGameState(
            placeMachineAction(
              placementMode.machineTypeId,
              position,
              placementMode.rotation,
            ),
          );
          setPlacementMode(null);
        }
        return;
      }

      // If in move mode, try to move the selected machine
      if (selectedMachineIndex !== null && selectedMachineIndex !== undefined) {
        const selectedMachine = gameState.machines[selectedMachineIndex];
        if (selectedMachine) {
          const machineType = MACHINE_TYPES[selectedMachine.machineTypeId];
          const isValid = canPlaceMachine(
            cellMap,
            machineType,
            position,
            moveRotation,
            selectedMachineIndex, // Exclude the machine being moved
          );

          if (isValid) {
            updateGameState(
              moveMachineAction(selectedMachineIndex, position, moveRotation),
            );
            setSelectedMachineIndex(null);
            setMoveRotation(0);
          }
        }
        return;
      }

      // Normal player movement
      const startPosition = getWorkQueueEndState(gameState).player.position;

      const path = findPath(
        startPosition,
        position,
        cellMap.getFreeCells().map((cell) => cell.position),
      );

      if (path != undefined) {
        updateGameState(
          combineActions(
            ...path.map((pathItem) =>
              addWorkItemAction({
                type: "move",
                direction: pathItem.direction,
              }),
            ),
          ),
        );
      }
    },
    [
      placementMode,
      selectedMachineIndex,
      moveRotation,
      cellMap,
      updateGameState,
      gameState,
    ],
  );

  const handleMachineClick = useCallback(
    (index: number) => {
      if (editMode === "none") {
        // Toggle selection
        if (selectedMachineIndex === index) {
          setSelectedMachineIndex(null);
        } else {
          setSelectedMachineIndex(index);
          setMoveRotation(gameState.machines[index].rotation);
        }
      }
    },
    [editMode, selectedMachineIndex, gameState.machines],
  );

  const handleBackgroundClick = useCallback(() => {
    // Click on background deselects
    setSelectedMachineIndex(null);
  }, []);

  return (
    <main className="p-8 space-y-6">
      <NavBar />

      <div className="grid grid-cols-2">
        <section>
          <LayoutEditorCanvas
            cellMap={cellMap}
            placementMode={placementMode}
            selectedMachineIndex={selectedMachineIndex}
            moveRotation={moveRotation}
            hoverPosition={hoverPosition}
            editMode={editMode}
            onFloorTileClick={handleFloorTileClick}
            onHover={setHoverPosition}
            onHoverOut={() => setHoverPosition(null)}
            onMachineClick={handleMachineClick}
            onBackgroundClick={handleBackgroundClick}
          />
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

// Get the position at the end of the current work queue
function getWorkQueueEndState(gameState: GameState): GameState {
  let state = gameState;
  for (const workItem of state.player.workQueue) {
    state = applyWorkItemAction(workItem)(state);
  }
  return state;
}
