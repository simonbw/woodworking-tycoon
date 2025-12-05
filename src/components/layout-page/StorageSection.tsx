import React from "react";
import { MACHINE_TYPES, Machine, MachineId, MachineType } from "../../game/Machine";
import { Direction } from "../../game/Vectors";
import { groupBy } from "../../utils/arrayUtils";
import { useGameState } from "../useGameState";
import { EditorModeIndicator } from "./EditorModeIndicator";

type EditMode = "none" | "placing" | "moving";

interface PlacementMode {
  machineType: MachineType;
  machineTypeId: MachineId;
  rotation: Direction;
}

interface StorageSectionProps {
  placementMode: PlacementMode | null;
  setPlacementMode: (mode: PlacementMode | null) => void;
  editMode: EditMode;
  selectedMachineIndex: number | null;
  machines: readonly Machine[];
}

export const StorageSection: React.FC<StorageSectionProps> = ({
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

      <EditorModeIndicator
        editMode={editMode}
        selectedMachineIndex={selectedMachineIndex}
        machines={machines}
      />

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
