import React from "react";
import { H, Note, P, Term } from "./elements";

export const GlueUpsArticle: React.FC = () => (
  <>
    <P>
      Gluing boards edge to edge makes a panel wider than any board you can buy.
      Every glue-up runs in two stretches: you spread glue and pull the joints
      closed with clamps, then the glue cures on its own. The curing half needs
      nobody at the bench — start it, walk away, and do other work while it
      sets.
    </P>

    <H>Clamps</H>
    <P>
      A glue-up holds a few <Term>clamps</Term> from the moment you start it
      until the glue is cured, and hands them back when it's done. The wider the
      joint, the more it takes: two for a pair of boards, four for a five-strip
      panel, six to marry two panels together.
    </P>
    <P>
      Clamps aren't used up — you buy each one once, and it comes back off every
      glue-up. What they limit is how much can be curing at the same time. With
      four clamps, one panel ties up the whole rack until it cures. With a
      dozen, three benches can be curing at once while you work on something
      else.
    </P>
    <P>
      The bench's plan sheet lists how many clamps the selected glue-up needs
      and how many are free right now. Buy more from the supplies aisle at the
      store.
    </P>

    <H>What Comes Out</H>
    <P>
      A panel comes off the clamps <Term>rough</Term>: squeeze-out and slight
      ridges where the strips meet. Sand it after it's out of the clamps, not
      before.
    </P>

    <Note>Glue dries faster than a bench frees up. Buy clamps in pairs.</Note>
  </>
);
