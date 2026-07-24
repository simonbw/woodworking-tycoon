import React from "react";
import { OperationParameter } from "../../game/Machine";
import { Board } from "../../game/Materials";
import { CutLineScale } from "../current-cell-info/CutLineScale";
import { DetentScale } from "../current-cell-info/DetentScale";
import { ShortcutKeys } from "../shortcuts/Kbd";

/**
 * One labeled settings scale on a station sheet: the parameter's name,
 * the Z-key chip when this is the scale the shortcut drives, and the
 * scale itself — the carried stock under a cut line for slide-presented
 * settings, a printed detent scale otherwise. Shared by the direct-feed
 * and bench sheets so the row can't drift between them.
 */
export const ParameterScaleRow: React.FC<{
  param: OperationParameter;
  value: number | string;
  /** Show the cycle-parameter key chip (the targeted machine's first scale). */
  showShortcut: boolean;
  onSelect: (value: number | string) => void;
  satisfiable: (value: number | string) => boolean;
  /** Slide presentation: the carried board the setting positions. */
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
      {/* Z drives the first setting of the targeted machine */}
      {showShortcut && <ShortcutKeys shortcut="cycle-parameter" />}
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
