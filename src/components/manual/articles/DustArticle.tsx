import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { H, Note, P, Term } from "./elements";

export const DustArticle: React.FC = () => (
  <>
    <P>
      Machines throw sawdust, and it builds up on the floor. Too much slows the
      shop down: work at a dust-covered machine takes longer, and walking
      through deep dust costs extra steps. A little mess is harmless — the
      penalties only start once it piles up.
    </P>

    <H>The Broom</H>
    <P>
      Sweep with <ShortcutKeys shortcut="sweep" /> to push the dust underfoot
      into a <Term>sawdust pile</Term> in front of you. Sweeping next to a
      machine also pulls dust out from under it, slowly. The pile is an object
      like any other: pick it up with <ShortcutKeys shortcut="pick-up" /> and
      dump it in the garbage can. A broom always leaves a thin film behind —
      thin enough not to matter.
    </P>

    <H>The Shop Vac</H>
    <P>
      Grab or park the vac with <ShortcutKeys shortcut="vac-toggle" />. While
      you're dragging it, it steadily cleans whatever you walk over, and{" "}
      <ShortcutKeys shortcut="sweep" /> fires a burst that clears the tile
      you're on and takes a good bite out of the neighboring ones, machines'
      undersides included. Dust collects in the canister, which holds about five
      tiles' worth and empties automatically whenever you stop next to the
      garbage can.
    </P>

    <Note>
      The planer makes more dust than everything else combined — plan on
      sweeping after every milling session.
    </Note>
  </>
);
