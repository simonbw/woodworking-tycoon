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
      Pick the broom up with <ShortcutKeys shortcut="pick-up" /> standing
      beside it. With it in hand, hold{" "}
      <ShortcutKeys shortcut="operate-machine" /> and walk: the broom sweeps
      the dust ahead of you into its <Term>dustpan</Term>. The mouse steers
      the head, so you can work a patch to either side without turning.
      Sweeping beside a machine also pulls dust out from under it, slowly.
    </P>
    <P>
      The pan holds a few tiles' worth. When it's full the strokes stop
      doing anything — stand at the garbage can and hold{" "}
      <ShortcutKeys shortcut="operate-machine" /> to pour it out. The broom
      takes both hands: set it down with{" "}
      <ShortcutKeys shortcut="put-down" /> before picking anything else up.
      A broom always leaves a thin film behind — thin enough not to matter.
    </P>

    <H>The Shop Vac</H>
    <P>
      Grab or park the vac with <ShortcutKeys shortcut="vac-toggle" /> —
      grabbing it means holding its hose, which takes your hands like the
      broom does. Dragging it steadily cleans whatever you walk over, and
      holding <ShortcutKeys shortcut="operate-machine" /> runs the nozzle
      over the floor ahead of you, machines' undersides included. The vac
      cleans to nothing — no film, no pile.
    </P>
    <P>
      Dust collects in the canister, which holds about five tiles' worth.
      When it fills, the suction stops. Wheel it to the garbage can and
      hold <ShortcutKeys shortcut="operate-machine" /> to empty it.
    </P>

    <Note>
      The planer makes more dust than everything else combined — plan on
      sweeping after every milling session.
    </Note>
  </>
);
