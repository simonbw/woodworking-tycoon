import React from "react";
import { CommissionsSection } from "./CommissionsSection";
import { ErrandsSection } from "./ErrandsSection";

/**
 * One corkboard holding everything there is to do: the active commission's
 * work order and the errands note, each pinned as its own piece of paper.
 */
export const JobBoard: React.FC = () => (
  <section className="space-y-3">
    <h2 className="section-heading">Job Board</h2>
    <div className="bg-corkboard-dark rounded-md p-4 shadow-inner border border-black/40 corkboard-bg space-y-5">
      <CommissionsSection />
      <ErrandsSection />
    </div>
  </section>
);
