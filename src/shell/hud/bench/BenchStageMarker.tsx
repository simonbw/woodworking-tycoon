import React from "react";
import { useGame, useShellVersion } from "../../useShell";
import { BenchArrangeView } from "../../scenes/bench/BenchArrangeView";
import { BenchAssemblyView } from "../../scenes/bench/BenchAssemblyView";
import { BenchDive } from "../../scenes/bench/BenchDive";
import { BenchGlueView } from "../../scenes/bench/BenchGlueView";
import { BenchPryView } from "../../scenes/bench/BenchPryView";
import { BenchSawView } from "../../scenes/bench/BenchSawView";
import { BenchStrokeView } from "../../scenes/bench/BenchStrokeView";
import { benchStage, benchWork } from "../../scenes/bench/benchStage";
import { BlueprintSlot } from "../../../game/bench-work/blueprint";
import { describeMaterialRequirement } from "../../../game/material-helpers";

/**
 * What the bench is doing, written onto the page. Nothing here is drawn
 * — the surface is on the canvas — but the work happens in world pixels,
 * and a spec driving the pointer needs to know where an inch of bench
 * lands on screen and what the run made of the last gesture. The old
 * scene published the same names off its own DOM stage; this is that
 * seam, kept as one element so the mapping lives in one place.
 *
 * Read it as: `bench-work` says what job is on (and how far along),
 * `bench-stage` says where the run sits and what each gesture is
 * holding.
 */
export const BenchStageMarker: React.FC = () => {
  const game = useGame();
  useShellVersion();
  const dive = game.entities.tryGetSingleton(BenchDive);
  const stage = benchStage(game);
  if (!dive || dive.openBenchKey === null || !stage) return null;

  const work = benchWork(game);
  const stroke = game.entities.tryGetSingleton(BenchStrokeView);
  const saw = game.entities.tryGetSingleton(BenchSawView);
  const glue = game.entities.tryGetSingleton(BenchGlueView);
  const assembly = game.entities.tryGetSingleton(BenchAssemblyView);
  const arrange = game.entities.tryGetSingleton(BenchArrangeView);
  const pry = game.entities.tryGetSingleton(BenchPryView);

  const glueRun = glue?.glueProgress() ?? null;
  const build = assembly?.assemblyProgress() ?? null;
  const palletCorner = pry?.palletCorner() ?? null;
  const productCorner = assembly?.productCorner() ?? null;

  // What kind of job the run is on. A running operation names itself;
  // otherwise it's whatever the bench is set up for — a drawing out, a
  // run in the clamps, a pallet staged — and idle when it's just wood
  // lying on a top.
  const script =
    work?.script.kind ??
    (build ? "assembly" : glueRun ? "glue" : palletCorner ? "pry" : "idle");

  // One number for "how far along", whichever gesture is running.
  const progress =
    stroke?.strokeProgress() ??
    saw?.kerfProgress() ??
    (build && build.fasteners > 0 ? build.driven / build.fasteners : null);

  const inches = (value: number) => value.toFixed(2);

  return (
    <div
      className="pointer-events-none fixed inset-0"
      data-testid="bench-work"
      data-script={script}
      data-progress={progress === null ? undefined : progress.toFixed(3)}
      data-zoom={
        dive.closingKey !== null ? "out" : dive.settled() ? "open" : "in"
      }
    >
      <div
        // Nothing here may catch the pointer: the hand belongs to the
        // work surface on the canvas underneath.
        className="pointer-events-none absolute inset-0"
        data-testid="bench-stage"
        data-px-per-in={stage.fit.pxPerIn.toFixed(4)}
        data-origin-x={stage.fit.originX.toFixed(2)}
        data-origin-y={stage.fit.originY.toFixed(2)}
        data-pallet-x={palletCorner ? inches(palletCorner.xIn) : undefined}
        data-pallet-y={palletCorner ? inches(palletCorner.yIn) : undefined}
        data-product-x={productCorner ? inches(productCorner.xIn) : undefined}
        data-product-y={productCorner ? inches(productCorner.yIn) : undefined}
        data-seated={build ? build.seated : undefined}
        data-driven={build ? build.driven : undefined}
        data-hovered={arrange?.handPieceId() ?? ""}
        data-work-hover={stroke?.hoveredOperationId() ?? ""}
        data-glue-run={glueRun ? glueRun.pieces : undefined}
        data-glue-op={glueRun ? glueRun.operationId : undefined}
        data-glue-seams={
          glueRun ? `${glueRun.seamsGlued}/${glueRun.seams}` : undefined
        }
        data-glue-clamps={
          glueRun ? `${glueRun.clamps}/${glueRun.needed}` : undefined
        }
        data-clamps-placed={glue?.clampsSetOut()}
      />
      <SlotTag slot={assembly?.hoveredSlot() ?? null} />
    </div>
  );
};

/**
 * The tag beside the cursor over an empty outline: what stock the
 * drawing wants there, and whether it goes in standing up. Read before
 * anything is picked up, which is the point — the outline alone doesn't
 * say what fills it.
 */
const SlotTag: React.FC<{ slot: BlueprintSlot | null }> = ({ slot }) => {
  const game = useGame();
  if (!slot) return null;
  const [x, y] = game.io.mousePosition;
  return (
    <div
      data-testid="slot-tip"
      className="pointer-events-none absolute left-0 top-0 z-10"
      style={{ transform: `translate(${x + 14}px, ${y + 16}px)` }}
    >
      <div className="whitespace-nowrap rounded bg-ink-black/80 px-2 py-1 font-condensed uppercase tracking-[0.12em] text-[0.62rem] text-paper-manila shadow-lg">
        <span className="font-semibold">{slot.role}</span>
        {" — "}
        {describeMaterialRequirement(slot.requirement)}
        {slot.onEdge && (
          <span className="text-gold-light"> · stood on edge (F)</span>
        )}
        {slot.onEnd && (
          <span className="text-gold-light"> · stood on end (F)</span>
        )}
      </div>
    </div>
  );
};
