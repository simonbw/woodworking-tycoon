import React, { useState } from "react";
import { ShortcutKeys } from "../../../components/shortcuts/Kbd";
import { useShortcut } from "../../../components/shortcuts/ShortcutProvider";
import { unlockedBenchPlans } from "../../../game/bench-work/plan-registry";
import { selectedBenchPlan } from "../../../game/bench-work/tool-work";
import { operationParameters } from "../../../game/Machine";
import { parameterValueSatisfiable } from "../../../game/machine-helpers";
import { clearMachineOperation } from "../../../sim/commands/machine-commands";
import { setMachineOperation } from "../../../sim/commands/machine-commands";
import { BenchDive } from "../../scenes/bench/BenchDive";
import { useGame, useShellVersion, useShopState } from "../../useShell";
import { BLUEPRINT_BLUE, BLUEPRINT_BLUE_DEEP } from "../station/BlueprintStack";
import { ParameterScaleRow } from "../../../components/station/ParameterScaleRow";
import { loadedStockDimension } from "../../../components/station/station-helpers";
import { PlanBrowser } from "./PlanBrowser";

/**
 * The bench's plans, as the thing they diegetically are: a pile of shop
 * drawings sitting in the corner of the bench view. The pile itself is a
 * small chip naming whatever drawing is set out (with a put-back button
 * to return it — the ghost outlines leave the bench with it); clicking
 * the pile, or Q, spreads the whole drawer across the view
 * (PlanBrowser), where drawings are filed under category tabs and pulled
 * by name. Pulling a sheet IS selecting the plan; its outlines land on
 * the bench top.
 *
 * Tool work isn't a plan: a staged pallet offers its nails, a held tool
 * offers its strokes and cuts, and glue-ups are clamps-first. The drawer
 * holds only assembly builds.
 */
export const BenchPlanCorner: React.FC = () => {
  const game = useGame();
  useShellVersion();
  const gameState = useShopState();
  const [open, setOpen] = useState(false);
  const dive = game.entities.tryGetSingleton(BenchDive);
  const bench = dive?.openBench();

  const plans = unlockedBenchPlans(gameState.progression);
  // Q opens and closes the drawer — the drawer's open state lives here,
  // so the key does too (registered only while the dive is up).
  useShortcut(
    "open-plan-browser",
    () => setOpen((current) => !current),
    bench != null && plans.length > 0,
  );

  if (!dive || !bench || plans.length === 0) return null;

  const machine = bench.view();
  const selected = selectedBenchPlan(machine);
  // A running job resolves against the plan and settings it finds when
  // it finishes, so both hold still until the work comes off.
  const working = machine.state.operationProgress.status === "inProgress";
  const params = selected ? operationParameters(selected) : [];

  return (
    <>
      {open && (
        <PlanBrowser
          machine={machine}
          bench={bench}
          onClose={() => setOpen(false)}
        />
      )}

      <div className="pointer-events-auto absolute bottom-5 right-4 z-40 flex w-80 max-w-[85vw] flex-col items-stretch gap-1.5">
        {/* Settings ride the pulled drawing on a paper strip — the one
            piece of the plan a chip can't carry in its margins */}
        {selected && params.length > 0 && (
          <div className="paper-card space-y-2 !p-2">
            {params.map((param, index) => (
              <ParameterScaleRow
                key={param.id}
                param={param}
                value={
                  machine.state.selectedParameters?.[param.id] ??
                  param.defaultValue ??
                  param.values[0]
                }
                showShortcut={index === 0}
                locked={working}
                onSelect={(value: number | string) =>
                  setMachineOperation(game, bench, selected, {
                    ...machine.state.selectedParameters,
                    [param.id]: value,
                  })
                }
                satisfiable={(value: number | string) =>
                  parameterValueSatisfiable(machine, selected, param.id, value)
                }
                stockValue={loadedStockDimension(machine, param.id)}
              />
            ))}
          </div>
        )}

        {/* The pile itself: click (or Q) to spread the drawer open */}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            aria-expanded={open}
            data-testid="blueprint-corner"
            onClick={() => setOpen((current) => !current)}
            className="group flex items-center gap-2.5 rounded bg-ink-black/70 px-2.5 py-1.5 shadow-lg hover:bg-ink-black/80"
          >
            <span aria-hidden className="relative block h-9 w-12">
              {[
                { rotate: -6, dx: -2, dy: 1, deep: true },
                { rotate: 3, dx: 2, dy: 0, deep: false },
                { rotate: -1, dx: 0, dy: -1, deep: false },
              ].map((sheet, index) => (
                <span
                  key={index}
                  className="absolute inset-0 rounded-[2px] border border-white/35 shadow"
                  style={{
                    backgroundColor: sheet.deep
                      ? BLUEPRINT_BLUE_DEEP
                      : BLUEPRINT_BLUE,
                    transform: `translate(${sheet.dx}px, ${sheet.dy}px) rotate(${sheet.rotate}deg)`,
                  }}
                >
                  <span className="absolute inset-[3px] border border-white/25" />
                </span>
              ))}
            </span>
            <span className="flex flex-col items-start">
              <span className="flex items-center gap-1.5 font-condensed uppercase tracking-[0.15em] text-[0.6rem] text-paper-manila/60">
                Plans
                <ShortcutKeys shortcut="open-plan-browser" />
              </span>
              <span className="max-w-44 truncate font-condensed uppercase tracking-wide text-[0.72rem] text-paper-manila">
                {selected ? selected.name : "Pull a drawing"}
              </span>
            </span>
          </button>
          {selected && (
            <button
              type="button"
              data-testid="put-back-plan-chip"
              data-sfx="ui-page-turn"
              disabled={working}
              onClick={() => clearMachineOperation(game, bench)}
              aria-label="Put the drawing back"
              title="Put the drawing back"
              className="rounded border border-paper-manila/40 bg-ink-black/70 px-1.5 py-1.5 text-xs leading-none text-paper-manila/80 shadow-lg hover:bg-ink-black/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </>
  );
};
