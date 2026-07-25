import React from "react";
import { Machine } from "../../game/Machine";
import { MachineManualLink, ToolRack } from "./racks";

/**
 * All that's left of a direct-feed machine's paperwork: the rack you fit a
 * jig or a dust bag into.
 *
 * Everything you do to actually *use* a jointer, planer, table saw or
 * miter saw is a key on the floor now — the switch, the settings, the
 * stock you set down, the trigger — and the machine wears hint chips
 * naming each one. Only fitting tooling is left, and that's a thing you do
 * once and forget, so it's fine behind a key.
 *
 * Machines with no tool slots get no sheet at all.
 */
export const ToolSheet: React.FC<{ machine: Machine }> = ({ machine }) => (
  <>
    <ToolRack machine={machine} />
    <p className="text-xs italic text-ink-fade">{machine.type.description}</p>
    <MachineManualLink machine={machine} />
  </>
);
