import React from "react";
import { TOOL_TYPES, ToolId } from "../../game/Tool";
import { toolIconSrc } from "../../utils/uiImages";
import { TOOL_RAIL_HEIGHT } from "./BenchBackdrop";

/**
 * The mounted tools, hanging on the rail across the top of the bench —
 * not a list in a sheet, the tools themselves. Click one to take it in
 * hand (it becomes the cursor); click its empty hook, right-click, or
 * press Escape to hang it back up. DOM buttons over the canvas so they
 * keep focus states, titles, and testability for free.
 */
export const BenchToolRail: React.FC<{
  tools: ReadonlyArray<ToolId>;
  heldTool: ToolId | null;
  /** The rail stands down while a plan-driven script owns the surface. */
  interactive: boolean;
  onToggle: (toolId: ToolId) => void;
}> = ({ tools, heldTool, interactive, onToggle }) => {
  if (tools.length === 0) {
    return null;
  }
  return (
    <div
      className="absolute inset-x-0 top-0 flex items-center gap-3 px-4"
      style={{ height: TOOL_RAIL_HEIGHT }}
    >
      {tools.map((toolId, index) => {
        const held = heldTool === toolId;
        return (
          <button
            key={`${toolId}-${index}`}
            type="button"
            data-testid={`bench-tool-${toolId}`}
            aria-label={
              held
                ? `Hang up the ${TOOL_TYPES[toolId].name}`
                : `Pick up the ${TOOL_TYPES[toolId].name}`
            }
            title={TOOL_TYPES[toolId].name}
            disabled={!interactive}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(toolId);
            }}
            className={`rounded p-1 transition-transform ${
              interactive
                ? "cursor-pointer hover:-translate-y-0.5 hover:drop-shadow-[0_3px_4px_rgba(0,0,0,0.5)]"
                : "cursor-default"
            } ${held ? "opacity-30" : ""}`}
          >
            <img
              src={toolIconSrc(toolId)}
              alt=""
              draggable={false}
              className="size-11 select-none [image-rendering:pixelated] drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)]"
            />
          </button>
        );
      })}
    </div>
  );
};
