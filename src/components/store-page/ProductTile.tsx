import React from "react";
import { Tooltip } from "../Tooltip";
import { BuyButton } from "./BuyButton";

/**
 * The store's shelf unit: one square tile per SKU, laid out in the aisle
 * grids below. Everything a shopper compares at a glance — the picture,
 * the name, what's already in the shop, the price — is on the face; the
 * paragraph explaining what the thing does waits behind the ⓘ in the
 * corner. That's what fits a whole store's inventory in a window at all.
 */
export const ProductTile: React.FC<{
  name: string;
  /** The product picture. Sized by the caller; the tile reserves the row. */
  icon?: React.ReactNode;
  price: number;
  /** Behind the ⓘ: what it is and what it does, in a sentence or two. */
  info: React.ReactNode;
  /** One short line under the name — what the shop already has of this. */
  owned?: React.ReactNode;
  canAfford: boolean;
  onBuy: () => void;
  /** Routed to the delegated click-sound listener (e.g. "ui-purchase"). */
  sfx?: string;
}> = ({ name, icon, price, info, owned, canAfford, onBuy, sfx }) => (
  // The picture centers over the tile, the words hang off its left edge
  // — the way a shelf tag is printed.
  <li className="product-card relative flex flex-col items-stretch gap-0.5 text-left">
    <InfoButton name={name} info={info} />
    {/* min-h rather than h: the picture sets the row, so an aisle of
        big machine photos can breathe without dragging the tool wall's
        icons up to the same size */}
    <span className="flex min-h-8 items-center justify-center">{icon}</span>
    {/* Set in the condensed face at reading weight rather than bold:
        at this size every tag on the wall shouting at once is just
        noise, and the price is the thing that should be loud. */}
    <span className="text-[0.95rem] uppercase leading-tight tracking-wide text-ink-black">
      {name}
    </span>
    {owned && (
      <span className="text-[0.7rem] font-semibold leading-tight text-store-orange-dark tabular-nums">
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
);

/**
 * The ⓘ in the tile's top corner: the one thing on the tile that opens
 * the hover copy. The whole tile used to be the trigger, which meant the
 * description ambushed you every time the pointer crossed an aisle on
 * its way to the Buy button. Reading it is now something you ask for —
 * point at the badge, or click it and it stays up until you click away.
 */
const InfoButton: React.FC<{ name: string; info: React.ReactNode }> = ({
  name,
  info,
}) => (
  <Tooltip content={info} clickable delay={80}>
    <button
      type="button"
      aria-label={`About ${name}`}
      className="absolute right-1 top-1 z-10 grid size-4 place-items-center rounded-full border border-store-concrete-dark bg-white/80 font-serif text-[0.65rem] italic leading-none text-ink-fade hover:border-store-orange hover:text-store-orange"
    >
      i
    </button>
  </Tooltip>
);

/**
 * The shelf-edge price, set the way a big-box store sets one: the dollars
 * big, the sign and the cents small and raised off the top. Free stock is
 * called out rather than priced $0.00.
 *
 * Split across three spans it reads "one zero zero zero" aloud, so the
 * whole price is also written out for a screen reader and the display
 * type is hidden from one.
 */
export const PriceTag: React.FC<{ price: number }> = ({ price }) => {
  if (price === 0) {
    return <span className="price-tag text-store-orange-dark">FREE</span>;
  }
  const dollars = Math.floor(price);
  const cents = Math.round((price - dollars) * 100)
    .toString()
    .padStart(2, "0");
  return (
    <span className="price-tag">
      <span className="sr-only">${price.toFixed(2)}</span>
      <span aria-hidden className="text-[1.4em] leading-none">
        <sup className="text-[0.5em]">$</sup>
        {dollars}
        <sup className="text-[0.5em]">{cents}</sup>
      </span>
    </span>
  );
};
