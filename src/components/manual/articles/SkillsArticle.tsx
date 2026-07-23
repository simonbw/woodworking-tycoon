import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { H, Note, P, Term } from "./elements";

export const SkillsArticle: React.FC = () => (
  <>
    <P>
      <Term>Skills</Term> determine what you know how to build.{" "}
      <Term>Reputation</Term> determines who's willing to hire you. They're
      earned separately and unlock different things.
    </P>

    <H>XP and Skill Points</H>
    <P>
      Craft XP comes from completed work: finishing a product earns XP equal to
      its value, and completing a commission adds a share of its payout. Each
      level grants one <Term>skill point</Term> to spend in the tree in your
      journal (<ShortcutKeys shortcut="open-journal" /> or the Journal button up
      top).
    </P>

    <H>The Skill Tree</H>
    <P>
      Every recipe belongs to a skill; the ones available from the start belong
      to your starter skills. Recipes for skills you haven't learned yet don't
      show up at the bench, but you can preview them in the tree. Some nodes
      unlock new recipes; others speed up work you already do, like faster
      sanding or quicker glue cures.
    </P>

    <H>Reputation</H>
    <P>
      Reputation comes from completed commissions and marketplace sales. It
      unlocks better lumber channels at the store — first the S2S rack, then
      cheap rough-sawn stock — and lets you price listings above fair value and
      still sell.
    </P>

    <Note>
      XP scales with value — bigger pieces and commissions level you fastest.
    </Note>
  </>
);
