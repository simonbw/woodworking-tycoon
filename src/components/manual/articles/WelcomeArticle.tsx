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
      <ShortcutKeys shortcut="move-right" />. Walk up to anything and small
      hints appear on it, naming the keys that work there.{" "}
      <ShortcutKeys shortcut="pick-up" /> does the natural thing — pick up,
      take, switch a machine on — and <ShortcutKeys shortcut="put-down" /> sets
      down what you're holding, on a machine if you're standing at one.
      Hold <ShortcutKeys shortcut="operate-machine" /> to run the machine
      you're at, for as long as the work takes.{" "}
      <ShortcutKeys shortcut="open-station-sheet" /> spreads out a bench's
      sheet of plans and tools. <ShortcutKeys shortcut="pause-menu" /> stops
      the clock and opens the pause menu.
    </P>

    <H>Your First Commission</H>
    <P>
      The card in the top-left corner tracks your current{" "}
      <Term>work order</Term>. Click it, or press{" "}
      <ShortcutKeys shortcut="open-clipboard" />, to look over the full
      clipboard. The first order asks for a rustic shelf, and the pallet has
      enough wood for it:
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
        Hold <ShortcutKeys shortcut="operate-machine" /> to{" "}
        <Term>dismantle</Term> the pallet into deck boards and stringers. Let go
        and the work stops where it is; take hold again and it picks up. Prying
        a board free also recovers the nail that held it.
      </li>
      <li>
        Switch the bench's plan with <ShortcutKeys shortcut="cycle-operation" />{" "}
        to <Term>Build Rustic Shelf</Term>: two stringers, three deck boards,
        and eight of the salvaged nails.
      </li>
      <li>
        Pick up the finished shelf, carry it to the garage door, and press{" "}
        <ShortcutKeys shortcut="pick-up" />. The door lists the work you're
        holding; the number beside a row hands it over.
      </li>
    </UL>
    <P>
      Every finished job leaves the shop this way — commissions and job-board
      work alike. You have to be standing at the door with the goods in your
      hands, so build first, then make the trip.
    </P>
    <P>
      Handing a commission over pays money and builds reputation, and each new
      commission asks for something more advanced. The first payment is enough
      to start shopping at the hardware store — once you hear about it, walk up
      to the same door to head out.
    </P>

    <Note>
      New pages show up in this notebook as the shop grows — the ? button
      reopens it any time.
    </Note>
  </>
);
