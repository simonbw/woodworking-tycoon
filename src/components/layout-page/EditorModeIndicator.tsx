import React from "react";
import { Machine } from "../../game/Machine";

type EditMode = "none" | "placing" | "moving";

interface EditorModeIndicatorProps {
  editMode: EditMode;
  selectedMachineIndex: number | null;
  machines: readonly Machine[];
}

const MODE_LABEL: Record<EditMode, string> = {
  placing: "Placing Machine",
  moving: "Moving Machine",
  none: "Select or Place",
};

export const EditorModeIndicator: React.FC<EditorModeIndicatorProps> = ({
  editMode,
  selectedMachineIndex,
  machines,
}) => {
  const movingName =
    editMode === "moving" && selectedMachineIndex !== null
      ? machines[selectedMachineIndex]?.type.name
      : null;

  return (
    <div className="paper-card-ivory relative">
      <div className="font-condensed uppercase tracking-[0.25em] text-[0.65rem] text-ink-fade leading-none">
        Mode
      </div>
      <div className="font-stencil text-xl uppercase tracking-wide mt-0.5">
        {MODE_LABEL[editMode]}
      </div>

      <ul className="mt-3 text-xs space-y-1 font-typewriter border-t border-ink-black/20 pt-2">
        {editMode === "placing" && (
          <>
            <Hint keys={["Click"]}>Place machine</Hint>
            <Hint keys={["R"]}>Rotate</Hint>
            <Hint keys={["Esc"]}>Cancel</Hint>
          </>
        )}
        {editMode === "moving" && (
          <>
            {movingName && (
              <li className="text-ink-fade italic">Moving: {movingName}</li>
            )}
            <Hint keys={["Click"]}>Move</Hint>
            <Hint keys={["R"]}>Rotate</Hint>
            <Hint keys={["Del"]}>Remove to storage</Hint>
            <Hint keys={["Esc"]}>Cancel</Hint>
          </>
        )}
        {editMode === "none" && (
          <>
            <Hint keys={["Click"]}>Select machine</Hint>
            <Hint keys={["Place"]}>Add from storage</Hint>
          </>
        )}
      </ul>
    </div>
  );
};

const Hint: React.FC<{ keys: string[]; children: React.ReactNode }> = ({
  keys,
  children,
}) => (
  <li className="flex items-center gap-2">
    {keys.map((k) => (
      <kbd
        key={k}
        className="font-mono text-[0.65rem] px-1.5 py-0 rounded border border-ink-black/40 bg-paper-cream"
      >
        {k}
      </kbd>
    ))}
    <span>{children}</span>
  </li>
);
