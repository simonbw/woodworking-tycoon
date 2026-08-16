import React from "react";
import { benchGroupWork } from "../../../game/bench-work/workpiece";
import { toolForOperation } from "../../../game/bench-work/tool-work";
import { TOOL_TYPES } from "../../../game/Tool";
import { BenchDive } from "../../scenes/bench/BenchDive";
import { openBenchGroup } from "../../scenes/bench/benchStage";
import { useGame, useShellVersion, useShopState } from "../../useShell";

/**
 * The line under the bench: what to do next, and the key hints for
 * doing it. The old scene wrote one sentence per state — the tool in
 * hand, the job running, what's lying on the top — and this is that
 * line for the gestures the dive has so far (prying, stroke work, the
 * saw); glue-ups and assembly add their own as they land.
 */
export const BenchStatusLine: React.FC = () => {
  const game = useGame();
  useShellVersion();
  const gameState = useShopState();
  const dive = game.entities.tryGetSingleton(BenchDive);
  const run = openBenchGroup(game);
  if (!dive || dive.openBenchKey === null || !run) return null;

  const work = benchGroupWork(
    run.group.members,
    run.opened,
    gameState.progression,
  );
  const script = work.script;
  const held = dive.heldTool;
  const heldName = held ? TOOL_TYPES[held].name.toLowerCase() : null;
  const pieces = run.group.members.flatMap((member) => [
    ...member.machine.inputMaterials,
    ...member.machine.outputMaterials,
  ]);

  // The tool a running job needs back in hand to carry on.
  const workTool =
    script && (script.kind === "stroke" || script.kind === "saw")
      ? toolForOperation(work.machine, script.operation)
      : null;
  const workActive = workTool != null && workTool === held;

  const instruction = (): string => {
    if (script?.kind === "curing") {
      return "In the clamps — the glue cures on its own. Work something else.";
    }
    if (script?.kind === "stroke" && script.started) {
      if (!workActive) {
        return `Take the ${workTool ? TOOL_TYPES[workTool].name.toLowerCase() : "tool"} down off the rail to finish the job.`;
      }
      const band = script.interaction.band ?? "face";
      if (band === "edge") {
        return "Run the plane along the edge until it cuts clean end to end.";
      }
      return script.operation.id.startsWith("handPlane")
        ? "Work the plane across the face until the whole board cuts clean."
        : "Rub the whole face down. The wood shows you where you've been.";
    }
    if (script?.kind === "saw" && script.started) {
      if (!workActive) {
        return `Take the ${workTool ? TOOL_TYPES[workTool].name.toLowerCase() : "saw"} down off the rail to finish the cut.`;
      }
      return "Saw along the line — long, even push and pull.";
    }
    if (script?.kind === "pry") {
      if (!held) return "Take the hammer down off the rail.";
      return "Press a nail to pry it loose.";
    }
    if (held) {
      return `Move the ${heldName} over a piece it can work.`;
    }
    if (pieces.length > 0) {
      return "Take a tool down off the rail to work a piece.";
    }
    return "The bench is clear. Set stock down on it with F.";
  };

  const hints: Array<[string, string]> = held
    ? [
        script?.kind === "pry"
          ? ["Click", "pry a nail"]
          : ["Drag", script?.kind === "saw" ? "saw the line" : "work a piece"],
        ...(sawsWithoutACut(held, script)
          ? ([["R", "swing the angle"]] as Array<[string, string]>)
          : []),
        ["Esc", `hang the ${heldName} up`],
        ["Tab", "step back"],
      ]
    : [["Tab", "step back"]];

  const progressLine =
    script?.kind === "pry" ? `${script.pallet.nails.length} nails left` : null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex flex-col items-center gap-2"
      data-testid="bench-status"
    >
      <div className="flex items-baseline gap-3 rounded bg-ink-black/70 px-3 py-1.5 shadow-lg">
        <p className="font-condensed uppercase tracking-[0.15em] text-[0.7rem] text-paper-manila">
          {instruction()}
        </p>
        {progressLine && (
          <span className="shrink-0 whitespace-nowrap font-condensed text-[0.7rem] text-paper-manila/70 tabular-nums">
            {progressLine}
          </span>
        )}
      </div>
      <div className="flex gap-2" data-testid="bench-key-hints">
        {hints.map(([key, label]) => (
          <span
            key={`${key}-${label}`}
            className="flex items-baseline gap-1.5 rounded bg-ink-black/60 px-2 py-1 font-condensed uppercase tracking-[0.12em] text-[0.62rem] text-paper-manila/70"
          >
            <kbd className="rounded border border-paper-manila/35 px-1 font-sans text-[0.6rem] normal-case text-paper-manila">
              {key}
            </kbd>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};

/** Whether R would swing the miter box right now: a saw in hand with no
 * cut marked yet (the stop locks once the line is on the board). */
function sawsWithoutACut(
  held: keyof typeof TOOL_TYPES,
  script: { kind: string; started?: boolean } | null,
): boolean {
  const saws = TOOL_TYPES[held].operations.some(
    (operation) => operation.interaction?.kind === "saw",
  );
  return saws && !(script?.kind === "saw" && script.started);
}
