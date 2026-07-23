import React, { useMemo, useState } from "react";
import { Species } from "../../game/Materials";
import { board } from "../../game/board-helpers";
import { buyMaterialAction } from "../../game/game-actions/store-actions";
import { getBoardBuyPrice } from "../../game/material-values";
import {
  describeStockDimensionsPlain,
  getMaterialState,
  materialMeetsInput,
  nominalSizeLabel,
} from "../../game/material-helpers";
import { humanizeString } from "../../utils/humanizeString";
import {
  LumberChannel,
  LumberSku,
  unlockedLumberChannels,
} from "../../game/lumberStock";
import { BoardFaceSvg } from "./BoardFaceSvg";
import { Tooltip } from "../Tooltip";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * Every board in the aisle shares one scale: a row's board spans the
 * rack lane in proportion to the longest board sold anywhere, so lengths
 * compare at a glance across channels.
 */
const RACK_MAX_FEET = 8;

/**
 * The lumber aisle, one section per purchase channel (see lumberStock.ts).
 * Locked channels are completely absent — new sections appear as
 * reputation grows. No custom cutting anywhere: milling stock down to what
 * a project needs is the game.
 *
 * Species and milled state are channel facts, so they live in the channel
 * header; each row is just the board itself, its dimensions, and a price.
 * Rows sit tight so widths compare board-against-board like a real rack.
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

  // All of a channel's stock shares one milled state — say it once here
  const stateLabel = useMemo(() => {
    const sku = channel.skus[0];
    return getMaterialState(
      board(species, sku.length, sku.width, sku.thickness, channel.surface, {
        faces: channel.jointedFaces,
        edges: channel.jointedEdges,
      }),
    );
  }, [species, channel]);

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <h3 className="font-stencil uppercase tracking-wide text-sm text-ink-black">
          {channel.name}
        </h3>
        <span className="text-xs text-ink-fade font-typewriter grow">
          {stateLabel}
        </span>
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
      <ul className="product-card p-2 space-y-0.5">
        {channel.skus.map((sku) => (
          <LumberSkuRow
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

const LumberSkuRow: React.FC<{
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

  // Dimensions only — species and milled state live in the channel header
  const nominal = nominalSizeLabel(material);
  const dimsLabel = nominal
    ? `${nominal} — ${sku.length}'`
    : `${sku.thickness}/4 — ${sku.width}" × ${sku.length}'`;

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
    <li className="flex items-center gap-2">
      <div className="grow flex items-center">
        <BoardFaceSvg
          board={material}
          className="block"
          style={{ width: `${(sku.length / RACK_MAX_FEET) * 100}%` }}
        />
      </div>
      {numberOwned > 0 && (
        <Tooltip content={`${numberOwned} in your inventory`}>
          <span className="text-[10px] text-store-orange-dark font-semibold tabular-nums whitespace-nowrap">
            ×{numberOwned}
          </span>
        </Tooltip>
      )}
      <Tooltip content={describeStockDimensionsPlain(material)}>
        <span className="font-condensed text-xs uppercase tracking-wide text-ink-black tabular-nums whitespace-nowrap w-24">
          {dimsLabel}
        </span>
      </Tooltip>
      <span className="font-condensed font-bold text-sm text-ink-black tabular-nums whitespace-nowrap w-14 text-right">
        ${price.toFixed(2)}
      </span>
      <button
        className="bg-store-orange hover:bg-store-orange-dark disabled:bg-store-concrete-dark disabled:text-ink-fade text-white font-condensed font-bold uppercase tracking-widest text-[10px] px-2 py-0.5 rounded-sm shadow"
        disabled={gameState.money < price}
        data-sfx="ui-purchase"
        onClick={() => applyAction(buyMaterialAction(makeBoard(), price))}
      >
        Buy
      </button>
    </li>
  );
};
