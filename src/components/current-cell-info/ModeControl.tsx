import React, { useMemo, useState } from "react";
import { ConsumableAmount, CONSUMABLE_TYPES } from "../../game/Consumable";
import { MachineOperation, ParameterizedOperation } from "../../game/Machine";
import { ProgressionState } from "../../game/GameState";
import { describeOperationIO } from "../../game/operation-helpers";
import { getOperationDuration } from "../../game/skill-helpers";
import { classNames } from "../../utils/classNames";
import { ShortcutKeys } from "../shortcuts/Kbd";

type Operation = MachineOperation | ParameterizedOperation;

/**
 * How many operations a station can have before the mode switch stops
 * reading as a machine control and the list becomes a recipe index. The
 * milling machines sit well under this; the workspace sails past it.
 */
const SEGMENTED_LIMIT = 4;

/**
 * Operation picker for the machine spec sheet. One fixed plate for
 * single-mode machines, a segmented switch while the list still fits one
 * (like the mode plate on real equipment), and a browsable recipe index —
 * each entry summarizing what goes in and what comes out — once a
 * station's repertoire outgrows a switch.
 */
export const ModeControl: React.FC<{
  operations: ReadonlyArray<Operation>;
  selected: Operation | null;
  onSelect: (operation: Operation) => void;
  progression: ProgressionState;
  /** Dust slowdown at this station, folded into the shown durations. */
  dustMultiplier?: number;
  /** Station work speed (worktables), folded into the shown durations. */
  workSpeed?: number;
  /** Advertise the cycle-operation key next to the control. */
  showShortcut?: boolean;
  /**
   * What the control calls itself. Benches say "Plan" — a bench really is
   * recipe-driven, you're choosing which drawing is pinned above it —
   * while machines say "Mode". (Direct-feed machines say nothing: they
   * don't render this control at all.)
   */
  labelText?: string;
}> = ({
  operations,
  selected,
  onSelect,
  progression,
  dustMultiplier,
  workSpeed,
  showShortcut,
  labelText = "Mode",
}) => {
  const label = (
    <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade min-w-16 shrink-0 inline-flex items-center gap-1.5">
      {labelText}
      {showShortcut && operations.length > 1 && (
        <ShortcutKeys shortcut="cycle-operation" />
      )}
    </span>
  );

  if (operations.length === 1) {
    return (
      <div className="flex flex-row items-center gap-2 text-sm">
        {label}
        <span data-mode-option className="font-condensed font-semibold">
          {operations[0].name}
        </span>
      </div>
    );
  }

  if (operations.length <= SEGMENTED_LIMIT) {
    return (
      <div className="flex flex-row items-center gap-2 text-sm">
        {label}
        <div
          role="radiogroup"
          aria-label={labelText}
          className="flex flex-wrap"
        >
          {operations.map((operation, i) => {
            const isSelected = operation === selected;
            return (
              <button
                key={operation.id}
                data-mode-option
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelect(operation)}
                className={classNames(
                  "border border-ink-black/40 px-2 py-0.5 font-condensed text-sm",
                  i > 0 && "border-l-0",
                  i === 0 && "rounded-l",
                  i === operations.length - 1 && "rounded-r",
                  isSelected
                    ? "bg-ink-blue/15 font-semibold text-ink-blue shadow-inner"
                    : "text-ink-black/70 hover:bg-ink-black/5 hover:text-ink-black",
                )}
              >
                {operation.name}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <RecipeIndex
      operations={operations}
      selected={selected}
      onSelect={onSelect}
      progression={progression}
      dustMultiplier={dustMultiplier}
      workSpeed={workSpeed}
      label={label}
    />
  );
};

/** "8 nails", but "4 oz Mineral Oil" when the unit isn't the name. */
function consumableLabel(cost: ConsumableAmount): string {
  const type = CONSUMABLE_TYPES[cost.id];
  return type.unit === type.name.toLowerCase()
    ? `${cost.amount} ${type.unit}`
    : `${cost.amount} ${type.unit} ${type.name}`;
}

const RecipeIndex: React.FC<{
  operations: ReadonlyArray<Operation>;
  selected: Operation | null;
  onSelect: (operation: Operation) => void;
  progression: ProgressionState;
  dustMultiplier?: number;
  workSpeed?: number;
  label: React.ReactNode;
}> = ({
  operations,
  selected,
  onSelect,
  progression,
  dustMultiplier,
  workSpeed,
  label,
}) => {
  const [open, setOpen] = useState(false);

  // Ingredient/product summaries come from actually running each recipe on
  // mock stock, which is cheap but not free — only while browsing.
  const summaries = useMemo(
    () =>
      open
        ? new Map(
            operations.map((operation) => [
              operation,
              describeOperationIO(operation),
            ]),
          )
        : null,
    [open, operations],
  );

  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-row items-center gap-2">
        {label}
        <button
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={classNames(
            "flex grow items-center justify-between gap-2 rounded border border-ink-black/40 px-2 py-0.5 text-left font-condensed",
            "hover:bg-ink-black/5",
            !selected && "italic text-ink-fade",
          )}
        >
          <span className={classNames(selected && "font-semibold")}>
            {selected?.name ?? "Select recipe…"}
          </span>
          <span className="text-[0.6rem] text-ink-fade">
            {open ? "▲" : "▼"}
          </span>
        </button>
      </div>

      {open && (
        <ul className="max-h-64 divide-y divide-ink-black/10 overflow-y-auto rounded border border-ink-black/30 bg-paper-ivory">
          {operations.map((operation) => {
            const isSelected = operation === selected;
            const io = summaries?.get(operation);
            return (
              <li key={operation.id}>
                <button
                  onClick={() => {
                    onSelect(operation);
                    setOpen(false);
                  }}
                  className={classNames(
                    "w-full px-2 py-1.5 text-left",
                    isSelected
                      ? "border-l-2 border-ink-blue bg-ink-blue/10"
                      : "border-l-2 border-transparent hover:bg-ink-black/5",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span
                      data-mode-option
                      className={classNames(
                        "font-condensed font-semibold",
                        isSelected && "text-ink-blue",
                      )}
                    >
                      {operation.name}
                    </span>
                    <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-ink-fade">
                      {getOperationDuration(
                        operation,
                        progression,
                        dustMultiplier,
                        workSpeed,
                      )}{" "}
                      ticks
                    </span>
                  </span>
                  {io && (
                    <span className="block text-xs leading-snug text-ink-fade">
                      {io.inputs.join(" + ")}
                      {io.outputs.length > 0 && ` → ${io.outputs.join(" + ")}`}
                    </span>
                  )}
                  {operation.requiredConsumables &&
                    operation.requiredConsumables.length > 0 && (
                      <span className="block text-[0.65rem] leading-snug text-ink-fade">
                        uses{" "}
                        {operation.requiredConsumables
                          .map(consumableLabel)
                          .join(" · ")}
                      </span>
                    )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
