import React, { useEffect, useMemo, useRef, useState } from "react";
import { defaultParametersFor, Machine } from "../../../game/Machine";
import { stationWorkSpeed } from "../../../game/bench-mounting";
import { machineDustMultiplier } from "../../../game/Dust";
import {
  planReadiness,
  PlanReadiness,
} from "../../../game/bench-work/plan-readiness";
import {
  BenchPlan,
  PLAN_CATEGORIES,
  unlockedBenchPlans,
} from "../../../game/bench-work/plan-registry";
import { selectedBenchPlan } from "../../../game/bench-work/tool-work";
import { getOperationDuration } from "../../../game/skill-helpers";
import { formatDuration } from "../../../game/time";
import { classNames } from "../../../utils/classNames";
import {
  BLUEPRINT_BLUE,
  BLUEPRINT_BLUE_DEEP,
  BlueprintSchematic,
  BlueprintSheet,
  ReadinessStamp,
} from "../station/BlueprintStack";
import { MachineManualLink } from "../station/racks";
import {
  clearMachineOperation,
  setMachineOperation,
} from "../../../sim/commands/machine-commands";
import { MachineEntity } from "../../../sim/entities/MachineEntity";
import { useGame, useShopState } from "../../useShell";

/**
 * The plan drawer, spread out: every assembly build the player's skills
 * unlock, filed under manila category tabs, each drawing a thumbnail of
 * its own schematic with a READY/SHORT stamp. Clicking a drawing sets it
 * out for reading — full schematic, the bill of materials against the
 * shop's stock, the margin note — and pulling it selects the plan and
 * closes the drawer. Listing comes from the plan registry, not the
 * bench's mounted tools, so a build whose driver is in the drawers still
 * shows, wearing the missing tool as a shortfall.
 *
 * Ported to the engine shell: the same drawer, reading the shop
 * through the shell's projection and pulling a drawing through the
 * machine commands.
 *
 * Test contract (tests/machine-panel.ts): each plan's name carries
 * `data-mode-option` exactly once, and the focused drawing's pull button
 * is `data-testid="pull-plan"`.
 */
