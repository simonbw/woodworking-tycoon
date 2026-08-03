import React, { useMemo } from "react";
import { clampsFor } from "../../game/Clamp";
import { consumableLabel } from "../../game/Consumable";
import { ProgressionState } from "../../game/GameState";
import {
  defaultParametersFor,
  Operation,
  InputMaterialWithQuantity,
} from "../../game/Machine";
import {
  productBlueprintFor,
  ProductBlueprint,
} from "../../game/bench-work/blueprint";
import { rowLayout } from "../../game/bench-work/workpiece";
import { createMockMaterial } from "../../game/material-helpers";
import { describeOperationIO } from "../../game/operation-helpers";
import { getOperationDuration } from "../../game/skill-helpers";
import { formatDuration } from "../../game/time";
import { INCHES_PER_FOOT } from "../../game/shop-scale";
import { classNames } from "../../utils/classNames";
import { ShortcutKeys } from "../shortcuts/Kbd";

/**
 * The bench's plan picker as the thing it diegetically is: a stack of
 * shop drawings. The pulled sheet lies on top — blueprint blue, white
 * line work, a title block — and the rest of the stack shows as sheet
 * edges below it; clicking an edge pulls that drawing out and pins it
 * over the bench (that IS selecting the plan). Blueprint recipes draw
 * their real part layout (the same slots the bench view's ghosts stand
 * at); everything else gets a schematic of its ingredients.
 *
 * Every drawing's edge carries `data-mode-option`, exactly once per
 * operation name, so the spec helpers that drive the old mode controls
 * (tests/machine-panel.ts) work here unchanged.
 */

const BLUEPRINT_BLUE = "#1d4a73";
const BLUEPRINT_BLUE_DEEP = "#173c5f";
const LINE = "#e8eef5";

export const BlueprintStack: React.FC<{
  operations: ReadonlyArray<Operation>;
  selected: Operation | null;
  onSelect: (operation: Operation) => void;
  progression: ProgressionState;
  /** Dust slowdown at this station, folded into the shown durations. */
  dustMultiplier?: number;
  /** Station work speed (worktables), folded into the shown durations. */
  workSpeed?: number;
  /** Advertise the cycle-operation key next to the stack. */
  showShortcut?: boolean;
  /** The station is working: the pinned drawing holds until it's done. */
  locked?: boolean;
}> = ({
  operations,
  selected,
  onSelect,
  progression,
  dustMultiplier,
  workSpeed,
  showShortcut,
  locked,
}) => {
  return (
    <div className="space-y-1.5 text-sm">
      <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade flex items-center gap-1.5">
        Plans
        {showShortcut && !locked && operations.length > 1 && (
          <ShortcutKeys shortcut="cycle-operation" />
        )}
      </div>

      {selected ? (
        <BlueprintSheet
          operation={selected}
          progression={progression}
          dustMultiplier={dustMultiplier}
          workSpeed={workSpeed}
          locked={locked}
        />
      ) : (
        <div className="rounded-sm border-2 border-dashed border-ink-black/30 px-3 py-4 text-center font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
          Pull a drawing from the stack
        </div>
      )}

      {/* The rest of the stack: sheet edges sticking out under the
          pulled drawing, one per plan, thumbed through by clicking */}
      <ul
        className="max-h-44 overflow-y-auto rounded-b-sm shadow-inner"
        data-testid="blueprint-stack"
      >
        {operations.map((operation, index) => {
          const isSelected = operation === selected;
          return (
            <li key={operation.id}>
              <button
                disabled={locked}
                data-sfx="ui-page-turn"
                onClick={() => onSelect(operation)}
                className={classNames(
                  "flex w-full items-baseline justify-between gap-2 border-b px-2 py-0.5 text-left",
                  "border-[#0f2c47]/60",
                  isSelected
                    ? "text-white"
                    : "text-[#bcd0e2] hover:text-white hover:brightness-110",
                  locked && "cursor-not-allowed opacity-70",
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
                      progression,
                      dustMultiplier,
                      workSpeed,
                    ),
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** The pulled drawing: schematic, margin frame, and title block. */
const BlueprintSheet: React.FC<{
  operation: Operation;
  progression: ProgressionState;
  dustMultiplier?: number;
  workSpeed?: number;
  locked?: boolean;
}> = ({ operation, progression, dustMultiplier, workSpeed, locked }) => {
  const io = useMemo(() => describeOperationIO(operation), [operation]);
  const blueprint =
    operation.interaction?.kind === "assembly"
      ? productBlueprintFor(operation.interaction.blueprint)
      : null;

  const uses = [
    ...(operation.requiredConsumables ?? []).map(consumableLabel),
    ...(clampsFor(operation) > 0
      ? [`${clampsFor(operation)} clamps (returned)`]
      : []),
  ];

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
                    progression,
                    dustMultiplier,
                    workSpeed,
                  ),
                )}
              </span>
              {uses.length > 0 && <span>uses {uses.join(" · ")}</span>}
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
          const w = slot.part.widthIn;
          const h = slot.part.lengthFt * INCHES_PER_FOOT;
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
