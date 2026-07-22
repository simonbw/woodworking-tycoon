import React from "react";
import { FigureRow, H, Note, P, Photo, Term, UL } from "./elements";

export const MillingArticle: React.FC = () => (
  <>
    <P>
      The lumber aisle's price tags tell one story: <Term>S4S</Term> —
      surfaced four sides — is ready to use and priced accordingly. Everything
      cheaper is unfinished business. <Term>S2S</Term> has flat faces but wavy
      edges; <Term>rough sawn</Term> is nothing at all yet. The rougher you
      buy, the less you pay, because the mill's work becomes yours. That work
      is milling.
    </P>
    <FigureRow>
      <Photo src="/images/benchtop-jointer.png" caption="jointer — flattens" />
      <Photo
        src="/images/lunchbox-planer.png"
        caption="planer — thicknesses"
      />
      <Photo src="/images/jobsite-table-saw.png" caption="table saw — rips" />
    </FigureRow>

    <H>Two Things to True Up</H>
    <P>
      A board has <Term>faces</Term> (flat, then parallel) and{" "}
      <Term>edges</Term> (straight, then parallel). They're separate jobs:
    </P>
    <UL>
      <li>
        <Term>Flatten a face</Term> — the jointer, or a hand plane at any
        bench if you'd rather spend time than money. One flat face is the
        reference everything else measures from.
      </li>
      <li>
        <Term>Make faces parallel</Term> — the planer, which needs that
        reference face against its bed first.
      </li>
      <li>
        <Term>Straighten an edge</Term> — the jointer (after a face; the
        fence needs something flat to register), the straight-line sled on
        the table saw (no prerequisites — the board rides the sled, not the
        fence), or the hand plane.
      </li>
      <li>
        <Term>Rip to width</Term> — the table saw, once one edge is straight.
        Never run a wavy edge against the fence.
      </li>
    </UL>
    <P>
      After you have a reference face and edge, order stops mattering:
      plane-then-rip and rip-then-plane are both correct. Crosscuts to length
      have no prerequisites at all. And milling never eats the listed size —
      rough stock carries sacrificial material, so a 4/4 rough board finishes
      as a true 4/4 board.
    </P>

    <H>Running the Planer</H>
    <P>
      The planer has no menus — it has a cut-height crank and an appetite. Set
      the height, feed stock straight from your hands, and it takes{" "}
      <Term>one detent per pass</Term>: stock one detent above the setting
      comes out at the setting; stock already at the setting gets a skim pass
      (surfaced, same size). Thicknessing 8/4 down to 4/4 is four passes,
      cranking down between each. The feed rollers pull the board through on
      their own, so a pass finishes whether you stand there or not.
    </P>

    <H>Surface Is Not Geometry</H>
    <P>
      Separate from flat and straight, every board and panel carries a{" "}
      <Term>surface</Term>: rough → smooth → sanded. Planing leaves smooth;
      only sanding reaches sanded; and sanding never flattens or straightens
      anything — it only refines what's already true. Glue-ups always come
      out rough (squeeze-out, alignment ridges), so plan to re-surface every
      panel.
    </P>

    <Note>
      End grain never meets the planer. It will tear the panel apart — sand
      it flat instead.
    </Note>
  </>
);
