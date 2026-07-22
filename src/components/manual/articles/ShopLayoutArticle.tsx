import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { FigureRow, H, Note, P, Photo, Term } from "./elements";

export const ShopLayoutArticle: React.FC = () => (
  <>
    <P>
      There is no blueprint mode. When a machine needs to move, you pick it
      up and you carry it — the shop gets arranged the way real shops do,
      one heavy object at a time.
    </P>
    <FigureRow>
      <Photo
        src="/images/miter-saw.png"
        caption="the first heavy thing you'll lug"
      />
    </FigureRow>

    <H>The Carry Verb</H>
    <P>
      <ShortcutKeys shortcut="carry-machine" /> does three jobs, depending on
      where you stand: on a <Term>crate</Term>, it unpacks the machine
      straight into your arms; at a placed machine's operator cell, it hoists
      the machine up; and while you're carrying something, it sets it back
      down wherever there's room. Rotate what you're holding with{" "}
      <ShortcutKeys shortcut="carry-rotate" />, and when machines share a
      square — a saw sitting on a table — <ShortcutKeys shortcut="cycle-machine" />{" "}
      picks which one you mean.
    </P>

    <H>Deliveries</H>
    <P>
      Store purchases arrive as crates by the garage door, and shop-built
      worktables come off the bench crated the same way. A crate doesn't
      block walking; stand on it and lift when you're ready to place it.
    </P>

    <H>Placing for Work</H>
    <P>
      Every machine has an <Term>operator cell</Term> — the square you stand
      on to run it. Keep it reachable, or the machine is furniture. Mind the
      flow: feed-through machines like the planer take stock from your hands
      on one side and deliver to the outfeed cell on the other, so leave
      that cell clear and think about where you'll be standing for the next
      step. Arms full of machine means no other work until you set it down.
    </P>

    <Note>Measure the walk, not just the wall. You'll make that trip a
    thousand times.</Note>
  </>
);
