import React from "react";
import { OperationParameter } from "../../game/Machine";
import { Board } from "../../game/Materials";
import { CutLineScale } from "../current-cell-info/CutLineScale";
import { DetentScale } from "../current-cell-info/DetentScale";
import { ShortcutKeys } from "../shortcuts/Kbd";

/**
 * One labeled settings scale on a station sheet: the parameter's name,
 * the key chips that drive it (Z/X for a linear setting, R for one you
 * swing), and the scale itself — the staged stock under a cut line for
 * slide-presented settings, a printed detent scale otherwise.
 */
export const ParameterScaleRow: React.FC<{
  param: OperationParameter;
  value: number | string;
  /** Show the key chips that drive this scale (targeted machine only). */
  showShortcut: boolean;
  onSelect: (value: number | string) => void;
  satisfiable: (value: number | string) => boolean;
  /** Slide presentation: the board on the machine that the setting slides. */
  board?: Board;
  /** Slide presentation: the head's set lean, shown on the cut line. */
  angle?: number;
  /** Detent presentation: the relevant dimension of the stock at hand. */
  stockValue?: number;
}> = ({
  param,
  value,
  showShortcut,
  onSelect,
  satisfiable,
  board,
  angle,
  stockValue,
}) => (
  <div className="flex flex-row items-start gap-2 text-xs">
    <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade min-w-16 shrink-0 inline-flex items-center gap-1.5 pt-2.5">
      {param.name}
      {/* The keys that drive this scale on the targeted machine: R swings
          a rotating setting, Z/X step a linear one. */}
      {showShortcut &&
        (param.presentation === "rotate" ? (
          <ShortcutKeys shortcut="rotate-setting" />
        ) : (
          <>
            <ShortcutKeys shortcut="setting-down" />
            <ShortcutKeys shortcut="setting-up" />
          </>
        ))}
    </span>
    {param.presentation === "slide" ? (
      // The carried board itself under the blade line — sliding it is
      // the input, and the head's set lean shows on the line
      <CutLineScale
        param={param}
        value={value}
        onSelect={onSelect}
        satisfiable={satisfiable}
        board={board}
        angle={angle ?? 0}
      />
    ) : (
      <DetentScale
        param={param}
        value={value}
        onSelect={onSelect}
        satisfiable={satisfiable}
        stockValue={stockValue}
      />
    )}
  </div>
);
