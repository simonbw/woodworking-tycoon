import React from "react";
import { Machine } from "../../game/Machine";

type EditMode = "none" | "placing" | "moving";

interface EditorModeIndicatorProps {
  editMode: EditMode;
  selectedMachineIndex: number | null;
  machines: readonly Machine[];
}

export const EditorModeIndicator: React.FC<EditorModeIndicatorProps> = ({
  editMode,
  selectedMachineIndex,
  machines,
}) => {
  return (
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
  );
};
