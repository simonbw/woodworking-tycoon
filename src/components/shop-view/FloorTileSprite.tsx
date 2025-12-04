import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { CellInfo, useCellMap } from "../../game/CellMap";
import { GameState } from "../../game/GameState";
import { MachineId, MachineType, MACHINE_TYPES } from "../../game/Machine";
import { Direction } from "../../game/Vectors";
import { combineActions } from "../../game/game-actions/misc-actions";
import {
  canPlaceMachine,
  placeMachineAction,
  moveMachineAction,
} from "../../game/game-actions/machine-actions";
import {
  addWorkItemAction,
  applyWorkItemAction,
} from "../../game/game-actions/work-item-actions";
import { colors } from "../../utils/colors";
import { findPath } from "../../utils/pathingUtils";
import { useApplyGameAction, useGameState } from "../useGameState";
import { PIXELS_PER_CELL, SPACING } from "./shop-scale";

interface PlacementMode {
  machineType: MachineType;
  machineTypeId: MachineId;
  rotation: Direction;
}

export const FloorTileSprite: React.FC<{
  cell: CellInfo;
  placementMode?: PlacementMode | null;
  selectedMachineIndex?: number | null;
  moveRotation?: Direction;
  onPlacementComplete?: () => void;
  onMoveComplete?: () => void;
  onHover?: (position: [number, number]) => void;
  onHoverOut?: () => void;
}> = ({
  cell,
  placementMode,
  selectedMachineIndex,
  moveRotation = 0,
  onPlacementComplete,
  onMoveComplete,
  onHover,
  onHoverOut,
}) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const cellMap = useCellMap();

  const size = PIXELS_PER_CELL - SPACING * 2;
  const draw = useCallback((g: Graphics) => {
    g.clear();
    g.rect(SPACING, SPACING, size, size);
    g.fill(colors.zinc[700]);
  }, []);

  const handleClick = useCallback(() => {
    // If in placement mode, try to place the machine
    if (placementMode) {
      const isValid = canPlaceMachine(
        cellMap,
        placementMode.machineType,
        cell.position,
        placementMode.rotation
      );

      if (isValid) {
        applyAction(
          placeMachineAction(
            placementMode.machineTypeId,
            cell.position,
            placementMode.rotation
          )
        );
        onPlacementComplete?.();
      }
      return;
    }

    // If in move mode, try to move the selected machine
    if (
      selectedMachineIndex !== null &&
      selectedMachineIndex !== undefined
    ) {
      const selectedMachine = gameState.machines[selectedMachineIndex];
      if (selectedMachine) {
        const machineType = MACHINE_TYPES[selectedMachine.machineTypeId];
        const isValid = canPlaceMachine(
          cellMap,
          machineType,
          cell.position,
          moveRotation,
          selectedMachineIndex // Exclude the machine being moved
        );

        if (isValid) {
          applyAction(
            moveMachineAction(
              selectedMachineIndex,
              cell.position,
              moveRotation
            )
          );
          onMoveComplete?.();
        }
      }
      return;
    }

    // Normal player movement
    const startPosition = getWorkQueueEndState(gameState).player.position;

    const path = findPath(
      startPosition,
      cell.position,
      cellMap.getFreeCells().map((cell) => cell.position)
    );

    if (path != undefined) {
      applyAction(
        combineActions(
          ...path.map((pathItem) =>
            addWorkItemAction({
              type: "move",
              direction: pathItem.direction,
            })
          )
        )
      );
    }
  }, [
    placementMode,
    selectedMachineIndex,
    moveRotation,
    cellMap,
    cell.position,
    applyAction,
    gameState,
    onPlacementComplete,
    onMoveComplete,
  ]);

  return (
    <pixiGraphics
      eventMode="static"
      x={cell.position[0] * PIXELS_PER_CELL}
      y={cell.position[1] * PIXELS_PER_CELL}
      draw={draw}
      alpha={0.1}
      onClick={handleClick}
      onPointerOver={() => onHover?.(cell.position as [number, number])}
      onPointerOut={() => onHoverOut?.()}
    />
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
