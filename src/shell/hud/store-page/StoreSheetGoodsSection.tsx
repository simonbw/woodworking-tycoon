import React from "react";
import { classNames } from "../../../utils/classNames";
import { SheetGoodsShelf } from "./SheetGoodsShelf";

/**
 * The website's sheet-good aisle: its heading over the shelf (see
 * SheetGoodsShelf.tsx).
 */
export const StoreSheetGoodsSection: React.FC<{ className?: string }> = ({
  className,
}) => (
  // Two rows of three under the lumber racks: sheets are the widest
  // thing the store sells and their tiles get the room to say so,
  // rather than a single thin shelf running the rack's whole width
  <section className={classNames("min-w-0", className)}>
    <h2 className="aisle-heading">Sheet Goods</h2>
    <SheetGoodsShelf className="grid grid-cols-3 gap-2" />
  </section>
);
