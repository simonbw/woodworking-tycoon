import React from "react";
import { Machine } from "../../game/Machine";
import {
  mountToolAction,
  unmountToolAction,
} from "../../game/game-actions/tool-actions";
import { ToolItem } from "../../game/Materials";
import { handSpaceLeft } from "../../game/Person";
import { TOOL_TYPES, ToolId } from "../../game/Tool";
import { toolIconSrc } from "../../utils/uiImages";
import { HintSurfaceContext, ShortcutKeys } from "../shortcuts/Kbd";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The tool rail floated across the top of the bench view — not a list in
 * a sheet, the rail itself, and the whole of tool management. Mounted
 * tools hang on it: click one to take it in hand (it becomes the
 * cursor); click its hook, right-click, or press Escape to hang it back
 * up, or hit the small ✕ to take it off the rail into the arms. Free
 * slots show as empty hooks; a compatible tool carried in the arms
 * appears ghosted on a hook, and clicking it hangs it up — mounting adds
 * its operations to the bench's plans. DOM buttons over the canvas so
 * they keep focus states, titles, and testability for free.
 */
export const BenchToolRail: React.FC<{
  machine: Machine;
  heldTool: ToolId | null;
  /** Taking a tool in hand stands down while a plan-driven script owns
   * the surface; hanging tools on and off the rail only locks while the
   * station is mid-job. */
  interactive: boolean;
  onToggle: (toolId: ToolId) => void;
}> = ({ machine, heldTool, interactive, onToggle }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  if (machine.toolSlots === 0) {
    return null;
  }

  const tools = machine.state.tools;
  const freeSlots = machine.toolSlots - tools.length;
  // Tools change what the station can do, so the rail holds still until
  // the running job is off it
  const working = machine.operationProgress.status === "inProgress";
  // A removed tool lands in the arms, so they need a slot free for it
  const handsFull = handSpaceLeft(gameState.player) < 1;
  // What's carried is what can go on the rail
  const mountableTools = gameState.player.inventory
    .filter((item): item is ToolItem => item.type === "tool")
    .filter((tool) => {
      const compatible = TOOL_TYPES[tool.toolId].compatibleMachines;
      return !compatible || compatible.includes(machine.state.machineTypeId);
    });

  return (
    // below-top-bar keeps the rail's ends clear of the top bar's chip
    // cluster (z-40, right-anchored) at narrow windows — hooks must stay
    // clickable
    <div className="pointer-events-auto absolute left-1/2 below-top-bar z-10 flex -translate-x-1/2 items-center gap-2 rounded border-2 border-black/40 bg-[#4a3826]/95 px-3 py-1.5 shadow-lg">
      <span className="mr-1 flex flex-col items-start font-condensed uppercase tracking-[0.15em] text-[0.6rem] text-paper-manila/60">
        <span>Tools</span>
        <span className="tabular-nums text-paper-manila/40">
          {tools.length}/{machine.toolSlots} slots
        </span>
      </span>
      {tools.map((toolId, index) => {
        const held = heldTool === toolId;
        return (
          <span key={`${toolId}-${index}`} className="group relative">
            <button
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
                  : "cursor-default opacity-60"
              } ${held ? "opacity-30" : ""}`}
            >
              <img
                src={toolIconSrc(toolId)}
                alt=""
                draggable={false}
                className="size-11 select-none [image-rendering:pixelated] drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)]"
              />
            </button>
            {/* Off the rail and into the arms — shown on hover so the
                rail reads as tools first, management second */}
            {!held && (
              <button
                type="button"
                aria-label={`Remove the ${TOOL_TYPES[toolId].name}`}
                title={
                  handsFull
                    ? "Hands full"
                    : `Take the ${TOOL_TYPES[toolId].name} off the rail`
                }
                disabled={working || handsFull}
                onClick={(event) => {
                  event.stopPropagation();
                  applyAction(unmountToolAction(machine, toolId));
                }}
                className="absolute -right-0.5 -top-0.5 hidden size-4 items-center justify-center rounded-full border border-black/50 bg-paper-manila text-[0.6rem] leading-none text-ink-black shadow group-hover:flex disabled:opacity-40"
              >
                ✕
              </button>
            )}
          </span>
        );
      })}
      {Array.from({ length: freeSlots }, (_, index) => {
        const candidate = mountableTools[index];
        return candidate ? (
          <button
            key={`hook-${index}`}
            type="button"
            aria-label={`Attach the ${TOOL_TYPES[candidate.toolId].name}`}
            title={`Hang the ${TOOL_TYPES[candidate.toolId].name} here (in hand)`}
            disabled={working}
            onClick={(event) => {
              event.stopPropagation();
              applyAction(mountToolAction(machine, candidate));
            }}
            className="rounded border border-dashed border-paper-manila/40 p-1 opacity-70 transition-transform hover:-translate-y-0.5 hover:opacity-100 disabled:opacity-40"
          >
            <img
              src={toolIconSrc(candidate.toolId)}
              alt=""
              draggable={false}
              className="size-11 select-none opacity-50 [image-rendering:pixelated]"
            />
          </button>
        ) : (
          // A bare hook: the slot is real, there's just nothing carried
          // that hangs on it
          <span
            key={`hook-${index}`}
            title="An empty hook — carry a tool here to hang it"
            className="flex size-[52px] items-center justify-center rounded border border-dashed border-paper-manila/25"
          >
            <span className="size-1.5 rounded-full bg-paper-manila/30" />
          </span>
        );
      })}
      {/* With a tool in hand the rail says how to let go of it — the hook
          it came off is right there, but the button and the key are
          quicker and neither is guessable */}
      {heldTool && (
        <HintSurfaceContext.Provider value="chrome">
          <span
            data-testid="bench-put-back-hint"
            className="ml-1 flex items-center gap-1.5 border-l border-paper-manila/20 pl-3 font-condensed text-[0.65rem] text-paper-manila/70"
          >
            <ShortcutKeys shortcut="put-back-tool" />
            put it back
          </span>
        </HintSurfaceContext.Provider>
      )}
    </div>
  );
};
