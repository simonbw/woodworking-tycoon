import React from "react";
import { ShortcutKeys } from "../../shortcuts/Kbd";
import { H, Note, P, Term } from "./elements";

export const SellingArticle: React.FC = () => (
  <>
    <P>
      Finished work sells off the <Term>for-sale stand</Term>, the little table
      with the hand-written sign at the end of the driveway. Carry a piece down
      and press <ShortcutKeys shortcut="put-down" /> beside the table to set it
      out. People walking by stop to look, and one who likes a piece buys it on
      the spot: the money and a bit of reputation arrive the moment it sells,
      wherever you are.
    </P>
    <P>
      Each piece sells for what it's worth — better materials, cleaner surfaces,
      and a coat of finish all raise the price. Press{" "}
      <ShortcutKeys shortcut="pick-up" /> at the table to take a piece back.
    </P>

    <H>Reputation</H>
    <P>
      Every sale spreads word of the shop. Reputation opens better lumber
      sources: keep selling and the hardwood suppliers start returning your
      calls.
    </P>

    <Note>
      Raw boards never sell. Around here folks pay for the work, not the wood.
    </Note>
  </>
);
