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
      bench to sand there: lean over the bench, take the tool down off the rail,
      and rub the piece down right where it lies. The two produce identical
      results; the sander is simply much faster. Sanding only refines the
      surface — it doesn't flatten, straighten, or thin the stock.
    </P>

    <H>The Finishing Kit</H>
    <P>
      Finishing is hand work, done with the <Term>finishing kit</Term> — rags,
      applicator pads, and a card scraper, sold on the store's Tool Wall and
      mounted at a bench like any other tool. Take the kit down off the rail and
      hold it over a fully sanded blank: the kit offers the finish the panel
      qualifies for, and rubbing the piece down where it lies turns it into the
      finished board. The wood decides the product — a single hardwood makes a
      plain cutting board, strict alternation makes a striped one.
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
      the standard finish for cutting boards. Hold the kit over a finished
      cutting board and wipe the oil on; it draws from the cabinet as the wipe
      starts, then soaks in on its own time.
    </P>

    <Note>Finish is the last step — sand before you oil.</Note>
  </>
);
