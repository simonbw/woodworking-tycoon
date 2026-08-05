import React from "react";
import { H, Note, P, Term } from "./elements";

export const GlueUpsArticle: React.FC = () => (
  <>
    <P>
      Gluing boards edge to edge makes a panel wider than any board you can buy.
      There is no plan to pick for it. Lean over the bench, set your clamps out
      on the top, and lay the boards across them edge to edge — whatever run of
      stock is sitting in the clamps is the glue-up.
    </P>

    <H>The Order of Work</H>
    <P>
      Clamps first: take a <Term>bar clamp</Term> from the rack (the Glue-up
      chip beside the tool rail) and lay it on the bench. One clamp per foot of
      board length, and never fewer than two — the bench shows faint outlines
      where they belong once the boards are down. Then the boards, edge to edge
      across the bars: both edges jointed, faces planed smooth, one thickness,
      one length. Then the glue — take the bottle and run a bead down each open
      seam. Last, press each clamp to wind it tight. The final clamp starts the
      cure.
    </P>
    <P>
      The curing half needs nobody at the bench — the work sits in its clamps
      right where you built it. Walk away and do other work while it sets.
    </P>

    <H>Clamps</H>
    <P>
      A glue-up holds its clamps from the last tighten until the glue is cured,
      and hands them back when it's done. Longer stock takes more bars: a
      two-foot run wants two, a four-foot run wants four.
    </P>
    <P>
      Clamps aren't used up — you buy each one once, and it comes back off every
      glue-up. What they limit is how much can be curing at the same time. With
      two clamps, one panel ties up the whole rack until it cures. With more,
      several benches can be curing at once while you work on something else.
      Buy them from the supplies aisle at the store.
    </P>

    <H>What Comes Out</H>
    <P>
      A panel comes off the clamps <Term>rough</Term>: squeeze-out and slight
      ridges where the strips meet. Sand it after it's out of the clamps, not
      before. It takes as many boards as you lay in — three strips make a narrow
      shelf blank, seven make a wide one — and a finished panel can go straight
      back between the clamps to be made wider still.
    </P>

    <Note>Glue dries faster than a bench frees up. Buy clamps in pairs.</Note>
  </>
);
