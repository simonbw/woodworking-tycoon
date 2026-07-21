import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { H, Note, P, Term } from "./elements";

export const DustArticle: React.FC = () => (
  <>
    <P>
      Machines make two things: parts, and mess. Sawdust settles on the
      floor, and a dirty floor slows everything — work at a dust-choked
      machine drags, and walking through drifts costs extra steps. There's
      no meter to watch; the floor you can see <em>is</em> the meter. A
      working shop is never spotless, and it doesn't need to be — the
      penalties only start once the mess gets real.
    </P>

    <H>The One Rule</H>
    <P>
      <Term>Dust is a substance that moves; only containers destroy it.</Term>{" "}
      A broom relocates dust. A vacuum captures it into a canister. The
      garbage can is where it finally stops existing. Everything below is
      just those three facts arranged in different orders.
    </P>

    <H>The Broom</H>
    <P>
      Sweep with <ShortcutKeys shortcut="sweep" />: the tile underfoot pushes
      into a growing <Term>sawdust pile</Term> in front of you — sweeping
      next to a machine pulls dust out from under it too, slowly. The pile
      is a real pile: pick it up with <ShortcutKeys shortcut="pick-up" /> and
      dump it in the garbage can. The broom always leaves a thin film; a
      broom-only shop is workably clean, never spotless.
    </P>

    <H>The Shop Vac</H>
    <P>
      The vac is the upgrade: grab or park it with{" "}
      <ShortcutKeys shortcut="vac-toggle" />. While you drag it, it
      trickle-cleans whatever you walk over, and{" "}
      <ShortcutKeys shortcut="sweep" /> fires a burst — the current tile to
      zero and a good bite out of the neighbors, machines' undersides
      included. Dust goes into the canister (about five tiles' worth), which
      empties itself whenever you stop next to the garbage can. The trip is
      the chore; there's no button.
    </P>

    <Note>The planer is the messiest machine in the building. Sweep after
    a milling session, not during.</Note>
  </>
);
