import React, { useMemo } from "react";
import { Species } from "../../game/Materials";
import { board } from "../../game/board-helpers";
import { buyMaterialAction } from "../../game/game-actions/store-actions";
import { getBoardBuyPrice } from "../../game/material-values";
import {
  describeStockDimensionsPlain,
  getMaterialFullName,
  getMaterialState,
  materialMeetsInput,
  nominalSizeLabel,
} from "../../game/material-helpers";
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
 * The aisle is built to be read by eye: a channel card holds one bundle
 * per size, each bundle stacking every species of that size as bare
 * boards told apart by color. The only text is what can't be drawn — the
 * bundle's dimensions and each board's price. Everything else (species
 * name, milled state, the channel's flavor line) waits in tooltips.
 */
export const BoardSelector: React.FC = () => {
  const gameState = useGameState();
  const channels = unlockedLumberChannels(gameState.reputation);

  return (
    <section>
      <h2 className="aisle-heading">Lumber</h2>
      <div className="space-y-3">
        {channels.map((channel) => (
          <LumberChannelSection key={channel.id} channel={channel} />
        ))}
      </div>
    </section>
  );
};

const channelBoard = (channel: LumberChannel, sku: LumberSku, species: Species) =>
  board(species, sku.length, sku.width, sku.thickness, channel.surface, {
    faces: channel.jointedFaces,
    edges: channel.jointedEdges,
  });

const LumberChannelSection: React.FC<{ channel: LumberChannel }> = ({
  channel,
}) => {
  // All of a channel's stock shares one milled state — the header
  // tooltip says it once, alongside the channel's flavor line
  const stateLabel = getMaterialState(
    channelBoard(channel, channel.skus[0], channel.species[0]),
  );

  return (
    <div>
      <Tooltip content={`${stateLabel} — ${channel.tagline}`}>
        <h3 className="inline-block font-stencil uppercase tracking-wide text-sm text-ink-black cursor-help mb-0.5">
          {channel.name}
        </h3>
      </Tooltip>
      <ul className="product-card p-2 space-y-1.5">
        {channel.skus.map((sku) => (
          <SkuBundle
            key={`${sku.length}x${sku.width}x${sku.thickness}`}
            sku={sku}
            channel={channel}
          />
        ))}
      </ul>
    </div>
  );
};

/**
 * One size of stock: the dims labeled once on the left, then that size in
 * every species the channel carries, stacked like a banded bundle.
 */
const SkuBundle: React.FC<{
  sku: LumberSku;
  channel: LumberChannel;
}> = ({ sku, channel }) => {
  const sample = channelBoard(channel, sku, channel.species[0]);
  const nominal = nominalSizeLabel(sample);
  const dimsLabel = nominal
    ? `${nominal} — ${sku.length}'`
    : `${sku.thickness}/4 — ${sku.width}" × ${sku.length}'`;

  return (
    <li className="flex items-center gap-2">
      <Tooltip content={describeStockDimensionsPlain(sample)}>
        <span className="w-24 shrink-0 font-condensed text-xs uppercase tracking-wide text-ink-black tabular-nums whitespace-nowrap">
          {dimsLabel}
        </span>
      </Tooltip>
      <div className="grow space-y-px">
        {channel.species.map((species) => (
          <SpeciesRow
            key={species}
            sku={sku}
            species={species}
            channel={channel}
          />
        ))}
      </div>
    </li>
  );
};

const SpeciesRow: React.FC<{
  sku: LumberSku;
  species: Species;
  channel: LumberChannel;
}> = ({ sku, species, channel }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const material = useMemo(
    () => channelBoard(channel, sku, species),
    [species, sku, channel],
  );
  const price = getBoardBuyPrice(material, channel.priceMultiplier);
  const fullName = getMaterialFullName(material);

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
    <div className="flex items-center gap-2">
      <div className="grow">
        <Tooltip content={fullName}>
          <span
            className="block"
            style={{ width: `${(sku.length / RACK_MAX_FEET) * 100}%` }}
          >
            <BoardFaceSvg board={material} className="block w-full" />
          </span>
        </Tooltip>
      </div>
      {numberOwned > 0 && (
        <Tooltip content={`${numberOwned} in your inventory`}>
          <span className="text-[10px] text-store-orange-dark font-semibold tabular-nums whitespace-nowrap">
            ×{numberOwned}
          </span>
        </Tooltip>
      )}
      <span className="font-condensed font-bold text-sm text-ink-black tabular-nums whitespace-nowrap w-14 text-right">
        ${price.toFixed(2)}
      </span>
      <button
        className="bg-store-orange hover:bg-store-orange-dark disabled:bg-store-concrete-dark disabled:text-ink-fade text-white font-condensed font-bold uppercase tracking-widest text-[10px] px-2 py-0.5 rounded-sm shadow"
        disabled={gameState.money < price}
        data-sfx="ui-purchase"
        aria-label={`Buy ${fullName}`}
        onClick={() =>
          applyAction(buyMaterialAction(channelBoard(channel, sku, species), price))
        }
      >
        Buy
      </button>
    </div>
  );
};
