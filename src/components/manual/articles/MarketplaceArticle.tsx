import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { H, Note, P, Term, UL } from "./elements";

export const MarketplaceArticle: React.FC = () => (
  <>
    <P>
      SawdustList, the local makers&rsquo; marketplace, lives on your phone (
      <ShortcutKeys shortcut="open-phone" /> or the Phone button up top). List
      finished pieces there at your own price, or take fixed-price jobs from the
      job board.
    </P>

    <H>Listings</H>
    <P>
      Carry a finished piece to list it, and set your price against the{" "}
      <Term>fair value</Term> estimate. Wood itself never sells — lumber,
      panels, and pallets have a price on the way in and none on the way out, so
      spare stock is yours to build with or toss in the garbage can. Listings
      sell on their own over time, and two things drive the odds:
    </P>
    <UL>
      <li>
        <Term>Price</Term> — below fair value sells quickly; above it sits. As
        your reputation grows, buyers accept higher prices.
      </li>
      <li>
        <Term>Demand</Term> — buyers only want so many of one product. Selling
        many cutting boards in a row softens that market; variety keeps
        everything moving.
      </li>
    </UL>
    <P>You can reprice or delist at any time; delisting returns the item.</P>

    <H>The Job Board</H>
    <P>
      Jobs are one-off requests ("two reclaimed-wood frames, mitered corners")
      at a guaranteed price above fair value, with a tip for fast delivery. Like
      listings, they only ever ask for finished work. New gear brings new jobs —
      as the pieces it lets you build. The board refreshes daily.
    </P>

    <Note>
      Demand recovers on its own — if one product stops selling, list something
      else for a while.
    </Note>
  </>
);
