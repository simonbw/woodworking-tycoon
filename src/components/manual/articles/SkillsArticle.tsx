import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { H, Note, P, Term } from "./elements";

export const SkillsArticle: React.FC = () => (
  <>
    <P>
      Two ledgers track this shop's rise, and they measure different things.{" "}
      <Term>Skills</Term> are what you know how to make. <Term>Reputation</Term>{" "}
      is who trusts you to make it. They grow separately and unlock different
      doors.
    </P>

    <H>XP and Skill Points</H>
    <P>
      Craft XP comes from finishing things: completing a product earns XP
      equal to its worth (better pieces teach you more), and completing a
      commission adds a share of its payout. Levels follow an increasing
      curve, and each level grants one <Term>skill point</Term> — spend them
      in the tree on the Skills page (
      <ShortcutKeys shortcut="nav-skills" />).
    </P>

    <H>The Tree</H>
    <P>
      Every recipe belongs to a skill. The ones you can build on day one
      belong to <Term>starter skills</Term> — certificates you walked in
      with. A recipe whose skill you haven't earned is hidden at the bench
      entirely (no clutter where you work) and visible in the tree (that's
      where ambition lives). Some nodes unlock recipes; others are pure
      speed, like faster sanding or quicker glue cures.
    </P>

    <H>Reputation</H>
    <P>
      Reputation comes from commissions and happy buyers, and it opens
      demand-side doors: better lumber channels at the store — the
      lumberyard's S2S rack, then the cheap rough rack — and the pricing
      power to list above fair value and still sell. Skills make you
      capable; reputation makes you trusted. The shop needs both.
    </P>

    <Note>Nobody's born knowing end grain. Make more things.</Note>
  </>
);
