import React, { Fragment, useContext } from "react";
import { classNames } from "../../utils/classNames";
import { getShortcut, ShortcutId } from "../../game/shortcuts";

/**
 * Which surface the hint chrome sits on: "paper" (ink on a light card) or
 * "chrome" (manila on the dark workshop background). Wrap dark-background
 * hint lists in the provider so key caps and muted text stay readable.
 */
export const HintSurfaceContext = React.createContext<"paper" | "chrome">(
  "paper",
);

const mutedText = {
  paper: "text-ink-fade",
  chrome: "text-paper-manila/50",
};

/** A single key cap, in the paperwork style. */
export const Kbd: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => {
  const surface = useContext(HintSurfaceContext);
  return (
    <kbd
      className={classNames(
        "font-mono text-[0.65rem] px-1.5 py-0 rounded border whitespace-nowrap",
        surface === "paper"
          ? "border-ink-black/40 bg-paper-cream text-ink-black"
          : "border-paper-manila/40 bg-paper-manila/10 text-paper-manila",
        className,
      )}
    >
      {children}
    </kbd>
  );
};

/**
 * Renders a shortcut's key alternatives — `[["W"], ["↑"]]` becomes `W / ↑`,
 * and `[["Shift", "E"]]` becomes `Shift`+`E`.
 */
export const KeyChips: React.FC<{
  keys: readonly (readonly string[])[];
  className?: string;
}> = ({ keys, className }) => {
  const muted = mutedText[useContext(HintSurfaceContext)];
  return (
    <span className={classNames("inline-flex items-center gap-1", className)}>
      {keys.map((chord, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={`${muted} text-[0.65rem]`}>/</span>}
          {chord.map((key, j) => (
            <Fragment key={key}>
              {j > 0 && <span className={`${muted} text-[0.65rem]`}>+</span>}
              <Kbd>{key}</Kbd>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
};

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
  const muted = mutedText[useContext(HintSurfaceContext)];
  const def = shortcut ? getShortcut(shortcut) : null;
  const chords = keys ?? def?.keys ?? [];
  return (
    <li className="flex items-baseline gap-2">
      <KeyChips keys={chords} />
      <span>{children ?? def?.description}</span>
      {showShift && def?.shiftHint && (
        <span className={`${muted} italic text-[0.65rem]`}>
          (+Shift: {def.shiftHint})
        </span>
      )}
    </li>
  );
};
