import React, { useState } from "react";
import {
  defaultParametersFor,
  Machine,
  Operation,
  operationParameters,
} from "../../game/Machine";
import { machineDustMultiplier } from "../../game/Dust";
import { MACHINE_ARTICLES } from "../../game/manual";
import { setMachineOperationAction } from "../../game/game-actions/player-actions";
import { parameterValueSatisfiable } from "../../game/machine-helpers";
import {
  availableOperations,
  getOperationDuration,
} from "../../game/skill-helpers";
import { formatDuration } from "../../game/time";
import { classNames } from "../../utils/classNames";
import {
  BLUEPRINT_BLUE,
  BLUEPRINT_BLUE_DEEP,
  BlueprintSheet,
} from "../station/BlueprintStack";
import { MachineManualLink } from "../station/racks";
import { ParameterScaleRow } from "../station/ParameterScaleRow";
import { loadedStockDimension } from "../station/station-helpers";
import { ShortcutKeys } from "../shortcuts/Kbd";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The bench's plans, as the thing they diegetically are: a pile of shop
 * drawings sitting in the corner of the bench view. Folded, it's just
 * the pile (and the name of whatever drawing is set out); unfolded, the
 * pulled sheet lies on top — blueprint blue, white line work, a title
 * block reading supplies against the shop's stock — with the rest of
 * the stack showing as sheet edges below it. Pulling a sheet IS
 * selecting the plan; its ghost outlines land on the bench top. There
 * is no input/output diagram and no separate paperwork card: a bench
 * top holds stock, not bays.
 *
 * Every sheet edge carries `data-mode-option`, exactly once per
 * operation name, and the fold toggle carries `aria-expanded`, so the
 * spec helpers that drive plan selection (tests/machine-panel.ts) work
 * here unchanged.
 */
