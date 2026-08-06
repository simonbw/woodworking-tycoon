import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { H, Note, P, Term } from "./elements";

export const WorkbenchesArticle: React.FC = () => (
  <>
    <P>
      Hand work happens at a workbench. Press{" "}
      <ShortcutKeys shortcut="open-station-sheet" /> at one to lean over its
      top; tools hang on the rail above it, and the work lies where you put it.
      The makeshift workbench has two tool slots. Built worktables have three to
      six, depending on size.
    </P>

    <H>Tools</H>
    <P>
      Tools are sold on the store's <Term>Tool Wall</Term>. Carry one to a bench
      and an empty hook on the rail takes it; unmounting puts it back in your
      hands. Higher-tier tools do the same work faster: the random orbit sander
      sands like the sanding block, and the hand plane flattens like the
      jointer.
    </P>

    <H>Sanding and Finishing</H>
    <P>
      Sanding raises a surface one grade per pass: rough → smooth → sanded. Take
      the block or sander down off the rail and rub the piece where it lies. The{" "}
      <Term>finishing kit</Term> works the same way on a fully sanded blank,
      turning it into the finished board the wood qualifies for. Finishes like
      mineral oil are shop supplies, bought by the pack at the store and kept in
      the supplies cabinet.
    </P>
    <Note>Finish is the last step — sand before you oil.</Note>

    <H>Glue-Ups</H>
    <P>
      Gluing boards edge to edge makes a panel wider than any board you can buy.
      Lay <Term>bar clamps</Term> out on the bench top, one per foot of length
      and at least two. Lay milled boards across them edge to edge (edges
      jointed, faces planed, one thickness, one length), run a bead of glue down
      each seam, and press each clamp to wind it tight. The last clamp starts
      the cure. The panel cures in its clamps while you do other work, comes out
      rough, and frees its clamps when it's done. Clamps are sold in the store's
      supplies aisle.
    </P>
    <Note>Glue dries faster than a bench frees up — buy clamps in pairs.</Note>

    <H>Jigs</H>
    <P>
      Jigs like the <Term>crosscut sled</Term> and{" "}
      <Term>straight-line sled</Term> are built at a bench from plywood and
      scrap, and mount on the machines they fit. The sled recipes come with the
      Jigs &amp; Fixtures skill.
    </P>
  </>
);
