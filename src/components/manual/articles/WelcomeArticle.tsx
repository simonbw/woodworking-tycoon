import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { FigureRow, H, Note, P, Photo, Term, UL } from "./elements";

export const WelcomeArticle: React.FC = () => (
  <>
    <P>
      You start with a one-car garage, a makeshift workbench, and a truck in the
      driveway. Free lumber is out there on pallets, and your first sale can be
      built from a single one.
    </P>
    <FigureRow>
      <Photo src="/images/makeshift-bench.png" caption="the makeshift bench" />
      <Photo src="/images/pallet.png" caption="a scavenged pallet" />
    </FigureRow>

    <H>Getting Around</H>
    <P>
      Move with <ShortcutKeys shortcut="move-up" />{" "}
      <ShortcutKeys shortcut="move-left" />{" "}
      <ShortcutKeys shortcut="move-down" />{" "}
      <ShortcutKeys shortcut="move-right" />. Walk up to anything and small
      hints appear on it, naming the keys that work there.{" "}
      <ShortcutKeys shortcut="pick-up" /> picks up, takes, or switches on
      whatever is in front of you, and <ShortcutKeys shortcut="put-down" /> sets
      down what you're holding, on a machine if you're standing at one. Hold{" "}
      <ShortcutKeys shortcut="operate-machine" /> to run a power machine.{" "}
      <ShortcutKeys shortcut="open-station-sheet" /> leans you over a bench,
      where hand work happens with the mouse.{" "}
      <ShortcutKeys shortcut="pause-menu" /> stops the clock and opens the pause
      menu.
    </P>

    <H>Your First Sale</H>
    <P>
      A rustic shelf is the quickest thing to build and sell, and one pallet has
      enough wood for it:
    </P>
    <UL>
      <li>
        Walk out to the truck's cab and press{" "}
        <ShortcutKeys shortcut="pick-up" />, then pick{" "}
        <Term>Scavenge for pallets</Term>. Each stop takes half an hour to
        search; keep searching, or head back to the shop with what's in the bed
        — the drive back costs nothing. The shop keeps running while you're
        away.
      </li>
      <li>
        Lift a pallet out of the bed with <ShortcutKeys shortcut="pick-up" /> at
        the tailgate.
      </li>
      <li>
        Carry it to the workbench and load it with{" "}
        <ShortcutKeys shortcut="put-down" />.
      </li>
      <li>
        Open the bench with <ShortcutKeys shortcut="open-station-sheet" />, take
        the hammer down off the rail, and pry the nails with it. A board comes
        free when its last nail is out; the bottom boards are nailed from the
        other side, so flip the pallet over with{" "}
        <ShortcutKeys shortcut="put-down" /> to get at them. Each nail you pull
        goes back in your tin.
      </li>
      <li>
        With the wood already on the bench, open the plan drawer with{" "}
        <ShortcutKeys shortcut="open-plan-browser" /> and pull{" "}
        <Term>Build Rustic Shelf</Term>: six pallet boards and eight of the
        salvaged nails. Set each piece on its outline, then drive the nails
        home.
      </li>
      <li>
        Pick up the finished shelf, carry it down the driveway, and set it out
        at the <Term>for-sale stand</Term> with{" "}
        <ShortcutKeys shortcut="put-down" />. Someone walking by will buy it.
      </li>
    </UL>
    <P>
      Your first sale unlocks the hardware store, a trip from the truck's cab.
      Walk the aisles and take things off the shelves with{" "}
      <ShortcutKeys shortcut="put-down" /> — they go in your cart, and nothing
      is paid for until the register rings the cart up. Pay at the counter, then
      head home from the truck out front. What you bought rides home in the bed
      — unload it at the tailgate with <ShortcutKeys shortcut="pick-up" />.
    </P>

    <Note>
      New pages show up in this notebook as the shop grows — the ? button
      reopens it any time.
    </Note>
  </>
);
