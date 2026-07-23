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
  speciesLabel,
} from "../../game/material-helpers";
import {
  LumberChannel,
  LumberSku,
  StoreId,
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
 * One store's lumber racks, one section per purchase channel carried there
 * (see lumberStock.ts). Locked channels are completely absent — new
 * sections appear as reputation grows. No custom cutting anywhere: milling
 * stock down to what a project needs is the game.
 *
 * The racks are built to be read by eye: a channel card holds one bundle
 * per species — named once on the left rail, confirmed by the boards'
 * color — with that species' sizes stacked inside it. Row text is the
 * dims and the price; the milled state and the channel's flavor line
 * wait in the channel-name tooltip. The surrounding overlay owns the
 * section heading, so each store keeps its own signage.
 */
export const BoardSelector: React.FC<{ store: StoreId }> = ({ store }) => {
  const gameState = useGameState();
  const channels = unlockedLumberChannels(gameState.reputation, store);

  return (
    <div className="space-y-3">
      {channels.map((channel) => (
        <LumberChannelSection key={channel.id} channel={channel} />
      ))}
    </div>
  );
};

const channelBoard = (
  channel: LumberChannel,
  sku: LumberSku,
  species: Species,
) =>
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
        {channel.species.map((species) => (
          <SpeciesBundle key={species} species={species} channel={channel} />
        ))}
      </ul>
    </div>
  );
};

/**
 * One species of stock: named once on the left rail, then every size the
 * channel carries in it, stacked like a banded bundle.
 */
const SpeciesBundle: React.FC<{
  species: Species;
  channel: LumberChannel;
}> = ({ species, channel }) => {
  return (
    <li className="flex items-center gap-2">
      <span className="w-14 shrink-0 font-condensed font-bold text-xs uppercase tracking-wide text-ink-black">
        {speciesLabel(species)}
      </span>
      <div className="grow space-y-px">
        {channel.skus.map((sku) => (
          <SkuRow
            key={`${sku.length}x${sku.width}x${sku.thickness}`}
            sku={sku}
            species={species}
            channel={channel}
          />
        ))}
      </div>
    </li>
  );
};

const SkuRow: React.FC<{
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

  // Dims distinguish the rows of a bundle — species is the bundle's rail
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
          <span
            className={`text-[10px] font-semibold tabular-nums whitespace-nowrap ${
              channel.store === "lumberyard"
                ? "text-mill-green"
                : "text-store-orange-dark"
            }`}
          >
            ×{numberOwned}
          </span>
        </Tooltip>
      )}
      <Tooltip content={describeStockDimensionsPlain(material)}>
        <span className="w-24 shrink-0 font-condensed text-xs uppercase tracking-wide text-ink-black tabular-nums whitespace-nowrap">
          {dimsLabel}
        </span>
      </Tooltip>
      <span className="font-condensed font-bold text-sm text-ink-black tabular-nums whitespace-nowrap w-14 text-right">
        ${price.toFixed(2)}
      </span>
      <button
        className={`disabled:bg-store-concrete-dark disabled:text-ink-fade text-white font-condensed font-bold uppercase tracking-widest text-[10px] px-2 py-0.5 rounded-sm shadow ${
          channel.store === "lumberyard"
            ? "bg-mill-green hover:bg-mill-green-dark"
            : "bg-store-orange hover:bg-store-orange-dark"
        }`}
        disabled={gameState.money < price}
        data-sfx="ui-purchase"
        aria-label={`Buy ${fullName}`}
        onClick={() =>
          applyAction(
            buyMaterialAction(channelBoard(channel, sku, species), price),
          )
        }
      >
        Buy
      </button>
    </div>
  );
};
