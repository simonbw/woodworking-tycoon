import React from "react";

export const StoreSellingSection: React.FC = () => {
  return (
    <section>
      <h2 className="aisle-heading">Customer Service</h2>
      <div className="product-card text-center py-8">
        <p className="font-stencil uppercase tracking-widest text-store-orange-dark">
          Returns &amp; Sales
        </p>
        <p className="text-xs text-ink-fade font-typewriter mt-2">
          Selling something? Set up a Sales Table in your own shop — aisle
          two, next to the garbage cans.
        </p>
      </div>
    </section>
  );
};
