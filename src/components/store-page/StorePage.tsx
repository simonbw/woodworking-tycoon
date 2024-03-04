import React from "react";
import { NavBar } from "../NavBar";
import { BoardSelector } from "./BoardSelector";
import { StoreMachinesSection } from "./StoreMachinesSection";
import { StoreMaterialSection } from "./StoreMaterialSection";
import { StoreSellingSection } from "./StoreSellingSection";

export const StorePage: React.FC = () => {
  return (
    <main className="p-8 space-y-6">
      <NavBar />

      <div className="grid grid-cols-3">
        <section className="space-y-8">
          <BoardSelector />
          <StoreMaterialSection />
        </section>
        <StoreMachinesSection />
        <StoreSellingSection />
      </div>
    </main>
  );
};
