import React from "react";
import { CommissionsSection } from "./CommissionsSection";
import { ErrandsSection } from "./ErrandsSection";

/**
 * One corkboard holding everything there is to do: the active commission's
 * work order and the errands note, each pinned as its own piece of paper.
 * No label — a corkboard full of work orders explains itself.
 */
export const JobBoard: React.FC = () => (
  <section className="bg-corkboard-dark rounded-md p-4 shadow-inner border border-black/40 corkboard-bg space-y-5">
    <CommissionsSection />
    <ErrandsSection />
  </section>
);
