import React from "react";
import { useUiMode } from "./UiMode";

export const StorePage: React.FC = () => {
  const { setMode } = useUiMode();
  return (
    <main className="p-8 space-y-6">
      <header className="flex gap-2 items-center">
        <img src="/images/favicon-3.png" className="relative w-16 top-1" />
        <h1 className="font-heading font-bold text-5xl tracking-wide">Store</h1>
      </header>

      <button className="button" onClick={() => setMode({ mode: "normal" })}>
        Back
      </button>

      <div className="grid grid-cols-3">
        <section>
          <h2 className="section-heading">Materials</h2>
        </section>
        <section>
          <h2 className="section-heading">Machines</h2>
        </section>
        <section>
          <h2 className="section-heading">Sell</h2>
        </section>
      </div>
    </main>
  );
};
