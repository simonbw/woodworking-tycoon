import React from "react";
import { OperationParameter } from "../../game/Machine";
import { Board } from "../../game/Materials";
import { classNames } from "../../utils/classNames";
import { formatLength } from "../../utils/formatNumber";
import { Tooltip } from "../Tooltip";

/** The longest board in the game — the widget's full width, in inches. */
const FULL_LENGTH = 96;

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
  /** The station is working: the cut line reads out but won't slide. */
  locked?: boolean;
}> = ({ param, value, onSelect, satisfiable, board, angle, locked }) => {
  const pct = (inches: number) => `${(inches / FULL_LENGTH) * 100}%`;
  const position = typeof value === "number" ? value : Number(value) || 0;
  const length = board?.length;
  // How far apart the marks sit, so each one's hit target is exactly its
  // own share of the rule and clicking anywhere lands on the nearest.
  const markSpacing =
    param.values.length > 1
      ? Math.abs(Number(param.values[1]) - Number(param.values[0]))
      : FULL_LENGTH;

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
          { length: Math.ceil((length ?? FULL_LENGTH) / 12) - 1 },
          (_, i) => (i + 1) * 12,
        ).map((inches) => (
          <span
            key={inches}
            className="absolute top-0 h-full w-px bg-ink-black/15"
            style={{ left: `${(inches / (length ?? FULL_LENGTH)) * 100}%` }}
          />
        ))}
      </div>

      {/* The pieces this cut makes, printed inside the segments */}
      {length !== undefined && position < length && (
        <>
          <span
            className="absolute top-[0.7rem] flex h-4 -translate-x-1/2 items-center font-condensed text-[0.65rem] font-bold tabular-nums text-ink-black/80"
            style={{ left: pct(position / 2) }}
          >
            {formatLength(position)}
          </span>
          <span
            className="absolute top-[0.7rem] flex h-4 -translate-x-1/2 items-center font-condensed text-[0.65rem] font-bold tabular-nums text-ink-black/80"
            style={{ left: pct(position + (length - position) / 2) }}
          >
            {formatLength(length - position)}
          </span>
        </>
      )}
      {/* Off the end of the board the blade just drops past it — say so */}
      {length !== undefined && position >= length && (
        <span
          className="absolute top-[0.7rem] flex h-4 -translate-x-1/2 items-center font-condensed text-[0.65rem] tabular-nums text-ink-fade"
          style={{ left: pct(length / 2) }}
        >
          {formatLength(length)}
        </span>
      )}

      {/* One hit target per allowed cut line, each as wide as the gap to
          the next mark. On an inch rule that's a hair each, so only the
          foot marks (and whichever line is set) print a number — the rest
          are unlabeled ticks, the way a tape reads. */}
      {param.values.map((v) => {
        const selected = v === value;
        const reachable = satisfiable?.(v) ?? true;
        const inches = typeof v === "number" ? v : Number(v);
        const labeled = selected || inches % 12 === 0;
        const mark = formatLength(inches);
        return (
          <Tooltip
            key={v}
            content={
              locked
                ? `Cut line at ${mark} — the station is working`
                : reachable
                  ? length !== undefined && inches < length
                    ? `Cut at ${mark}: a ${mark} and a ${formatLength(length - inches)} piece`
                    : `Cut line at ${mark}`
                  : `${mark} — the carried board doesn't reach`
            }
          >
            <button
              role="radio"
              aria-checked={selected}
              aria-label={mark}
              disabled={locked}
              onClick={() => onSelect(v)}
              className={classNames(
                "group absolute top-0 bottom-0 flex min-w-[3px] -translate-x-1/2 flex-col items-center justify-end outline-none",
                !reachable && "opacity-35",
                locked && "cursor-not-allowed",
              )}
              style={{ left: pct(inches), width: pct(markSpacing) }}
            >
              <span
                className={classNames(
                  "w-px",
                  selected
                    ? "h-[0.5rem] w-0.5 bg-ink-blue"
                    : labeled
                      ? "h-[0.35rem] bg-ink-black/50"
                      : "h-[0.2rem] bg-ink-black/30",
                  !selected && !locked && "group-hover:bg-ink-black",
                )}
              />
              <span
                className={classNames(
                  "font-condensed text-[0.65rem] leading-tight tabular-nums",
                  selected ? "font-bold text-ink-blue" : "text-ink-black/70",
                  !selected && !locked && "group-hover:text-ink-black",
                  !labeled && "invisible",
                )}
              >
                {mark}
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
