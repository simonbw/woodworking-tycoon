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
      Tools are sold on the store's <Term>Tool Wall</Term>. A bought tool rides
      home in the truck's bed like any other purchase: lift it out at the
      tailgate, carry it to the station, and mount it from the station's card
      while standing there. Unmounting puts the tool back in your hands — set
      it down, shelve it, or carry it to another station. The makeshift
      workbench has two slots. Built worktables have three to six, depending
      on size.
    </P>

    <H>Tool Tiers</H>
    <P>
      Higher-tier tools work faster, not differently. The $10 sanding block and
      the $80 random orbit sander perform the same operations — the sander is
      just several times quicker. Likewise, the $35 hand plane does the same
      flattening work as the jointer, at a fraction of the price and several
      times the time.
    </P>

    <H>Jigs</H>
    <P>
      Some tools are built rather than bought. Jigs like the{" "}
      <Term>crosscut sled</Term> and <Term>straight-line sled</Term> are made at
      a bench from plywood and scrap, and come off the bench like any other
      output. They mount only on the machines they fit — both sleds ride the
      table saw, where the mounted sled determines what feeding a piece will
      do. The sled recipes come with the Jigs &amp; Fixtures skill.
    </P>

    <Note>
      Jigs are built from plywood and offcuts — keep some scrap around.
    </Note>
  </>
);