export const PlanBrowser: React.FC<{
  machine: Machine;
  bench: MachineEntity;
  onClose: () => void;
}> = ({ machine, bench, onClose }) => {
  const gameState = useShopState();
  const game = useGame();
  const working = machine.state.operationProgress.status === "inProgress";
  const selected = selectedBenchPlan(machine);

  const plans = useMemo(
    () => unlockedBenchPlans(gameState.progression),
    [gameState.progression],
  );
  const readinessById = useMemo(() => {
    const map = new Map<string, PlanReadiness>();
    for (const plan of plans) {
      map.set(plan.operation.id, planReadiness(gameState, machine, plan));
    }
    return map;
  }, [gameState, machine, plans]);

  const categories = PLAN_CATEGORIES.filter((category) =>
    plans.some((plan) => plan.category === category.id),
  );

  const [focusedId, setFocusedId] = useState<string | null>(
    selected?.id ?? plans[0]?.operation.id ?? null,
  );
  const focused =
    plans.find((plan) => plan.operation.id === focusedId) ?? plans[0] ?? null;

  const dustMultiplier = machineDustMultiplier(
    gameState.dust,
    machine,
    gameState.shopInfo.size,
  );
  const workSpeed = stationWorkSpeed(machine, gameState);

  const pull = (plan: BenchPlan) => {
    if (working) return;
    setMachineOperation(
      game,
      bench,
      plan.operation,
      defaultParametersFor(plan.operation),
    );
    onClose();
  };

  const putBack = () => {
    if (working) return;
    clearMachineOperation(game, bench);
  };

  // The drawer owns the keyboard while it's open: arrows walk the
  // drawings, Enter pulls, Esc closes. stopPropagation keeps Esc from
  // also backing out of the bench view underneath; Q is deliberately
  // let through — the same key that opened the drawer closes it
  // (BlueprintCorner's shortcut).
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef(new Map<string, HTMLButtonElement>());
  const groupRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  const moveFocus = (step: number) => {
    if (plans.length === 0) return;
    const index = plans.findIndex((plan) => plan.operation.id === focusedId);
    const next =
      plans[(index + step + plans.length) % plans.length] ?? plans[0];
    setFocusedId(next.operation.id);
    thumbRefs.current
      .get(next.operation.id)
      ?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        moveFocus(1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        moveFocus(-1);
        return;
      case "Enter":
        if (focused) {
          event.preventDefault();
          event.stopPropagation();
          pull(focused);
        }
        return;
    }
  };

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      data-testid="plan-browser"
      onKeyDown={onKeyDown}
      // Spread over the whole view, above the coach's column (z-36):
      // the drawer is the only thing being read while it is open.
      className="pointer-events-auto absolute inset-0 z-[45] flex flex-col bg-ink-black/90 outline-none"
      onClick={onClose}
    >
      <div
        className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col p-4 pt-16"
        onClick={(event) => event.stopPropagation()}
      >
        {/* The drawer's header rail */}
        <div className="flex items-baseline gap-3 pb-2">
          <h4 className="font-condensed text-lg font-bold uppercase tracking-wide text-paper-manila">
            Plans
          </h4>
          <span className="font-condensed uppercase tracking-[0.15em] text-[0.62rem] text-paper-manila/50">
            Pull a drawing to set it out on the bench
          </span>
          <span className="ml-auto flex items-center gap-3">
            <span className="rounded bg-paper-manila/90 px-1.5 py-0.5">
              <MachineManualLink machine={machine} />
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the plan drawer"
              className="rounded border border-paper-manila/40 px-2 py-0.5 text-sm text-paper-manila/80 hover:bg-paper-manila/10"
            >
              ✕
            </button>
          </span>
        </div>

        <div className="flex min-h-0 flex-1 gap-4">
          {/* Manila folder tabs, one per category with anything in it */}
          <nav className="flex w-36 shrink-0 flex-col gap-1 pt-1">
            {categories.map((category, index) => (
              <button
                key={category.id}
                type="button"
                onClick={() =>
                  groupRefs.current
                    .get(category.id)
                    ?.scrollIntoView({ block: "start", behavior: "smooth" })
                }
                className="rounded-r-sm rounded-tl-lg border border-b-2 border-black/30 bg-paper-manila px-2.5 py-1.5 text-left font-condensed text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-ink-black shadow hover:brightness-105"
                style={{
                  transform: `rotate(${index % 2 === 0 ? -0.6 : 0.5}deg)`,
                }}
              >
                {category.label}
                <span className="ml-1.5 tabular-nums text-ink-fade">
                  {plans.filter((plan) => plan.category === category.id).length}
                </span>
              </button>
            ))}
          </nav>

          {/* The drawings themselves, grouped under their dividers */}
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4 pr-1"
          >
            {categories.map((category) => (
              <div
                key={category.id}
                ref={(el) => {
                  if (el) groupRefs.current.set(category.id, el);
                }}
                className="scroll-mt-2"
              >
                <div className="mb-1.5 inline-block rounded-t border border-b-0 border-paper-manila/30 bg-paper-manila/15 px-3 py-0.5 font-condensed text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-paper-manila/80">
                  {category.label}
                </div>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
                  {plans
                    .filter((plan) => plan.category === category.id)
                    .map((plan, index) => {
                      const readiness = readinessById.get(plan.operation.id);
                      const isFocused =
                        focused?.operation.id === plan.operation.id;
                      const isSelected = selected?.id === plan.operation.id;
                      return (
                        <li key={plan.operation.id}>
                          <button
                            ref={(el) => {
                              if (el)
                                thumbRefs.current.set(plan.operation.id, el);
                            }}
                            type="button"
                            data-sfx="ui-page-turn"
                            data-testid="plan-thumb"
                            data-plan-id={plan.operation.id}
                            onClick={() => setFocusedId(plan.operation.id)}
                            onDoubleClick={() => pull(plan)}
                            className={classNames(
                              "relative block w-full rounded-[3px] border p-2 text-left shadow-md transition-transform",
                              isFocused
                                ? "border-white/80 shadow-lg"
                                : "border-white/30 hover:border-white/60",
                            )}
                            style={{
                              backgroundColor:
                                index % 2 === 0
                                  ? BLUEPRINT_BLUE
                                  : BLUEPRINT_BLUE_DEEP,
                              // Drawings tossed in a drawer, not printed
                              // in a catalog: each sits a hair crooked
                              transform: `rotate(${((index * 37) % 5) * 0.35 - 0.7}deg)`,
                            }}
                          >
                            {/* The sheet's inner margin frame */}
                            <span className="pointer-events-none absolute inset-1 border border-white/20" />
                            {/* Dog-eared corner */}
                            <span
                              aria-hidden
                              className="absolute right-0 top-0 h-3 w-3"
                              style={{
                                background:
                                  "linear-gradient(225deg, rgba(10,20,32,0.9) 50%, rgba(232,238,245,0.28) 50%)",
                              }}
                            />
                            {isSelected && (
                              <span className="absolute left-1.5 top-1.5 rounded-sm bg-paper-manila px-1 font-condensed text-[0.55rem] font-bold uppercase tracking-[0.15em] text-ink-black">
                                Out
                              </span>
                            )}
                            {/* Tall drawings letterbox inside the card
                                instead of spilling over their neighbors */}
                            <span className="pointer-events-none mx-auto flex h-20 items-center justify-center overflow-hidden [&_svg]:h-full [&_svg]:max-h-full [&_svg]:w-full">
                              <BlueprintSchematic blueprint={plan.blueprint} />
                            </span>
                            <span className="mt-1 flex items-baseline justify-between gap-1">
                              <span
                                data-mode-option
                                className="truncate font-condensed text-[0.7rem] font-semibold uppercase tracking-wide text-white"
                              >
                                {plan.operation.name}
                              </span>
                              <span className="shrink-0 font-condensed text-[0.6rem] tabular-nums text-white/60">
                                {formatDuration(
                                  getOperationDuration(
                                    plan.operation,
                                    gameState.progression,
                                    dustMultiplier,
                                    workSpeed,
                                  ),
                                )}
                              </span>
                            </span>
                            {readiness && (
                              <span className="absolute -right-1 bottom-6">
                                <ReadinessStamp ready={readiness.ready} />
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </div>

          {/* The drawing set out for reading. The supplies tray rides
              above the bench view in this corner, so take its live
              footprint the way the glue panel does. */}
          <div
            className="hidden w-80 shrink-0 flex-col gap-2 overflow-y-auto md:flex xl:w-96"
            style={{
              marginTop: "calc(var(--supplies-clearance, 0px) + 1rem)",
            }}
          >
            {focused && (
              <>
                <BlueprintSheet
                  operation={focused.operation}
                  machine={machine}
                  locked={working}
                  readiness={readinessById.get(focused.operation.id)}
                  note={focused.note}
                />
                {selected?.id === focused.operation.id ? (
                  <button
                    type="button"
                    data-testid="put-back-plan"
                    data-sfx="ui-page-turn"
                    disabled={working}
                    onClick={putBack}
                    className="rounded border border-paper-manila/50 px-3 py-1.5 font-condensed text-[0.72rem] font-semibold uppercase tracking-[0.15em] text-paper-manila hover:bg-paper-manila/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Put the drawing back
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="pull-plan"
                    data-sfx="ui-page-turn"
                    disabled={working}
                    onClick={() => pull(focused)}
                    className="rounded bg-paper-manila px-3 py-1.5 font-condensed text-[0.72rem] font-bold uppercase tracking-[0.15em] text-ink-black shadow hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Pull this drawing
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
