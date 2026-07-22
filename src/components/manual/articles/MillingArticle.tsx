import React from "react";
import { FigureRow, H, Note, P, Photo, Term, UL } from "./elements";

export const MillingArticle: React.FC = () => (
  <>
    <P>
      Lumber comes in three states of readiness. <Term>S4S</Term> — surfaced
      four sides — is flat, straight, and ready to use. <Term>S2S</Term> has
      surfaced faces but rough edges. <Term>Rough sawn</Term> lumber is
      neither flat nor straight. The rougher the stock, the cheaper it is,
      because the surfacing work is left to you. That work is milling.
    </P>
    <FigureRow>
      <Photo src="/images/benchtop-jointer.png" caption="jointer — flattens" />
      <Photo
        src="/images/lunchbox-planer.png"
        caption="planer — thicknesses"
      />
      <Photo src="/images/jobsite-table-saw.png" caption="table saw — rips" />
    </FigureRow>

    <H>Faces and Edges</H>
    <P>
      A board has <Term>faces</Term> (which need to be flat, then parallel)
      and <Term>edges</Term> (straight, then parallel). Each is its own job:
    </P>
    <UL>
      <li>
        <Term>Flatten a face</Term> — the jointer, or a hand plane at any
        bench. One flat face becomes the reference for everything else.
      </li>
      <li>
        <Term>Make the faces parallel</Term> — the planer, with the flat
        reference face against its bed.
      </li>
      <li>
        <Term>Straighten an edge</Term> — the jointer (after flattening a
        face, since the fence registers against it), the straight-line sled
        on the table saw (which handles rough stock — the board rides the
        sled, not the fence), or the hand plane.
      </li>
      <li>
        <Term>Rip to width</Term> — the table saw, once one edge is straight
        enough to run against the fence.
      </li>
    </UL>
    <P>
      Once a board has a flat face and a straight edge, the remaining steps
      can happen in any order. Crosscuts to length can happen at any point.
    </P>

    <H>Running the Planer</H>
    <P>
      Set the cut height with the crank, then feed stock in from your hands.
      Each pass removes <Term>one detent</Term> of thickness: stock one
      detent above the setting comes out at the setting, and stock already
      at the setting gets a light skim pass that surfaces it without
      changing its size. Thicknessing 8/4 stock down to 4/4 takes four
      passes, cranking the height down between each. The feed rollers carry
      the board through on their own, so you're free to do other work while
      a pass finishes.
    </P>

    <H>Surface Quality</H>
    <P>
      Besides its shape, every board and panel has a surface quality: rough
      → smooth → sanded. Planing and jointing leave a smooth surface; only
      sanding produces a sanded one. Glued-up panels always come out of the
      clamps rough, so plan on re-surfacing after every glue-up.
    </P>

    <Note>
      Never feed end grain through the planer — it will tear the panel
      apart. Sand it flat instead.
    </Note>
  </>
);
