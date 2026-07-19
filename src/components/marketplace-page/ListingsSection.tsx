import React, { useState } from "react";
import { MarketListing } from "../../game/GameState";
import {
  delistItemAction,
  listItemAction,
  repriceListingAction,
} from "../../game/game-actions/marketplace-actions";
import { ListingInterest, listingInterest } from "../../game/marketplace";
import { getMaterialName } from "../../game/material-helpers";
import { getSellValue } from "../../game/material-values";
import { MaterialInstance } from "../../game/Materials";
import { TICKS_PER_DAY } from "../../game/time";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The "For Sale" pane: active listings with their interest level, and the
 * player's inventory ready to be priced and listed.
 */
export const ListingsSection: React.FC = () => {
  const gameState = useGameState();
  const sellable = gameState.player.inventory.filter(
    (material) => getSellValue(material) > 0,
  );

  return (
    <section className="space-y-4">
      <h2 className="font-condensed font-bold uppercase tracking-[0.2em] text-sm border-b-2 border-ink-black/20 pb-1">
        For Sale
      </h2>

      {gameState.listings.length === 0 ? (
        <p className="text-sm italic text-ink-fade">
          Nothing listed yet. Price something below and see who bites.
        </p>
      ) : (
        <ul className="space-y-2">
          {gameState.listings.map((listing) => (
            <ListingRow key={listing.id} listing={listing} />
          ))}
        </ul>
      )}

      <h3 className="font-condensed font-semibold uppercase tracking-[0.15em] text-xs text-ink-fade pt-2">
        List an item
      </h3>
      {sellable.length === 0 ? (
        <p className="text-sm italic text-ink-fade">
          Nothing sellable in your inventory. Go make something.
        </p>
      ) : (
        <ul className="space-y-2">
          {sellable.map((material) => (
            <ListItemRow key={material.id} material={material} />
          ))}
        </ul>
      )}
    </section>
  );
};

const INTEREST_STYLE: Record<ListingInterest, string> = {
  "priced to move": "text-ink-blue",
  "should sell soon": "text-ink-blue/80",
  "expect a wait": "text-ink-fade",
  ambitious: "text-ink-red",
};

const InterestTag: React.FC<{
  material: MaterialInstance;
  askingPrice: number;
}> = ({ material, askingPrice }) => {
  const gameState = useGameState();
  if (!(askingPrice > 0)) {
    return null;
  }
  const interest = listingInterest(
    material,
    askingPrice,
    gameState.reputation,
    gameState.categoryDemand,
  );
  return (
    <span
      className={`font-condensed uppercase tracking-wider text-xs ${INTEREST_STYLE[interest]}`}
    >
      {interest}
    </span>
  );
};

/** Shared price editor: a dollar input the row actions read from. */
const PriceInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  return (
    <span className="font-mono text-sm whitespace-nowrap">
      ${" "}
      <input
        type="number"
        min="0.01"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 px-1 py-0.5 border border-ink-black/30 rounded-sm bg-white font-mono text-sm text-ink-black tabular-nums"
      />
    </span>
  );
};

const ListingRow: React.FC<{ listing: MarketListing }> = ({ listing }) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const [price, setPrice] = useState(listing.askingPrice.toFixed(2));
  const parsedPrice = parseFloat(price);
  const priceChanged =
    Number.isFinite(parsedPrice) && parsedPrice !== listing.askingPrice;
  const daysListed = Math.floor(
    (gameState.tick - listing.listedAtTick) / TICKS_PER_DAY,
  );

  return (
    <li className="bg-white border border-ink-black/15 rounded-sm p-2 space-y-1 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">{getMaterialName(listing.material)}</span>
        <InterestTag
          material={listing.material}
          askingPrice={priceChanged ? parsedPrice : listing.askingPrice}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-ink-fade">
        <span>
          fair value ${getSellValue(listing.material).toFixed(2)} ·{" "}
          {daysListed === 0
            ? "listed today"
            : `up ${daysListed} day${daysListed === 1 ? "" : "s"}`}
        </span>
        <span className="flex items-center gap-1">
          <PriceInput value={price} onChange={setPrice} />
          {priceChanged && (
            <button
              className="button-paper text-xs"
              onClick={() =>
                applyAction(repriceListingAction(listing.id, parsedPrice))
              }
            >
              Reprice
            </button>
          )}
          <button
            className="button-paper text-xs"
            onClick={() => applyAction(delistItemAction(listing.id))}
          >
            Take Down
          </button>
        </span>
      </div>
    </li>
  );
};

const ListItemRow: React.FC<{ material: MaterialInstance }> = ({
  material,
}) => {
  const applyAction = useApplyGameAction();
  const fairValue = getSellValue(material);
  const [price, setPrice] = useState(fairValue.toFixed(2));
  const parsedPrice = parseFloat(price);
  const priceValid = Number.isFinite(parsedPrice) && parsedPrice > 0;

  return (
    <li className="bg-paper-cream border border-ink-black/10 rounded-sm p-2 space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">{getMaterialName(material)}</span>
        {priceValid && (
          <InterestTag material={material} askingPrice={parsedPrice} />
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-ink-fade">
        <span>fair value ${fairValue.toFixed(2)}</span>
        <span className="flex items-center gap-1">
          <PriceInput value={price} onChange={setPrice} />
          <button
            className="button-paper text-xs"
            disabled={!priceValid}
            onClick={() => applyAction(listItemAction(material, parsedPrice))}
          >
            List
          </button>
        </span>
      </div>
    </li>
  );
};
