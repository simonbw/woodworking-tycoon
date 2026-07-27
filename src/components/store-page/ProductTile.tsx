import React from "react";
import { Tooltip } from "../Tooltip";
import { BuyButton } from "./BuyButton";

/**
 * The store's shelf unit: one square tile per SKU, laid out in the aisle
 * grids below. Everything a shopper compares at a glance — the picture,
 * the name, what's already in the shop, the price — is on the face; the
 * paragraph explaining what the thing does waits in the hover tooltip.
 * That's what keeps a whole store's inventory on one screen without a
 * scrollbar.
 */
export const ProductTile: React.FC<{
  name: string;
  /** The product picture. Sized by the caller; the tile reserves the row. */
  icon?: React.ReactNode;
  price: number;
  /** Hover copy: what it is and what it does, in a sentence or two. */
  info: React.ReactNode;
  /** One short line under the name — what the shop already has of this. */
  owned?: React.ReactNode;
  canAfford: boolean;
  onBuy: () => void;
  /** Routed to the delegated click-sound listener (e.g. "ui-purchase"). */
  sfx?: string;
}> = ({ name, icon, price, info, owned, canAfford, onBuy, sfx }) => (
  <Tooltip content={info}>
    <li className="product-card flex flex-col items-center gap-0.5 text-center">
      <span className="flex h-8 items-center justify-center">{icon}</span>
      <span className="text-[0.7rem] font-bold uppercase leading-tight tracking-wide text-ink-black">
        {name}
      </span>
      {owned && (
        <span className="text-[0.65rem] font-semibold leading-tight text-store-orange-dark tabular-nums">
          {owned}
        </span>
      )}
      <span className="mt-auto flex w-full items-center justify-between gap-1 pt-0.5">
        <PriceTag price={price} />
        <BuyButton
          size="compact"
          disabled={!canAfford}
          data-sfx={sfx}
          onClick={onBuy}
        >
          Buy
        </BuyButton>
      </span>
    </li>
  </Tooltip>
);

/** The shelf-edge price. Free stock is called out rather than priced $0.00. */
export const PriceTag: React.FC<{ price: number }> = ({ price }) =>
  price === 0 ? (
    <span className="price-tag text-store-orange-dark">FREE</span>
  ) : (
    <span className="price-tag">${price.toFixed(2)}</span>
  );
