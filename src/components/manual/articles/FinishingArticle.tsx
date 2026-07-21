import React from "react";
import { H, Note, P, Term } from "./elements";

export const FinishingArticle: React.FC = () => (
  <>
    <P>
      Surface quality is where the money hides. The market pays a premium for
      the same piece with a better surface — smooth beats rough, sanded beats
      smooth — and some work simply demands it: nobody wants a cutting board
      that gives them splinters.
    </P>

    <H>Sanding</H>
    <P>
      Sanding bumps a board or panel's surface one grade per pass: rough →
      smooth → sanded. It's a tool operation — mount a sanding block or a
      random orbit sander at any bench. The block and the sander do the exact
      same work; the sander just does it much faster. Remember that sanding
      only refines: it never flattens, straightens, or thins anything.
    </P>

    <H>Finishes Are Supplies</H>
    <P>
      Finishes live in the <Term>supplies cabinet</Term> — one shop-wide
      stock, alongside your nails — not in your hands. Buy them by the pack
      in the store's supplies aisle. A recipe that needs finish checks the
      cabinet before it starts and draws the amount the moment it does.
      There are no refunds; once the oil is out of the bottle, it's on the
      wood.
    </P>
    <P>
      The first finish you'll need is <Term>mineral oil</Term>: food-safe,
      simple, and the only finish a cutting board wants. The finishing step
      itself happens at a bench — a sanded panel plus oil in the cabinet
      becomes a finished board.
    </P>

    <Note>Oil the board, not the schedule. It goes on last, always.</Note>
  </>
);
