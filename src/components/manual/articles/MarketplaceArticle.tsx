import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { H, Note, P, Term, UL } from "./elements";

export const MarketplaceArticle: React.FC = () => (
  <>
    <P>
      SawdustList — the local makers&rsquo; marketplace — lives on your phone (
      <ShortcutKeys shortcut="open-phone" /> or the Phone button up top). It's
      where the shop sells outside of commissions: list finished pieces at your
      own price, or take fixed-price jobs from the job board. Time keeps passing
      while you scroll, and sales keep rolling in while you work.
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
    <P>
      A listing costs nothing to keep up, and you can reprice or delist at any
      time. Delisting returns the item.
    </P>

    <H>The Job Board</H>
    <P>
      Jobs are one-off requests — "four sanded oak boards, 3×4×1" — at a
      guaranteed price above fair value, with a tip for fast delivery. Accept,
      build, deliver. The board refreshes daily.
    </P>

    <H>Scavenging</H>
    <P>
      Walk to the garage door and it lists places to go, each with a number
      key — including a scavenging run: leave the shop and come back with free
      pallets. The shop keeps running while you're out — glue keeps curing and
      machines finish their passes — but you can't do anything else until
      you're back.
    </P>

    <Note>
      Demand recovers on its own — if one product stops selling, list something
      else for a while.
    </Note>
  </>
);
