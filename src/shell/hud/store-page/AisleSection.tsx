import React from "react";
import { classNames } from "../../../utils/classNames";

/** As many square tiles across as the column will hold. */
const PACKED = "repeat(auto-fill, minmax(5.5rem, 1fr))";

/**
 * One aisle: its tag heading over a grid of ProductTiles. By default the
 * grid packs as many tiles across as the column it's given will hold, so
 * an aisle grows sideways before it grows down and the whole store stays
 * on one screen as new SKUs unlock. An aisle can override that with a
 * fixed track count — a shelf six across under the lumber racks, two
 * across for the machines, whose photos earn the room.
 */
export const AisleSection: React.FC<{
  title: string;
  /** `grid-template-columns` for the shelf. Defaults to packed tiles. */
  template?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ title, template = PACKED, className, children }) => (
  <section className={classNames("min-w-0", className)}>
    <h2 className="aisle-heading">{title}</h2>
    <ul className="grid gap-2" style={{ gridTemplateColumns: template }}>
      {children}
    </ul>
  </section>
);
