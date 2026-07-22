import React from "react";
import { H, Note, P, Term } from "./elements";

export const LumberArticle: React.FC = () => (
  <>
    <P>
      Boards are named the way lumber is actually sold, and the size is
      written two ways depending on the wood.
    </P>

    <H>Construction Lumber</H>
    <P>
      Framing stock goes by its cross-section: a <Term>2x4</Term> is 2 inches
      thick and 4 inches wide. The last number is the length in feet — "Pine
      2x4 — 8'" is an eight-foot two-by-four. Cutting one shorter still
      leaves a 2x4. Ripping it narrower or planing it thinner takes it off
      the named size, and from then on it reads like the hardwoods below.
    </P>

    <H>Hardwood</H>
    <P>
      Hardwood thickness is measured in <Term>quarters</Term> of an inch:
      4/4 ("four-quarter") stock is 1 inch thick, and 8/4 is 2 inches. Width
      and length follow — "Walnut 8/4 — 6" × 8'" is a walnut board 2 inches
      thick, 6 inches wide, and 8 feet long. Hover over any board's name to
      see its size spelled out in plain inches.
    </P>

    <H>The Line Under the Name</H>
    <P>
      The small line under a board's name is its condition: the surface
      quality, and how far along the milling is. Milling & Surfaces covers
      what those marks mean and how to change them.
    </P>

    <Note>
      Say "eight-quarter", not "two inches thick" — the lumberyard will know
      exactly what you mean.
    </Note>
  </>
);
