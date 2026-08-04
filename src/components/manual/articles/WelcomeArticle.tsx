import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { FigureRow, H, Note, P, Photo, Term, UL } from "./elements";

export const WelcomeArticle: React.FC = () => (
  <>
    <P>
      You start with a one-car garage, a makeshift workbench, and a truck in the
      driveway. Free lumber is out there on pallets, and the first commission
      can be built from a single one.
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
      <ShortcutKeys shortcut="pick-up" /> does the natural thing — pick up,
      take, switch a machine on — and <ShortcutKeys shortcut="put-down" /> sets
      down what you're holding, on a machine if you're standing at one. Hold{" "}
      <ShortcutKeys shortcut="operate-machine" /> to run a power machine, for as
      long as the cut takes. <ShortcutKeys shortcut="open-station-sheet" />{" "}
      leans you over a bench, filling the screen with its top — hand work
      happens right there, with the mouse, and the wood stays where you leave
      it. <ShortcutKeys shortcut="pause-menu" /> stops the clock and opens the
      pause menu.
    </P>

    <H>Your First Commission</H>
    <P>
      The card in the top-left corner tracks your current{" "}
      <Term>work order</Term>. Click it, or press{" "}
      <ShortcutKeys shortcut="open-clipboard" />, to look over the full
      clipboard. The first order asks for a rustic shelf, and one pallet has
      enough wood for it:
    </P>
    <UL>
      <li>
        Walk out to the truck's cab and press{" "}
        <ShortcutKeys shortcut="pick-up" />, then pick{" "}
        <Term>Scavenge for pallets</Term>. A couple of hours poking around
        loading docks brings home 1-2 pallets in the bed.
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
        free when its last nail is out and stays lying on the bench; the bottom
        boards are nailed from the other side, so flip the pallet over with{" "}
        <ShortcutKeys shortcut="put-down" /> to get at them. Stop whenever you
        like — the pallet remembers where you left off — and each nail goes back
        in your tin.
      </li>
      <li>
        With the wood already on the bench, switch its plan with{" "}
        <ShortcutKeys shortcut="cycle-operation" /> to{" "}
        <Term>Build Rustic Shelf</Term>: two stringers, three deck boards, and
        six of the salvaged nails. Set each piece on its outline, then drive the
        nails home.
      </li>
      <li>
        Pick up the finished shelf, carry it out the garage door, and load it
        into the truck's bed with <ShortcutKeys shortcut="put-down" /> at the
        tailgate.
      </li>
      <li>
        Walk down to the cab and press <ShortcutKeys shortcut="pick-up" />. The
        truck lists the work riding in the bed; the number beside a row delivers
        it.
      </li>
    </UL>
    <P>
      Every finished job leaves the shop this way — commissions and job-board
      work alike. The goods have to be loaded in the bed and you have to be at
      the cab, so build first, then load up.
    </P>
    <P>
      Delivering a commission pays money and builds reputation, and it opens two
      doors: the hardware store — the trip starts at the same cab — and the
      phone in the top bar, where work gets listed for sale and one-off jobs get
      taken. Jobs and sales are how the shop earns between commissions; when
      your reputation grows enough, the phone rings with the next big order.
      What you buy rides home in the bed; unload it at the tailgate with{" "}
      <ShortcutKeys shortcut="pick-up" />.
    </P>

    <Note>
      New pages show up in this notebook as the shop grows — the ? button
      reopens it any time.
    </Note>
  </>
);
