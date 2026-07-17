import React, { Fragment } from "react";
import { classNames } from "../../utils/classNames";
import { getShortcut, ShortcutId } from "../../game/shortcuts";

/** A single key cap, in the paperwork style. */
export const Kbd: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <kbd
    className={classNames(
      "font-mono text-[0.65rem] px-1.5 py-0 rounded border",
      "border-ink-black/40 bg-paper-cream text-ink-black whitespace-nowrap",
      className,
    )}
  >
    {children}
  </kbd>
);

/**
 * Renders a shortcut's key alternatives — `[["W"], ["↑"]]` becomes `W / ↑`,
 * and `[["Shift", "E"]]` becomes `Shift`+`E`.
 */
export const KeyChips: React.FC<{
  keys: readonly (readonly string[])[];
  className?: string;
}> = ({ keys, className }) => (
  <span className={classNames("inline-flex items-center gap-1", className)}>
    {keys.map((chord, i) => (
      <Fragment key={i}>
        {i > 0 && <span className="text-ink-fade text-[0.65rem]">/</span>}
        {chord.map((key, j) => (
          <Fragment key={key}>
            {j > 0 && <span className="text-ink-fade text-[0.65rem]">+</span>}
            <Kbd>{key}</Kbd>
          </Fragment>
        ))}
      </Fragment>
    ))}
  </span>
);

/** The chips for a registered shortcut, looked up by id. */
export const ShortcutKeys: React.FC<{
  shortcut: ShortcutId;
  className?: string;
}> = ({ shortcut, className }) => (
  <KeyChips keys={getShortcut(shortcut).keys} className={className} />
);

/**
 * Tooltip body for the buttons that quietly honour shift-click as a "do all"
 * modifier. The modifier only matters when there's more than one thing to act
 * on, so the hint stays out of the way otherwise.
 */
export const ShiftHint: React.FC<{
  verb: string;
  plural?: boolean;
}> = ({ verb, plural }) =>
  plural ? (
    <span>
      {verb} one — hold <Kbd>Shift</Kbd> for all
    </span>
  ) : (
    <span>{verb}</span>
  );

/**
 * One row of a hint list: the keys, then what they do. `shortcut` pulls both
 * from the registry; `keys` + `children` is the escape hatch for hints that
 * aren't keyboard shortcuts at all (e.g. "Click — select machine").
 */
export const Hint: React.FC<{
  shortcut?: ShortcutId;
  keys?: readonly (readonly string[])[];
  /** Show what shift does. Off where space is tight; the `?` sheet has room. */
  showShift?: boolean;
  children?: React.ReactNode;
}> = ({ shortcut, keys, showShift = true, children }) => {
  const def = shortcut ? getShortcut(shortcut) : null;
  const chords = keys ?? def?.keys ?? [];
  return (
    <li className="flex items-baseline gap-2">
      <KeyChips keys={chords} />
      <span>{children ?? def?.description}</span>
      {showShift && def?.shiftHint && (
        <span className="text-ink-fade italic text-[0.65rem]">
          (+Shift: {def.shiftHint})
        </span>
      )}
    </li>
  );
};
