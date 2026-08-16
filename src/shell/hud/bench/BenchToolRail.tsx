import React from "react";
import { HintSurfaceContext, Kbd } from "../../../components/shortcuts/Kbd";
import { TOOL_TYPES } from "../../../game/Tool";
import { toolIconSrc } from "../../../utils/uiImages";
import { BenchDive } from "../../scenes/bench/BenchDive";
import { useGame, useShellVersion } from "../../useShell";

/**
 * The tool rail across the top of the bench view — the bench's mode
 * selector (docs/bench-work.md decision 0), not a list in a sheet.
 * Mounted tools hang on it: click one to take it in hand, click it
 * again (or Escape, or the empty rail) to hang it back up. Applying the
 * held tool to a valid target is the operation — a hammer over a staged
 * pallet is pry mode.
 *
 * The mounting half of the old rail (the ✕ that takes a tool off into
 * the arms, the ghosted hooks that hang a carried tool up, the run's
 * neighbours sharing the rail) joins with the tool-first sub-phase; the
 * station sheet still mounts and unmounts in the meantime.
 */
export const BenchToolRail: React.FC = () => {
  const game = useGame();
  useShellVersion();
  const dive = game.entities.tryGetSingleton(BenchDive);
  const bench = dive?.openBench();
  if (!dive || !bench) return null;

  const tools = bench.state.tools;

  return (
    <HintSurfaceContext.Provider value="chrome">
      <div
        className="pointer-events-auto absolute inset-x-0 top-0 z-50 flex justify-center gap-2 p-3"
        data-testid="bench-tool-rail"
      >
        {tools.length === 0 ? (
          <p className="hud-chip px-3 py-1.5 font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-paper-manila/70">
            No tools on this bench
          </p>
        ) : (
          tools.map((toolId, index) => {
            const held = dive.heldTool === toolId;
            return (
              <button
                key={toolId}
                type="button"
                data-testid={`bench-tool-${toolId}`}
                aria-pressed={held}
                title={`${TOOL_TYPES[toolId].name} — ${
                  held ? "hang it back up" : "take it in hand"
                }`}
                onClick={() => dive.toggleTool(toolId)}
                data-sfx="ui-tab"
                className={`flex items-center gap-2 rounded-sm border px-2.5 py-1.5 ${
                  held
                    ? "border-gold bg-gold/20 text-paper-ivory"
                    : "border-workshop-edge bg-workshop-bg/85 text-paper-manila hover:bg-workshop-bg"
                }`}
              >
                <img
                  src={toolIconSrc(toolId)}
                  alt=""
                  aria-hidden
                  className="size-6"
                />
                <span className="font-condensed uppercase tracking-wider text-xs">
                  {TOOL_TYPES[toolId].name}
                </span>
                <Kbd>{index + 1}</Kbd>
              </button>
            );
          })
        )}
      </div>
    </HintSurfaceContext.Provider>
  );
};
