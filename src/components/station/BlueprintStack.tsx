import React, { useMemo } from "react";
import { stationWorkSpeed } from "../../game/bench-mounting";
import { clampsFor, clampsFree } from "../../game/Clamp";
import { consumableLabel } from "../../game/Consumable";
import {
  defaultParametersFor,
  Machine,
  Operation,
  InputMaterialWithQuantity,
} from "../../game/Machine";
import { machineDustMultiplier } from "../../game/Dust";
import {
  productBlueprintFor,
  ProductBlueprint,
  slotFootprintIn,
} from "../../game/bench-work/blueprint";
import { rowLayout } from "../../game/bench-work/workpiece";
import { createMockMaterial } from "../../game/material-helpers";
import { describeOperationIO } from "../../game/operation-helpers";
import { getOperationDuration } from "../../game/skill-helpers";
import { formatDuration } from "../../game/time";
import { useGameState } from "../useGameState";

/**
 * One shop drawing, pulled from the bench's blueprint pile (see
 * BlueprintCorner in bench-view): blueprint blue, white line work, a
 * double margin frame, and a title block quoting the plan's cutting
 * list, time, and supplies against what the shop actually has on hand —
 * the drawing is the whole readout, there is no separate supplies row.
 * Blueprint recipes draw their real part layout (the same slots the
 * bench view's ghosts stand at); everything else gets a schematic of its
 * ingredients.
 */

export const BLUEPRINT_BLUE = "#1d4a73";
export const BLUEPRINT_BLUE_DEEP = "#173c5f";
const LINE = "#e8eef5";
/** Warm callout that stays legible on blueprint blue. */
const SHORTFALL = "#ffab6b";

