import React from "react";
import { OperationParameter } from "../../game/Machine";
import { Board } from "../../game/Materials";
import { classNames } from "../../utils/classNames";
import { Tooltip } from "../Tooltip";

/** The longest board in the game — the widget's full width, in feet. */
const FULL_LENGTH = 8;

/**
 * The miter saw's cut input, drawn as the thing you'd actually do: the
 * carried board lies against the fence and the blade line crosses it at a
 * foot mark. Picking a mark is sliding the board; the readouts inside the
 * two segments are the pieces the cut makes, and the line leans with the
 * head so the set miter is visible before the trigger is pulled. With
 * empty hands a ghost of the longest board keeps the marks in place.
 */
export const CutLineScale: React.FC<{
  param: OperationParameter;
  value: number | string;
  onSelect: (value: number | string) => void;
  /** Whether the carried stock could take a cut at this mark. */
  satisfiable?: (value: number | string) => boolean;
  /** The carried board under the blade, if any. */
  board?: Board;
  /** The head's set angle, so the line leans like the blade will. */
  angle: number;
}> = ({ param, value, onSelect, satisfiable, board, angle }) => {
  const pct = (feet: number) => `${(feet / FULL_LENGTH) * 100}%`;
  const position = typeof value === "number" ? value : Number(value) || 0;
  const length = board?.length;

  return (
    <div
      role="radiogroup"
      aria-label={param.name}
      className="relative h-11 grow select-none"
    >
      {/* The stock to scale — or, with nothing in hand, a ghost of the
          longest board so the marks stay anchored */}
      <div
        className={classNames(
          "absolute left-0 top-[0.7rem] h-4 rounded-[2px] border",
          board
            ? "border-paper-manila-edge bg-paper-manila"
            : "border-dashed border-ink-black/30 bg-paper-manila/25",
        )}
        style={{ width: pct(length ?? FULL_LENGTH) }}
      >
        {/* Foot marks scribed on the stock itself */}
        {Array.from(
          { length: (length ?? FULL_LENGTH) - 1 },
          (_, i) => i + 1,
        ).map((foot) => (
          <span
            key={foot}
            className="absolute top-0 h-full w-px bg-ink-black/15"
            style={{ left: `${(foot / (length ?? FULL_LENGTH)) * 100}%` }}
          />
        ))}
      </div>

      {/* The pieces this cut makes, printed inside the segments */}
      {length !== undefined && position < length && (
        <>
          <span
            className="absolute top-[0.7rem] flex h-4 -translate-x-1/2 items-center font-mono text-[0.65rem] font-bold text-ink-black/80"
            style={{ left: pct(position / 2) }}
          >
            {position}&#8242;
          </span>
          <span
            className="absolute top-[0.7rem] flex h-4 -translate-x-1/2 items-center font-mono text-[0.65rem] font-bold text-ink-black/80"
            style={{ left: pct(position + (length - position) / 2) }}
          >
            {length - position}&#8242;
          </span>
        </>
      )}
      {/* Off the end of the board the blade just drops past it — say so */}
      {length !== undefined && position >= length && (
        <span
          className="absolute top-[0.7rem] flex h-4 -translate-x-1/2 items-center font-mono text-[0.65rem] text-ink-fade"
          style={{ left: pct(length / 2) }}
        >
          {length}&#8242;
        </span>
      )}

      {/* Foot marks below the table, one per allowed cut line */}
      {param.values.map((v) => {
        const selected = v === value;
        const reachable = satisfiable?.(v) ?? true;
        const feet = typeof v === "number" ? v : Number(v);
        return (
          <Tooltip
            key={v}
            content={
              reachable
                ? length !== undefined && feet < length
                  ? `Cut at ${feet}': a ${feet}' and a ${length - feet}' piece`
                  : `Cut line at ${feet}'`
                : `${feet}' — the carried board doesn't reach`
            }
          >
            <button
              role="radio"
              aria-checked={selected}
              aria-label={`${feet}'`}
              onClick={() => onSelect(v)}
              className={classNames(
                "group absolute top-0 bottom-0 flex w-4 -translate-x-1/2 flex-col items-center justify-end outline-none",
                !reachable && "opacity-35",
              )}
              style={{ left: pct(feet) }}
            >
              <span
                className={classNames(
                  "w-px",
                  selected
                    ? "h-[0.5rem] w-0.5 bg-ink-blue"
                    : "h-[0.35rem] bg-ink-black/50 group-hover:bg-ink-black",
                )}
              />
              <span
                className={classNames(
                  "font-mono text-[0.65rem] leading-tight tabular-nums",
                  selected
                    ? "font-bold text-ink-blue"
                    : "text-ink-black/70 group-hover:text-ink-black",
                )}
              >
                {feet}
              </span>
            </button>
          </Tooltip>
        );
      })}

      {/* The blade line, leaning with the head's set angle */}
      <div
        className="pointer-events-none absolute top-0 flex h-[1.9rem] -translate-x-1/2 flex-col items-center"
        style={{ left: pct(position) }}
      >
        <span className="text-[0.5rem] leading-[0.6rem] text-ink-blue">▼</span>
        <span
          className="w-0.5 flex-1 origin-center bg-ink-blue"
          style={{ transform: `rotate(${angle}deg)` }}
        />
      </div>
    </div>
  );
};
