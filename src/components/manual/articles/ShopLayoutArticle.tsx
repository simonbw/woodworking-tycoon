import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { FigureRow, H, Note, P, Photo, Term } from "./elements";

export const ShopLayoutArticle: React.FC = () => (
  <>
    <P>
      Move a machine by picking it up, walking it to its new spot, and setting
      it down.
    </P>
    <FigureRow>
      <Photo src="/images/miter-saw.png" caption="the miter saw" />
    </FigureRow>

    <H>Carrying Machines</H>
    <P>
      What <ShortcutKeys shortcut="carry-machine" /> does depends on where
      you're standing: on a <Term>crate</Term>, it unpacks the machine into your
      arms; at a placed machine's operator cell, it picks the machine up; and
      while you're carrying one, it sets it down wherever there's room. Rotate
      what you're carrying with <ShortcutKeys shortcut="carry-rotate" />. When
      two machines share a square (a benchtop saw sitting on a table),{" "}
      <ShortcutKeys shortcut="cycle-machine" /> selects which one you mean.
    </P>

    <H>Deliveries</H>
    <P>
      A machine you buy rides home crated in the truck's bed. Walk out to the
      tailgate and lift it out with <ShortcutKeys shortcut="carry-machine" />,
      then carry it in through the garage door. Worktables you build come off
      the bench crated onto the floor beside it. You can walk right over a
      crate; stand on it and lift the machine out whenever you're ready to place
      it.
    </P>

    <H>Placement</H>
    <P>
      Every machine has an <Term>operator cell</Term>, the square you stand on
      to run it; leave that square reachable. Feed-through machines like the
      planer take stock on one side and deliver it to the outfeed cell on the
      other; keep the outfeed clear too.
    </P>

    <H>Benchtop Machines</H>
    <P>
      Some machines are built to sit on a bench rather than on the ground: the
      planer, the jointer, the jobsite table saw, and the miter saw. Set one on
      a worktable and it runs at full speed. Left on the floor, its table sits
      at your knees and every cut takes twice as long. Carry it up onto a
      worktable as soon as you've built one.
    </P>
    <P>
      The machine has to fit entirely on the table's top — a machine with one
      foot still on the ground is a machine on the ground. The shelf below
      doubles as its stand storage, and whatever top is left over is still yours
      to work on.
    </P>

    <Note>
      Give the table saw the middle of the long wall — long rips need room on
      both ends.
    </Note>
  </>
);
