import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { H, Note, P, Term, UL } from "./elements";

export const MarketplaceArticle: React.FC = () => (
  <>
    <P>
      The Marketplace tab (<ShortcutKeys shortcut="nav-marketplace" />) is
      your phone: browse what the neighborhood wants, list what you've made.
      It's how the shop earns between commissions, and it never stops running
      — sales roll in while you work.
    </P>

    <H>Listings: You Set the Price</H>
    <P>
      Carry an item, list it, and name your price against the{" "}
      <Term>fair value</Term> hint. Every tick, each listing rolls a chance
      to sell, and three things move the odds:
    </P>
    <UL>
      <li>
        <Term>Price</Term> — under fair value moves fast, over it sits.
        Reputation buys pricing power: a trusted shop charges above fair
        value and still sells.
      </li>
      <li>
        <Term>Demand</Term> — each product category has an appetite. Flood
        the market with cutting boards and cutting boards slow down; variety
        keeps everything moving.
      </li>
      <li>
        <Term>Patience</Term> — a listing costs nothing to leave up, and you
        can reprice or delist any time. Delisting hands the item back.
      </li>
    </UL>

    <H>The Job Board</H>
    <P>
      Jobs are one-off requests — "four sanded oak boards, 3×4×1" — with a
      guaranteed price well above fair value, plus a tip for quick delivery.
      No pricing skill required: accept, build, deliver. The board refreshes
      daily. Jobs are the steady grind; listings are the higher ceiling for
      sharp pricing; commissions remain the big story paydays.
    </P>

    <H>Scavenging</H>
    <P>
      The errands note on the corkboard lists scavenging runs (
      <ShortcutKeys shortcut="scavenge" />): leave the shop, come back with
      free pallets. Time passes only in the shop, but your hands are gone for
      the trip — glue can cure and the planer can finish a pass while you're
      out.
    </P>

    <Note>The market pays for what it hasn't seen lately.</Note>
  </>
);
