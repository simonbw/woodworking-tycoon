import React from "react";
import {
  SHORTCUT_GROUPS,
  SHORTCUTS,
  ShortcutGroup,
} from "../../../game/shortcuts";
import { Hint, Kbd } from "../../shortcuts/Kbd";
import { P } from "./elements";

/**
 * The keyboard reference, rendered straight from the shortcut registry so a
 * new binding shows up here without anyone remembering to document it.
 */
export const ControlsArticle: React.FC = () => {
  const groups = SHORTCUT_GROUPS.map((group) => ({
    group,
    defs: SHORTCUTS.filter((def) => def.group === group && !def.hidden),
  })).filter(({ defs }) => defs.length > 0);

  return (
    <>
      <P>
        A reference for every keyboard control. Walk up to something and its
        hints show the keys that work right there.
      </P>

      <div className="mt-4 grid grid-cols-1 xs:grid-cols-2 gap-x-8 gap-y-5">
        {groups.map(({ group, defs }) => (
          <ShortcutGroupList key={group} group={group} defs={defs} />
        ))}
      </div>

      <p className="mt-5 border-t border-ink-black/20 pt-3 text-[0.7rem] text-ink-fade">
        Hold <Kbd>Shift</Kbd> while clicking Pick Up, Drop, Take or a machine
        slot to move the whole stack at once.
      </p>
    </>
  );
};

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
