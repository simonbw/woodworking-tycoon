import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { FigureRow, H, Note, P, Photo, Term, UL } from "./elements";

export const WelcomeArticle: React.FC = () => (
  <>
    <P>
      You start with a one-car garage, a makeshift workbench, and a pallet of
      free lumber. The first commission can be built from exactly that.
    </P>
    <FigureRow>
      <Photo src="/images/makeshift-bench.png" caption="the makeshift bench" />
      <Photo src="/images/pallet.png" caption="the starting pallet" />
    </FigureRow>

    <H>Getting Around</H>
    <P>
      Move with <ShortcutKeys shortcut="move-up" />{" "}
      <ShortcutKeys shortcut="move-left" />{" "}
      <ShortcutKeys shortcut="move-down" />{" "}
      <ShortcutKeys shortcut="move-right" />. Pick up whatever is at your feet
      with <ShortcutKeys shortcut="pick-up" />, and put it down — or load it
      into a machine — with <ShortcutKeys shortcut="put-down" />. Pause the game
      at any time with <ShortcutKeys shortcut="speed-toggle" />.
    </P>

    <H>Your First Commission</H>
    <P>
      The corkboard on the left shows your current <Term>work order</Term>. The
      first one asks for a rustic shelf, and the pallet has enough wood for it:
    </P>
    <UL>
      <li>
        Stand at the pallet and pick it up with{" "}
        <ShortcutKeys shortcut="pick-up" />.
      </li>
      <li>
        Carry it to the workbench and load it with{" "}
        <ShortcutKeys shortcut="put-down" />.
      </li>
      <li>
        Run the bench with <ShortcutKeys shortcut="operate-machine" /> to{" "}
        <Term>dismantle</Term> the pallet into deck boards and stringers. Prying
        a board free also recovers the nail that held it.
      </li>
      <li>
        Switch the bench's plan with <ShortcutKeys shortcut="cycle-operation" />{" "}
        to <Term>Build Rustic Shelf</Term>: two stringers, three deck boards,
        and eight of the salvaged nails.
      </li>
      <li>
        Pick up the finished shelf and deliver it with{" "}
        <ShortcutKeys shortcut="complete-commission" />.
      </li>
    </UL>
    <P>
      Completing a commission pays money and builds reputation, and each new
      commission asks for something more advanced. The first payment is enough
      to start shopping at the hardware store — once you hear about it, walk up
      to the garage door to head out.
    </P>

    <Note>
      New pages show up in this notebook as the shop grows — the ? button
      reopens it any time.
    </Note>
  </>
);
