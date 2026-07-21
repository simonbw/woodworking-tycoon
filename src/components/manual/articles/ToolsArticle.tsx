import React from "react";
import { H, Note, P, Term } from "./elements";

export const ToolsArticle: React.FC = () => (
  <>
    <P>
      A bench is only as smart as what's bolted to it. Workstations have{" "}
      <Term>tool slots</Term>, and mounting a handheld tool teaches the
      station that tool's operations — a bench with a sanding block mounted
      knows how to sand; take the block away and it forgets.
    </P>

    <H>Buying and Mounting</H>
    <P>
      Tools come from the store's <Term>Tool Wall</Term>. A tool you own but
      haven't mounted sits in storage doing nothing; mount and unmount from
      the station's card while you're standing at it. The makeshift workbench
      has two slots; proper worktables have three to six, by size — one more
      reason to build real benches.
    </P>

    <H>Better Tools Buy Time, Not Recipes</H>
    <P>
      Tiers never gate what you can make — only how long it takes. The $10
      sanding block and the $120 random orbit sander perform the same
      operations; the sander is just several times faster. The $35 hand plane
      does the jointer's flattening work at a fraction of the price and a
      multiple of the time. Spend money to convert it into throughput when
      the waiting starts to hurt.
    </P>

    <H>Jigs: Tools You Build</H>
    <P>
      Some tools are never sold. Jigs like the <Term>crosscut sled</Term> and
      the <Term>straight-line sled</Term> are built at a bench from plywood
      and scrap, and they mount only where they fit — both ride the table
      saw, where the sled you've mounted decides what feeding a piece will
      do. The sleds come with the Jigs &amp; Fixtures skill; building shop
      furniture for the shop is half of woodworking.
    </P>

    <Note>Ten dollars of sandpaper beats a hundred dollars of waiting —
    until it doesn't.</Note>
  </>
);
