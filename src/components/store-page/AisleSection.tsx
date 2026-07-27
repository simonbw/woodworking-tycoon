import React from "react";
import { classNames } from "../../utils/classNames";

/**
 * One aisle: its tag heading over a grid of ProductTiles. The grid packs
 * as many square tiles across as the column it's given will hold, so an
 * aisle grows sideways before it grows down and the whole store stays on
 * one screen as new SKUs unlock.
 */
export const AisleSection: React.FC<{
  title: string;
  className?: string;
  children: React.ReactNode;
}> = ({ title, className, children }) => (
  <section className={classNames("min-w-0", className)}>
    <h2 className="aisle-heading">{title}</h2>
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2">
      {children}
    </ul>
  </section>
);
