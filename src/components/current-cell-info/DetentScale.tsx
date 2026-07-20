import React from "react";
import { OperationParameter } from "../../game/Machine";
import { classNames } from "../../utils/classNames";
import { Tooltip } from "../Tooltip";

/**
 * A parameter picker drawn as the printed scale on a machine — a rail with
 * one detent per allowed value, like the ruler on a table saw fence or the
 * depth gauge on a planer. Every value in the game's parameterized
 * operations is one of a short ordered list, so the whole range is visible
 * at once instead of hiding behind a dropdown.
 *
 * Detents the loaded stock can't produce render faded (still selectable —
 * the setting may be for the next board, not this one), and the stock's own
 * dimension is marked so "where am I, where am I going" is one glance.
 */
export const DetentScale: React.FC<{
  param: OperationParameter;
  value: number | string;
  onSelect: (value: number | string) => void;
  /** Whether the loaded inputs could run at this value. Default: all can. */
  satisfiable?: (value: number | string) => boolean;
  /** The loaded stock's current dimension, marked on the scale. */
  stockValue?: number | string;
}> = ({ param, value, onSelect, satisfiable, stockValue }) => {
  const unit = param.unit ?? '"';

  const describe = (v: number | string) =>
    typeof v === "number" ? `${v}${unit}` : String(v);

  return (
    <div
      role="radiogroup"
      aria-label={param.name}
      className="flex grow items-start"
    >
      {param.values.map((v) => {
        const selected = v === value;
        const reachable = satisfiable?.(v) ?? true;
        const isStock = v === stockValue;
        return (
          <Tooltip
            key={v}
            content={
              reachable
                ? `${param.name}: ${describe(v)}${isStock ? " (loaded stock)" : ""}`
                : `${describe(v)} — loaded stock can't make this`
            }
          >
            <button
              role="radio"
              aria-checked={selected}
              aria-label={describe(v)}
              onClick={() => onSelect(v)}
              className={classNames(
                "group flex grow basis-0 flex-col items-center outline-none",
                !reachable && "opacity-35",
              )}
            >
              {/* Fence-cursor pointer above the rail marks the set value */}
              <span
                className={classNames(
                  "text-[0.5rem] leading-[0.6rem] text-ink-blue",
                  selected ? "" : "invisible",
                )}
              >
                ▼
              </span>
              {/* Each detent owns a segment of rail; adjacent segments join
                  into one continuous line */}
              <span className="flex w-full justify-center border-t border-ink-black/50">
                <span
                  className={classNames(
                    "w-px",
                    selected
                      ? "h-[0.55rem] w-0.5 bg-ink-blue"
                      : "h-[0.4rem] bg-ink-black/50 group-hover:bg-ink-black",
                  )}
                />
              </span>
              <span
                className={classNames(
                  "font-mono text-[0.65rem] leading-tight tabular-nums",
                  selected
                    ? "font-bold text-ink-blue"
                    : "text-ink-black/70 group-hover:text-ink-black",
                )}
              >
                {v}
              </span>
              {/* "You are here": the loaded stock's current dimension */}
              <span
                className={classNames(
                  "text-[0.5rem] leading-[0.6rem] text-ink-fade",
                  isStock ? "" : "invisible",
                )}
              >
                ▴
              </span>
            </button>
          </Tooltip>
        );
      })}
      {/* Unit legend, aligned with the value labels */}
      <span className="mt-[1.05rem] pl-1.5 font-mono text-[0.65rem] leading-tight text-ink-fade">
        {unit}
      </span>
    </div>
  );
};
