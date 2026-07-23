import React from "react";
import { H, Note, P, Term } from "./elements";

export const ToolsArticle: React.FC = () => (
  <>
    <P>
      Workstations have <Term>tool slots</Term>. Mounting a handheld tool adds
      that tool's operations to the station — a bench with a sanding block
      mounted can sand; unmount the block and it can't.
    </P>

    <H>Buying and Mounting</H>
    <P>
      Tools are sold on the store's <Term>Tool Wall</Term>. A tool has to be
      mounted somewhere before it can be used; mount and unmount from the
      station's card while standing at it. The makeshift workbench has two
      slots. Built worktables have three to six, depending on size.
    </P>

    <H>Tool Tiers</H>
    <P>
      Higher-tier tools work faster, not differently. The $10 sanding block and
      the $120 random orbit sander perform the same operations — the sander is
      just several times quicker. Likewise, the $35 hand plane does the same
      flattening work as the jointer, at a fraction of the price and several
      times the time.
    </P>

    <H>Jigs</H>
    <P>
      Some tools are built rather than bought. Jigs like the{" "}
      <Term>crosscut sled</Term> and <Term>straight-line sled</Term> are made at
      a bench from plywood and scrap, and they mount only on the machines they
      fit — both sleds ride the table saw, where the mounted sled determines
      what feeding a piece will do. The sled recipes come with the Jigs &amp;
      Fixtures skill.
    </P>

    <Note>
      Jigs are built from plywood and offcuts — keep some scrap around.
    </Note>
  </>
);
