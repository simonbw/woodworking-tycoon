import React from "react";
import { HAND_CAPACITY } from "../../../game/Person";
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
        A reference for every control. Walk up to something and its hints show
        the keys that work right there.
      </P>

      <P>
        The mouse points; the keyboard does the work. Hovering a machine or a
        piece of stock you're standing at aims the keys at it, so you never have
        to cycle through a stack to reach the one you want. Right-click opens
        what's under the cursor — a station's sheet, or a card listing every
        piece within reach. At a bench, where the pointer is doing the work
        instead, right-click puts down whatever is in your hand.
      </P>

      <div className="mt-4 grid grid-cols-1 xs:grid-cols-2 gap-x-8 gap-y-5">
        {groups.map(({ group, defs }) => (
          <ShortcutGroupList key={group} group={group} defs={defs} />
        ))}
      </div>

      <p className="mt-5 border-t border-ink-black/20 pt-3 text-[0.7rem] text-ink-fade">
        Your hands hold {HAND_CAPACITY} pieces of stock at a time. Hold{" "}
        <Kbd>Shift</Kbd> while clicking Pick Up, Drop, Take or a machine slot to
        move a full armful at once; bigger piles take trips, or a ride in the
        truck's bed.
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
