import React from "react";
import { CellMap } from "../../game/CellMap";
import { canPlaceMachine } from "../../game/game-actions/machine-actions";
import { MACHINE_TYPES, Machine, MachineId } from "../../game/Machine";
import { Direction } from "../../game/Vectors";
import { MachineSprite } from "../shop-view/MachineSprite";

interface MachineGhostPreviewProps {
  machineTypeId: MachineId;
  position: [number, number] | null;
  rotation: Direction;
  cellMap: CellMap;
  excludeMachineIndex?: number;
}

export const MachineGhostPreview: React.FC<MachineGhostPreviewProps> = ({
  machineTypeId,
  position,
  rotation,
  cellMap,
  excludeMachineIndex,
}) => {
  if (!position || !cellMap.has(position)) {
    return null;
  }

  const machineType = MACHINE_TYPES[machineTypeId];
  const isValid = canPlaceMachine(
    cellMap,
    machineType,
    position,
    rotation,
    excludeMachineIndex,
  );

  // Create a temporary machine state for rendering
  const ghostMachine = {
    machineTypeId,
    position,
    rotation,
    selectedOperationId:
      machineType.operations.length > 0 ? machineType.operations[0].id : "none",
    operationProgress: {
      status: "notStarted" as const,
      ticksRemaining: 0,
    },
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
  };

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