/** The pulled drawing: schematic, margin frame, and title block. */
export const BlueprintSheet: React.FC<{
  operation: Operation;
  machine: Machine;
  locked?: boolean;
}> = ({ operation, machine, locked }) => {
  const gameState = useGameState();
  const io = useMemo(() => describeOperationIO(operation), [operation]);
  const blueprint =
    operation.interaction?.kind === "assembly"
      ? productBlueprintFor(operation.interaction.blueprint)
      : null;
  const dustMultiplier = machineDustMultiplier(
    gameState.dust,
    machine,
    gameState.shopInfo.size,
  );
  const freeClamps = clampsFree(gameState.clamps, gameState.machines);
  const clampsNeeded = clampsFor(operation);

  return (
    <figure
      data-testid="blueprint-sheet"
      className="relative overflow-hidden rounded-sm shadow-md"
      style={{ backgroundColor: BLUEPRINT_BLUE }}
    >
      {/* The drawing's margin frame */}
      <div className="pointer-events-none absolute inset-1 border border-white/35" />
      <div className="pointer-events-none absolute inset-[7px] border border-white/20" />

      <div className="px-4 pb-3 pt-3">
        {blueprint ? (
          <BlueprintSchematic blueprint={blueprint} />
        ) : (
          <IngredientSchematic operation={operation} />
        )}

        {/* Title block, the way real drawings carry one */}
        <div className="mt-2 border border-white/40 bg-black/10">
          <div className="flex items-baseline justify-between gap-2 border-b border-white/25 px-2 py-0.5">
            <figcaption className="truncate font-stencil text-[0.8rem] uppercase tracking-wide text-white">
              {operation.name}
            </figcaption>
            <span className="shrink-0 font-condensed text-[0.6rem] uppercase tracking-[0.15em] text-white/70">
              {locked ? "In progress" : "Shop drawing"}
            </span>
          </div>
          <div className="space-y-0.5 px-2 py-1 font-condensed text-[0.62rem] leading-snug text-white/85">
            <div>
              {io.inputs.join(" + ")}
              {io.outputs.length > 0 && ` → ${io.outputs.join(" + ")}`}
            </div>
            <div className="flex flex-wrap gap-x-3 text-white/65">
              <span className="tabular-nums">
                {formatDuration(
                  getOperationDuration(
                    operation,
                    gameState.progression,
                    dustMultiplier,
                    stationWorkSpeed(machine, gameState),
                  ),
                )}
              </span>
              {/* Supplies read against the shop's stock right on the
                  drawing — a shortfall warms up instead of a separate row */}
              {(operation.requiredConsumables ?? []).map((cost) => {
                const stocked = gameState.consumables[cost.id] ?? 0;
                const enough = stocked >= cost.amount;
                return (
                  <span
                    key={cost.id}
                    className="tabular-nums"
                    style={enough ? undefined : { color: SHORTFALL }}
                  >
                    {consumableLabel(cost)} (have {stocked})
                  </span>
                );
              })}
              {clampsNeeded > 0 && (
                <span
                  className="tabular-nums"
                  style={
                    clampsNeeded <= freeClamps
                      ? undefined
                      : { color: SHORTFALL }
                  }
                >
                  {clampsNeeded} clamps (
                  {freeClamps === gameState.clamps
                    ? `have ${gameState.clamps}`
                    : `${freeClamps} of ${gameState.clamps} free`}
                  , returned)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
};

/** The real part layout, straight off the product blueprint: the same
 * slots the bench view's ghost outlines stand at, fasteners marked the
 * way a drawing calls out its nails. */
const BlueprintSchematic: React.FC<{ blueprint: ProductBlueprint }> = ({
  blueprint,
}) => {
  const pad = 3;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${blueprint.widthIn + pad * 2} ${blueprint.heightIn + pad * 2}`}
      className="mx-auto max-h-36 w-full"
      role="img"
    >
      {[...blueprint.slots]
        .sort((a, b) => a.layer - b.layer)
        .map((slot) => {
          // An on-edge part draws as the thin strip it presents from
          // above — the drawing shows the build the way the bench does
          const { wIn: w, hIn: h } = slotFootprintIn(slot);
          return (
            <rect
              key={slot.id}
              x={slot.xIn - w / 2}
              y={slot.yIn - h / 2}
              width={w}
              height={h}
              transform={`rotate(${slot.angleDeg} ${slot.xIn} ${slot.yIn})`}
              fill={slot.layer === 0 ? "rgba(232,238,245,0.08)" : "none"}
              stroke={LINE}
              strokeWidth={0.5}
            />
          );
        })}
      {blueprint.fasteners.map((fastener, index) => (
        <g key={index} stroke={LINE} strokeWidth={0.4}>
          <circle cx={fastener.xIn} cy={fastener.yIn} r={1.4} fill="none" />
          <line
            x1={fastener.xIn - 1}
            y1={fastener.yIn - 1}
            x2={fastener.xIn + 1}
            y2={fastener.yIn + 1}
          />
          <line
            x1={fastener.xIn - 1}
            y1={fastener.yIn + 1}
            x2={fastener.xIn + 1}
            y2={fastener.yIn - 1}
          />
        </g>
      ))}
    </svg>
  );
};

/** For plans without a product blueprint: the ingredients, drawn to
 * scale in a row — a cutting list rather than an exploded view. */
const IngredientSchematic: React.FC<{ operation: Operation }> = ({
  operation,
}) => {
  const layout = useMemo(() => {
    const requirements = operation.getInputMaterials(
      defaultParametersFor(operation),
    );
    const mocks = requirements.flatMap(
      (requirement: InputMaterialWithQuantity) =>
        Array.from({ length: Math.min(requirement.quantity, 6) }, () =>
          createMockMaterial(requirement),
        ),
    );
    return rowLayout(mocks, 3);
  }, [operation]);

  const pad = 3;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${layout.size.widthIn + pad * 2} ${layout.size.heightIn + pad * 2}`}
      className="mx-auto max-h-36 w-full"
      role="img"
    >
      {layout.slots.map((slot, index) => (
        <rect
          key={index}
          x={slot.xIn}
          y={(layout.size.heightIn - slot.heightIn) / 2}
          width={slot.widthIn}
          height={slot.heightIn}
          fill="rgba(232,238,245,0.06)"
          stroke={LINE}
          strokeWidth={Math.max(layout.size.widthIn / 180, 0.4)}
        />
      ))}
    </svg>
  );
};
