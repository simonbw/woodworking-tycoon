import React from "react";
import { FloorListSection } from "./FloorListSection";
import { InventorySection } from "./InventorySection";
import { MachineListSection } from "./MachineListSection";

export const CurrentCellInfo: React.FC = () => {
  return (
    <div className="space-y-4">
      <MachineListSection />
      <FloorListSection />
      <InventorySection />
    </div>
  );
};
