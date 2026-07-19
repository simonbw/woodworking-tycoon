import React from "react";
import {
  MACHINE_TYPES,
  Machine,
  MachineId,
  MachineType,
} from "../../game/Machine";
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

      <div className="paper-card">
        <h3 className="font-stencil text-base uppercase tracking-widest border-b border-ink-black/40 pb-1 mb-3">
          Storage
        </h3>
        {groupedMachines.length === 0 ? (
          <p className="italic text-ink-fade text-sm">No machines in storage</p>
        ) : (
          <ul className="divide-y divide-ink-black/15">
            {groupedMachines.map((machineIds) => {
              const machineType = MACHINE_TYPES[machineIds[0]];
              const isSelected = placementMode?.machineTypeId === machineIds[0];
              return (
                <li
                  key={machineIds[0]}
                  className="flex items-center justify-between py-2 gap-3"
                >
                  <div className="grow">
                    <div className="font-condensed uppercase tracking-wide font-semibold">
                      {machineType.name}
                    </div>
                    <div className="text-xs text-ink-fade">
                      {machineType.description}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {machineIds.length > 1 && (
                      <span className="font-mono text-sm text-ink-fade tabular-nums">
                        ×{machineIds.length}
                      </span>
                    )}
                    <button
                      className={`button-paper text-xs ${
                        isSelected ? "bg-ink-black/15" : ""
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
