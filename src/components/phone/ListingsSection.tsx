import React, { useState } from "react";
import { MarketListing } from "../../game/GameState";
import {
  delistItemAction,
  listItemsAction,
  repriceListingAction,
} from "../../game/game-actions/marketplace-actions";
import {
  ListingInterest,
  listingCount,
  listingGroupKey,
  listingInterest,
  listingItem,
} from "../../game/marketplace";
import { formatCount, formatMoney } from "../../utils/formatNumber";
import { MaterialLabel } from "../MaterialLabel";
import { getSellValue } from "../../game/material-values";
import { MaterialInstance } from "../../game/Materials";
import { handSpaceLeft } from "../../game/Person";
import { TICKS_PER_CALENDAR_DAY } from "../../game/time";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The "For Sale" pane of the phone: active listings with their interest
 * level, and the player's inventory ready to be priced and listed. The
 * phone's tab bar provides the pane's title.
 */
export const ListingsSection: React.FC = () => {
  const gameState = useGameState();
  const sellable = groupSellable(gameState.player.inventory);

  return (
    <section className="space-y-4">
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
          {sellable.map((group) => (
            <ListItemRow key={group[0].id} materials={group} />
          ))}
        </ul>
      )}
    </section>
  );
};

/**
 * Sellable inventory collapsed into offers: identical pieces share one row
 * so they can be priced once and listed together, rather than repeating a
 * row per piece.
 */
function groupSellable(
  inventory: ReadonlyArray<MaterialInstance>,
): MaterialInstance[][] {
  const groups = new Map<string, MaterialInstance[]>();
  for (const material of inventory) {
    if (getSellValue(material) <= 0) {
      continue;
    }
    const key = listingGroupKey(material);
    const group = groups.get(key);
    if (group) {
      group.push(material);
    } else {
      groups.set(key, [material]);
    }
  }
  return [...groups.values()];
}

/** "×3" on a stacked offer; nothing at all on a single piece. */
const StackTag: React.FC<{ count: number }> = ({ count }) => {
  if (count < 2) {
    return null;
  }
  return (
    <span className="font-condensed text-xs tabular-nums text-ink-fade shrink-0">
      ×{formatCount(count)}
    </span>
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
    <span className="text-sm tabular-nums whitespace-nowrap">
      ${" "}
      <input
        type="number"
        min="0.01"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 px-1 py-0.5 border border-ink-black/30 rounded-sm bg-white text-sm text-ink-black tabular-nums"
      />
    </span>
  );
};

const ListingRow: React.FC<{ listing: MarketListing }> = ({ listing }) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  // Seeds a number input that is parsed back with parseFloat, so this one
  // stays bare — a thousands separator from formatMoney would not survive
  // the round trip.
  const [price, setPrice] = useState(listing.askingPrice.toFixed(2));
  const parsedPrice = parseFloat(price);
  const priceChanged =
    Number.isFinite(parsedPrice) && parsedPrice !== listing.askingPrice;
  const daysListed = Math.floor(
    (gameState.tick - listing.listedAtTick) / TICKS_PER_CALENDAR_DAY,
  );
  const material = listingItem(listing);
  const count = listingCount(listing);
  // Whatever the arms can still take, up to the whole stack — a full-handed
  // player can't pull anything back.
  const takeable = Math.min(count, handSpaceLeft(gameState.player));

  return (
    <li className="bg-white border border-ink-black/15 rounded-sm p-2 space-y-1 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <MaterialLabel material={material} />
        <StackTag count={count} />
        <InterestTag
          material={material}
          askingPrice={priceChanged ? parsedPrice : listing.askingPrice}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-ink-fade">
        <span>
          fair value {formatMoney(getSellValue(material))}
          {count > 1 ? " each" : ""} ·{" "}
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
            disabled={takeable === 0}
            title={
              takeable === 0
                ? "Hands full — the pieces come back into your arms"
                : takeable < count
                  ? `Only ${formatCount(takeable)} will fit in your arms`
                  : undefined
            }
            onClick={() => applyAction(delistItemAction(listing.id, takeable))}
          >
            {takeable > 1 ? `Take Down ×${formatCount(takeable)}` : "Take Down"}
          </button>
        </span>
      </div>
    </li>
  );
};

const ListItemRow: React.FC<{ materials: MaterialInstance[] }> = ({
  materials,
}) => {
  const applyAction = useApplyGameAction();
  const material = materials[0];
  const count = materials.length;
  const fairValue = getSellValue(material);
  // Bare for the same reason as the listing row's field above: this is
  // input text, not a readout.
  const [price, setPrice] = useState(fairValue.toFixed(2));
  const parsedPrice = parseFloat(price);
  const priceValid = Number.isFinite(parsedPrice) && parsedPrice > 0;

  return (
    <li className="bg-paper-cream border border-ink-black/10 rounded-sm p-2 space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <MaterialLabel material={material} />
        <StackTag count={count} />
        {priceValid && (
          <InterestTag material={material} askingPrice={parsedPrice} />
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-ink-fade">
        <span>
          fair value {formatMoney(fairValue)}
          {count > 1 ? " each" : ""}
        </span>
        <span className="flex items-center gap-1">
          <PriceInput value={price} onChange={setPrice} />
          <button
            className="button-paper text-xs"
            disabled={!priceValid}
            onClick={() => applyAction(listItemsAction(materials, parsedPrice))}
          >
            {count > 1 ? `List ×${formatCount(count)}` : "List"}
          </button>
        </span>
      </div>
    </li>
  );
};
