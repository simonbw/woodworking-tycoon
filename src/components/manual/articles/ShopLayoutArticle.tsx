import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { FigureRow, H, Note, P, Photo, Term } from "./elements";

export const ShopLayoutArticle: React.FC = () => (
  <>
    <P>
      Machines are moved by carrying them: pick one up, walk it to its new
      spot, and set it down.
    </P>
    <FigureRow>
      <Photo src="/images/miter-saw.png" caption="the miter saw" />
    </FigureRow>

    <H>Carrying Machines</H>
    <P>
      What <ShortcutKeys shortcut="carry-machine" /> does depends on where
      you're standing: on a <Term>crate</Term>, it unpacks the machine into
      your arms; at a placed machine's operator cell, it picks the machine
      up; and while you're carrying one, it sets it down wherever there's
      room. Rotate what you're carrying with{" "}
      <ShortcutKeys shortcut="carry-rotate" />. When two machines share a
      square — a benchtop saw sitting on a table —{" "}
      <ShortcutKeys shortcut="cycle-machine" /> selects which one you mean.
    </P>

    <H>Deliveries</H>
    <P>
      Store purchases arrive as crates by the garage door, and worktables
      you build come off the bench crated the same way. Crates don't block
      walking — stand on one and lift it whenever you're ready to place the
      machine.
    </P>

    <H>Placement</H>
    <P>
      Every machine has an <Term>operator cell</Term> — the square you stand
      on to run it — so leave that square reachable. Feed-through machines
      like the planer take stock on one side and deliver it to the outfeed
      cell on the other; keep the outfeed clear too.
    </P>

    <Note>
      Nothing is permanent — machines can be picked up and rearranged at any
      time.
    </Note>
  </>
);
