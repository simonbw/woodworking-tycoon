import React from "react";
import { AwayNote } from "./AwayNote";
import { CommissionsSection } from "./CommissionsSection";

/**
 * One corkboard holding everything there is to do: the active commission's
 * work order, plus a "back soon" note while the player is out on a trip.
 * No label — a corkboard full of work orders explains itself. (Errands
 * themselves start at the garage door — see DoorPrompt.)
 */
export const JobBoard: React.FC = () => (
  <section className="bg-corkboard-dark rounded-md p-4 shadow-inner border border-black/40 corkboard-bg space-y-5">
    <CommissionsSection />
    <AwayNote />
  </section>
);
