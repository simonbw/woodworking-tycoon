import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { H, Note, P, Term, UL } from "./elements";

export const MarketplaceArticle: React.FC = () => (
  <>
    <P>
      SawdustList — the local makers&rsquo; marketplace — lives on your phone (
      <ShortcutKeys shortcut="open-phone" /> or the Phone button up top). It's
      where the shop sells outside of commissions: list finished pieces at your
      own price, or take fixed-price jobs from the job board.
    </P>

    <H>Listings</H>
    <P>
      Carry an item to list it, and set your price against the{" "}
      <Term>fair value</Term> estimate. Listings sell on their own over time,
      and two things drive the odds:
    </P>
    <UL>
      <li>
        <Term>Price</Term> — below fair value sells quickly; above it sits. As
        your reputation grows, buyers accept higher prices.
      </li>
      <li>
        <Term>Demand</Term> — each product category has a limited appetite.
        Selling many cutting boards in a row softens the market for cutting
        boards; variety keeps everything moving.
      </li>
    </UL>
    <P>You can reprice or delist at any time; delisting returns the item.</P>

    <H>The Job Board</H>
    <P>
      Jobs are one-off requests — "four sanded oak boards, 3×4×1" — at a
      guaranteed price above fair value, with a tip for fast delivery. Accept,
      build, deliver. The board refreshes daily.
    </P>

    <Note>
      Demand recovers on its own — if one product stops selling, list something
      else for a while.
    </Note>
  </>
);
