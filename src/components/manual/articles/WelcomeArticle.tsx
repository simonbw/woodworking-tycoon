import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { FigureRow, H, Note, P, Photo, Term, UL } from "./elements";

export const WelcomeArticle: React.FC = () => (
  <>
    <P>
      You've got a one-car garage, a workbench made of a plywood offcut and
      some paint buckets, and a pallet somebody left behind. That's a
      woodworking shop. Everything else gets earned.
    </P>
    <FigureRow>
      <Photo src="/images/makeshift-bench.png" caption='the "workbench"' />
      <Photo src="/images/pallet.png" caption="your inheritance" />
    </FigureRow>

    <H>Getting Around</H>
    <P>
      Move with <ShortcutKeys shortcut="move-up" />{" "}
      <ShortcutKeys shortcut="move-left" /> <ShortcutKeys shortcut="move-down" />{" "}
      <ShortcutKeys shortcut="move-right" />. Steps queue up and play out over
      time — everything in the shop takes time, and time only passes while
      you're on the shop floor. Pick things up off the floor with{" "}
      <ShortcutKeys shortcut="pick-up" />, and put them down (or load them into
      a machine) with <ShortcutKeys shortcut="put-down" />. Pause any moment
      with <ShortcutKeys shortcut="speed-toggle" />.
    </P>

    <H>Your First Commission</H>
    <P>
      The corkboard on the left holds your current <Term>work order</Term>. The
      first one wants a rustic shelf, and that pallet is exactly enough wood.
      The whole job, start to finish:
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
        Operate the bench with <ShortcutKeys shortcut="operate-machine" /> to{" "}
        <Term>dismantle</Term> it: the pry bar yields deck boards and stringers,
        and every board freed gives back the nail that held it.
      </li>
      <li>
        Switch the bench's plan with <ShortcutKeys shortcut="cycle-operation" />{" "}
        to <Term>Build Rustic Shelf</Term>: two stringers, three deck boards,
        and eight of those salvaged nails.
      </li>
      <li>
        Pick the shelf up and mark the commission complete with{" "}
        <ShortcutKeys shortcut="complete-commission" />.
      </li>
    </UL>
    <P>
      Commissions are the story of this shop: each one pays well, builds your
      reputation, and asks for something you've never made before. The first
      payment is enough to open an account at the hardware store.
    </P>

    <Note>Rough is fine. Rustic means the splinters are free.</Note>
  </>
);
