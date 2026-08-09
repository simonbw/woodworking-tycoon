import React from "react";
import { H, Note, P, Term } from "./elements";

export const SheetGoodsArticle: React.FC = () => (
  <>
    <P>
      Plywood, MDF, OSB, and particle board are sold by the piece and cut down
      to what a plan asks for. A sheet has no species and no grain to follow —
      the only thing you do to one is make it smaller.
    </P>

    <H>Buying by Size</H>
    <P>
      Every kind is racked in three sizes: a full <Term>4×8 sheet</Term>, a{" "}
      <Term>2×4 panel</Term>, and a <Term>2×2 panel</Term>. The size is printed
      on the line under the name. The full sheet is the cheapest wood in the
      store by the square foot; the small panels charge a premium for the
      cutting already done, close to double by the time you get to the 2×2.
    </P>
    <P>
      Small builds are sized so a panel covers them. Buy the panel when you want
      the part and nothing else; buy the sheet when you can break it down.
    </P>

    <H>Cutting on the Table Saw</H>
    <P>
      Set a sheet on the saw and hold the trigger, the same as a board. The
      fence reads in inches for sheet stock, and it only travels so far from the
      blade — the piece you keep against the fence can never be wider than that,
      though whatever falls off the far side can be any size. With the crosscut
      sled mounted you can cut a sheet to length as well, up to the width the
      sled will carry.
    </P>
    <P>
      A sheet needs clear floor past both ends of the saw, like any long stock.
      A full sheet needs more room than a one-car garage has.
    </P>

    <H>Breaking Down a Full Sheet</H>
    <P>
      For that, a pair of <Term>sawhorses</Term> with a circular saw in the tool
      slot. The sheet lies still and the saw walks the cut, so length stops
      mattering — it is the only place in the shop a full sheet can be worked at
      all.
    </P>
    <P>
      It asks for more in return. The straightedge is clamped down for every cut
      and comes off again after, so a glue-up curing elsewhere can leave you
      short of clamps. The cut lands on a half-foot mark rather than an inch, so
      the piece still goes to the saw afterward for its finished size. And there
      is no bag on a pair of sawhorses: the whole cut ends up on the floor.
    </P>

    <Note>
      Cut the small side against the fence and let the offcut fall away — a long
      piece past the blade has nowhere to go.
    </Note>
  </>
);
