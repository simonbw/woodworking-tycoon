import React, { useMemo, useState } from "react";
import { Species } from "../../game/Materials";
import { board } from "../../game/board-helpers";
import { buyMaterialAction } from "../../game/game-actions/store-actions";
import { getBoardBuyPrice } from "../../game/material-values";
import {
  getMaterialName,
  materialMeetsInput,
} from "../../game/material-helpers";
import { humanizeString } from "../../utils/humanizeString";
import {
  LumberChannel,
  LumberSku,
  unlockedLumberChannels,
} from "../../game/lumberStock";
import { MaterialIcon } from "../current-cell-info/MaterialIcon";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The lumber aisle, one section per purchase channel (see lumberStock.ts).
 * Locked channels are completely absent — new sections appear as
 * reputation grows. No custom cutting anywhere: milling stock down to what
 * a project needs is the game.
 */
export const BoardSelector: React.FC = () => {
  const gameState = useGameState();
  const channels = unlockedLumberChannels(gameState.reputation);

  return (
    <section>
      <h2 className="aisle-heading">Lumber</h2>
      <div className="space-y-4">
        {channels.map((channel) => (
          <LumberChannelSection key={channel.id} channel={channel} />
        ))}
      </div>
    </section>
  );
};

const LumberChannelSection: React.FC<{ channel: LumberChannel }> = ({
  channel,
}) => {
  const [species, setSpecies] = useState<Species>(channel.species[0]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-stencil uppercase tracking-wide text-sm text-ink-black">
          {channel.name}
        </h3>
        {channel.species.length > 1 && (
          <select
            className="bg-paper-ivory border border-ink-black/30 text-ink-black px-2 py-0.5 rounded font-condensed text-sm"
            value={species}
            onChange={(e) => setSpecies(e.target.value as Species)}
          >
            {channel.species.map((s) => (
              <option key={s} value={s}>
                {humanizeString(s)}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="text-xs text-ink-fade font-typewriter mb-1">
        {channel.tagline}
      </p>
      <ul className="space-y-2">
        {channel.skus.map((sku) => (
          <LumberSkuCard
            key={`${sku.length}x${sku.width}x${sku.thickness}`}
            sku={sku}
            species={species}
            channel={channel}
          />
        ))}
      </ul>
    </div>
  );
};

const LumberSkuCard: React.FC<{
  sku: LumberSku;
  species: Species;
  channel: LumberChannel;
}> = ({ sku, species, channel }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const makeBoard = () =>
    board(species, sku.length, sku.width, sku.thickness, channel.surface, {
      faces: channel.jointedFaces,
      edges: channel.jointedEdges,
    });

  const material = useMemo(makeBoard, [species, sku, channel]);
  const price = getBoardBuyPrice(material, channel.priceMultiplier);

  const numberOwned = gameState.player.inventory.filter((m) =>
    materialMeetsInput(m, {
      type: ["board"],
      species: [species],
      length: [sku.length],
      width: [sku.width],
      thickness: [sku.thickness],
      surface: [channel.surface],
      jointedFaces: [channel.jointedFaces],
      jointedEdges: [channel.jointedEdges],
    }),
  ).length;

  return (
    <li className="product-card flex items-center gap-3">
      <div className="w-12 flex items-center justify-center">
        <MaterialIcon material={material} />
      </div>
      <div className="grow">
        <div className="font-condensed font-bold text-sm uppercase tracking-wide text-ink-black leading-none">
          {getMaterialName(material)}
        </div>
        <div className="text-xs text-ink-fade tabular-nums mt-1">
          {numberOwned > 0 && (
            <span className="text-store-orange-dark font-semibold">
              {numberOwned} owned ·{" "}
            </span>
          )}
          In stock
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="price-tag tabular-nums">${price.toFixed(2)}</span>
        <button
          className="bg-store-orange hover:bg-store-orange-dark disabled:bg-store-concrete-dark disabled:text-ink-fade text-white font-condensed font-bold uppercase tracking-widest text-xs px-3 py-1 rounded-sm shadow"
          disabled={gameState.money < price}
          data-sfx="ui-purchase"
          onClick={() => applyAction(buyMaterialAction(makeBoard(), price))}
        >
          Buy
        </button>
      </div>
    </li>
  );
};