export const BlueprintCorner: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const { isTargeted } = useTargetedMachine();
  const [open, setOpen] = useState(false);

  // Tool work isn't a plan: a staged pallet offers its nails, a held
  // tool offers its strokes and cuts, all on the bench top itself
  // (bench-work/tool-work.ts), and glue-ups are clamps-first — the run
  // lying in the clamps decides the composition (bench-work/glue-up.ts).
  // So the pile lists only assembly builds, and never honors a stale
  // selection of the plan-free kinds (old saves may carry one).
  const toolWorkKinds = ["pry", "stroke", "saw", "glue"];
  const operations = availableOperations(machine, gameState.progression).filter(
    (op) => !toolWorkKinds.includes(op.interaction?.kind ?? ""),
  );
  const rawSelection = machine.selectedOperationOrNull;
  const selected =
    rawSelection && toolWorkKinds.includes(rawSelection.interaction?.kind ?? "")
      ? null
      : rawSelection;
  // A running job resolves against the plan and settings it finds when
  // it finishes, so both hold still until the work comes off.
  const working = machine.operationProgress.status === "inProgress";
  const dustMultiplier = machineDustMultiplier(
    gameState.dust,
    machine,
    gameState.shopInfo.size,
  );

  if (operations.length === 0) {
    return null;
  }

  const params = selected ? operationParameters(selected) : [];
  // The manual pointer only earns its paper chip once the article exists
  // and has been unlocked (ManualLink itself renders nothing otherwise)
  const article = MACHINE_ARTICLES[machine.state.machineTypeId];
  const manualUnlocked =
    article != null && gameState.progression.unlockedArticles.includes(article);

  return (
    <div className="pointer-events-auto absolute bottom-5 right-4 z-10 flex w-80 max-w-[85vw] flex-col items-stretch gap-1.5">
      {open && (
        <div className="max-h-[62vh] space-y-1.5 overflow-y-auto rounded-sm bg-ink-black/75 p-1.5 shadow-xl">
          {selected ? (
            <BlueprintSheet
              operation={selected}
              machine={machine}
              locked={working}
            />
          ) : (
            <div
              className="rounded-sm border-2 border-dashed px-3 py-4 text-center font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-white/60"
              style={{ borderColor: "rgba(232,238,245,0.35)" }}
            >
              Pull a drawing from the stack
            </div>
          )}

          {/* Settings ride the pulled drawing on a paper strip — the one
              piece of the old card a drawing can't carry in its margins */}
          {selected && params.length > 0 && (
            <div className="paper-card space-y-2 !p-2">
              {params.map((param, index) => (
                <ParameterScaleRow
                  key={param.id}
                  param={param}
                  value={
                    machine.selectedParameters?.[param.id] ??
                    param.defaultValue ??
                    param.values[0]
                  }
                  showShortcut={index === 0 && isTargeted(machine)}
                  locked={working}
                  onSelect={(value) =>
                    applyAction(
                      setMachineOperationAction(machine, selected, {
                        ...machine.selectedParameters,
                        [param.id]: value,
                      }),
                    )
                  }
                  satisfiable={(value) =>
                    parameterValueSatisfiable(
                      machine,
                      selected,
                      param.id,
                      value,
                    )
                  }
                  stockValue={loadedStockDimension(machine, param.id)}
                />
              ))}
            </div>
          )}

          {/* The rest of the stack: sheet edges sticking out under the
              pulled drawing, one per plan, thumbed through by clicking */}
          <ul
            className="rounded-b-sm shadow-inner"
            data-testid="blueprint-stack"
          >
            {operations.map((operation, index) => {
              const isSelected = operation === selected;
              return (
                <li key={operation.id}>
                  <button
                    disabled={working}
                    data-sfx="ui-page-turn"
                    onClick={() =>
                      applyAction(
                        setMachineOperationAction(
                          machine,
                          operation,
                          defaultParametersFor(operation),
                        ),
                      )
                    }
                    className={classNames(
                      "flex w-full items-baseline justify-between gap-2 border-b px-2 py-0.5 text-left",
                      "border-[#0f2c47]/60",
                      isSelected
                        ? "text-white"
                        : "text-[#bcd0e2] hover:text-white hover:brightness-110",
                      working && "cursor-not-allowed opacity-70",
                    )}
                    style={{
                      // Sheets deeper in the pile read a shade darker
                      backgroundColor:
                        index % 2 === 0 ? BLUEPRINT_BLUE : BLUEPRINT_BLUE_DEEP,
                    }}
                  >
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      {isSelected && (
                        <span aria-hidden className="shrink-0 text-[0.6rem]">
                          ▸
                        </span>
                      )}
                      <span
                        data-mode-option
                        className={classNames(
                          "truncate font-condensed",
                          isSelected && "font-semibold",
                        )}
                      >
                        {operation.name}
                      </span>
                    </span>
                    <span className="shrink-0 font-condensed text-[0.62rem] tabular-nums opacity-70">
                      {formatDuration(
                        getOperationDuration(
                          operation,
                          gameState.progression,
                          dustMultiplier,
                          machine.workSpeed,
                        ),
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {manualUnlocked && (
            <div className="flex justify-end px-1 pb-0.5">
              <span className="rounded bg-paper-manila/90 px-1.5 py-0.5">
                <MachineManualLink machine={machine} />
              </span>
            </div>
          )}
        </div>
      )}

      {/* The pile itself: fold and unfold the corner */}
      <button
        type="button"
        aria-expanded={open}
        data-testid="blueprint-corner"
        onClick={() => setOpen((current) => !current)}
        className="group ml-auto flex items-center gap-2.5 rounded bg-ink-black/70 px-2.5 py-1.5 shadow-lg hover:bg-ink-black/80"
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
            {isTargeted(machine) && !working && operations.length > 1 && (
              <ShortcutKeys shortcut="cycle-operation" />
            )}
          </span>
          <span className="max-w-44 truncate font-condensed uppercase tracking-wide text-[0.72rem] text-paper-manila">
            {selected ? selected.name : "Pull a drawing"}
          </span>
        </span>
      </button>
    </div>
  );
};
