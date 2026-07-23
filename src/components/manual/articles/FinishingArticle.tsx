import React from "react";
import { H, Note, P, Term } from "./elements";

export const FinishingArticle: React.FC = () => (
  <>
    <P>
      Surface quality affects value: the market pays more for the same piece
      with a better surface, and some commissions call for a specific one — a
      cutting board has to be sanded and oiled.
    </P>

    <H>Sanding</H>
    <P>
      Sanding raises a board or panel's surface one grade per pass: rough →
      smooth → sanded. Mount a sanding block or a random orbit sander at any
      bench to sand there. The two produce identical results; the sander is
      simply much faster. Sanding only refines the surface — it doesn't flatten,
      straighten, or thin the stock.
    </P>

    <H>Buying and Using Finishes</H>
    <P>
      Finishes are shop supplies, like nails: they're kept in the{" "}
      <Term>supplies cabinet</Term> as a single shop-wide stock, and bought by
      the pack in the store's supplies aisle. A recipe that calls for finish
      checks the cabinet before starting and draws what it needs.
    </P>
    <P>
      The first finish you'll need is <Term>mineral oil</Term> — food-safe, and
      the standard finish for cutting boards. Finishing happens at a bench: a
      sanded panel plus oil from the cabinet becomes a finished piece.
    </P>

    <Note>Finish is the last step — sand before you oil.</Note>
  </>
);
