import React from "react";
import { benchGroupWork } from "../../../game/bench-work/workpiece";
import { benchPlacementFor } from "../../../game/bench-work/bench-layout";
import { faceNails } from "../../../game/bench-work/pallet-geometry";
import { toolForOperation } from "../../../game/bench-work/tool-work";
import { Machine } from "../../../game/Machine";
import { Pallet } from "../../../game/Materials";
import { TOOL_TYPES } from "../../../game/Tool";
import { BenchDive } from "../../scenes/bench/BenchDive";
import { BenchAssemblyView } from "../../scenes/bench/BenchAssemblyView";
import { BenchGlueView } from "../../scenes/bench/BenchGlueView";
import { openBenchGroup } from "../../scenes/bench/benchStage";
import { useGame, useShellVersion, useShopState } from "../../useShell";
import { useBenchChrome } from "./useBenchDive";

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
  const chrome = useBenchChrome();
  const dive = game.entities.tryGetSingleton(BenchDive);
  const glue = game.entities.tryGetSingleton(BenchGlueView);
  const assembly = game.entities.tryGetSingleton(BenchAssemblyView);
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
  const finished = run.group.members.flatMap(
    (member) => member.machine.outputMaterials,
  );

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
      if (script.pallet.nails.length > 0 && faceIsClear(run.opened, script)) {
        return "The rest are nailed from the other side. Press F to flip the pallet.";
      }
      return "Press a nail to pry it loose.";
    }
    // A drawing out on the bench walks itself too: stock down, each
    // piece on its outline, a fastener at every lit crossing.
    const buildLine = assemblyInstruction(assembly, pieces.length);
    if (buildLine) return buildLine;
    // The clamps-first glue-up walks itself: clamps out, stock across
    // them, glue down the seams, tighten. Each line names the next move.
    const glueLine = glueInstruction(dive, glue);
    if (glueLine) return glueLine;
    if (held) {
      return `Move the ${heldName} over a piece it can work.`;
    }
    if (finished.length > 0) {
      return "Finished work on the bench. Press E over a piece to take it.";
    }
    if (pieces.length > 0) {
      return "Loose stock on the bench. Drag to arrange it.";
    }
    return "The bench is clear. Set stock down on it with F.";
  };

  const hints: Array<[string, string]> = dive.holdingClamp
    ? [
        ["Click", "lay the clamp down"],
        ["Esc", "put the clamp back"],
        ["Tab", "step back"],
      ]
    : dive.holdingGlue
      ? [
          ["Drag", "spread glue on a seam"],
          ["Esc", "put the glue away"],
          ["Tab", "step back"],
        ]
      : held
        ? [
            script?.kind === "pry"
              ? ["Click", "pry a nail"]
              : [
                  "Drag",
                  script?.kind === "saw" ? "saw the line" : "work a piece",
                ],
            ...(sawsWithoutACut(held, script)
              ? ([["R", "swing the angle"]] as Array<[string, string]>)
              : []),
            ...(script?.kind === "pry"
              ? ([["F", "flip the pallet"]] as Array<[string, string]>)
              : []),
            ["Esc", `hang the ${heldName} up`],
            ["Tab", "step back"],
          ]
        : [
            ...(pieces.length > 0
              ? ([
                  ["Drag", "move a piece"],
                  ["R", "turn"],
                  ["F", "tip it up"],
                  ["E", "take it"],
                ] as Array<[string, string]>)
              : []),
            ["Tab", "step back"],
          ];

  const build = assembly?.assemblyProgress() ?? null;
  const progressLine =
    script?.kind === "pry"
      ? `${script.pallet.nails.length} nails left`
      : build
        ? `${build.seated}/${build.slots} placed · ${build.driven}/${build.fasteners} ${
            build.fastenerId === "screws" ? "screwed" : "nailed"
          }`
        : null;

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-5 z-30 flex flex-col items-center gap-2 ${chrome.className}`}
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

/**
 * The build's line while a drawing is out: what to lay on next, and
 * once everything is seated, what to drive it with.
 */
function assemblyInstruction(
  assembly: BenchAssemblyView | undefined,
  piecesOnBench: number,
): string | null {
  const build = assembly?.assemblyProgress();
  if (!build) return null;
  if (build.seated >= build.slots) {
    if (!build.driverHeld) {
      const driver = build.driver ? TOOL_TYPES[build.driver].name : "driver";
      return `All laid out. Take the ${driver.toLowerCase()} down off the rail.`;
    }
    return build.fastenerId === "screws"
      ? "Drive a screw at each lit crossing."
      : "Nail each lit crossing.";
  }
  if (piecesOnBench < build.slots) {
    return "Set the plan's stock down on the bench (F), then lay each piece on its outline.";
  }
  if (build.tipUp) {
    return build.tipUp.onEnd
      ? `Stand each ${build.tipUp.role} on its end (F cycles), then set it on its small outline.`
      : `Flip each ${build.tipUp.role} up on its long edge (F), then lay it on its thin outline.`;
  }
  return "Lay each piece on its ghost outline — drag it close and it settles. R turns it.";
}

/**
 * The clamps-first glue-up's line, or null when nothing about one
 * applies: bars out, stock across them, a bead down each seam, tighten.
 */
function glueInstruction(
  dive: BenchDive,
  glue: BenchGlueView | undefined,
): string | null {
  if (!glue) return null;
  const progress = glue.glueProgress();
  if (progress) {
    if (progress.clamps < progress.needed) {
      return dive.holdingClamp
        ? `Lay the bar across the boards (${progress.clamps}/${progress.needed} set).`
        : `The run wants ${progress.needed} clamps — one per foot of length (${progress.clamps}/${progress.needed} set).`;
    }
    if (progress.seamsGlued < progress.seams) {
      return dive.holdingGlue
        ? `Run the bead down each open seam (${progress.seamsGlued}/${progress.seams}).`
        : "Take the glue and run a bead down each seam.";
    }
    return `Tighten each clamp — the last one starts the cure (${progress.tightened}/${progress.clamps}).`;
  }
  const refusal = glue.glueRefusal();
  if (refusal) return refusal;
  if (dive.holdingClamp) return "Lay the bar down where the glue-up will sit.";
  if (glue.clampsSetOut() > 0) {
    return "Clamps are set. Lay glue-ready stock across them, edge to edge.";
  }
  return null;
}

/** Whether every nail left is on the underside — the flip is the only
 * move the hammer has from here. */
function faceIsClear(
  opened: Machine,
  script: { kind: "pry"; pallet: Pallet },
): boolean {
  const placement = benchPlacementFor(opened, script.pallet);
  return faceNails(script.pallet, placement.flipped).length === 0;
}

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
