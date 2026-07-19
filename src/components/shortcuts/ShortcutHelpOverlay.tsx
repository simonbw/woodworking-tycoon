import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  SHORTCUT_GROUPS,
  SHORTCUTS,
  ShortcutGroup,
} from "../../game/shortcuts";
import { Hint } from "./Kbd";
import { useModalScope, useShortcut } from "./ShortcutProvider";

/**
 * The `?` cheat sheet. Reads straight from the shortcut registry, so a new
 * binding shows up here without anyone remembering to document it.
 */
export const ShortcutHelpOverlay: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  useModalScope();
  useShortcut("close-modal", onClose);
  useShortcut("close-help", onClose);

  const groups = SHORTCUT_GROUPS.map((group) => ({
    group,
    defs: SHORTCUTS.filter((d) => d.group === group && !d.hidden),
  })).filter(({ defs }) => defs.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="paper-card-ivory max-h-[85vh] w-full max-w-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="font-condensed uppercase tracking-[0.25em] text-[0.65rem] text-ink-fade leading-none">
              Reference
            </div>
            <h2 className="font-condensed font-bold text-2xl uppercase tracking-wide mt-0.5">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            className="button-ghost text-lg leading-none"
            onClick={onClose}
            aria-label="Close"
            data-sfx="ui-back"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 xs:grid-cols-2 gap-x-8 gap-y-5">
          {groups.map(({ group, defs }) => (
            <ShortcutGroupList key={group} group={group} defs={defs} />
          ))}
        </div>

        <p className="mt-5 border-t border-ink-black/20 pt-3 text-[0.7rem] text-ink-fade">
          Hold <span className="not-italic">Shift</span> while clicking Pick Up,
          Drop, Take or a machine slot to move the whole stack at once.
        </p>
      </div>
    </div>
  );
};

const helpContext = createContext<{ open: () => void } | undefined>(undefined);

/**
 * Binds `?`, hosts the overlay, and lets anything else open it — the NavBar's
 * ⌨ button, mainly, since a cheat sheet you can only reach *with* a keyboard
 * shortcut isn't much of a cheat sheet.
 */
export const ShortcutHelpProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [open, setOpen] = useState(false);
  useShortcut("toggle-help", () => setOpen((o) => !o));

  const value = useMemo(() => ({ open: () => setOpen(true) }), []);

  return (
    <helpContext.Provider value={value}>
      {children}
      {open && <ShortcutHelpOverlay onClose={() => setOpen(false)} />}
    </helpContext.Provider>
  );
};

export function useHelpOverlay(): { open: () => void } {
  const value = useContext(helpContext);
  if (!value) {
    throw new Error(
      "useHelpOverlay must be used within a ShortcutHelpProvider",
    );
  }
  return value;
}

const ShortcutGroupList: React.FC<{
  group: ShortcutGroup;
  defs: typeof SHORTCUTS;
}> = ({ group, defs }) => (
  <section>
    <h3 className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade border-b border-ink-black/20 pb-1">
      {group}
    </h3>
    <ul className="mt-2 space-y-1 text-xs">
      {defs.map((def) => (
        <Hint key={def.id} shortcut={def.id} />
      ))}
    </ul>
  </section>
);
