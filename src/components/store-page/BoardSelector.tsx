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
 * Every rack in town shares one pixels-per-foot, so lengths compare at a
 * glance across bays, channels, and stores. Boards draw at true aspect —
 * this is the whole scale knob.
 */
const PX_PER_FOOT = 57;

/** How high the safety chain hangs across each bay's boards. */
const CHAIN_HEIGHT_FEET = 3.5;

// Rack chrome is diegetic shop furniture, so it uses raw wood and steel
// tones rather than the paperwork palette.
const POST_BG = "linear-gradient(90deg, #5f462d, #8a6a45 45%, #4c3823)";
const RAIL_BG = "linear-gradient(180deg, #8a6a45, #4c3823)";
const CHAIN_BG = `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='13' height='8' viewBox='0 0 13 8'><ellipse cx='6.5' cy='4' rx='5.5' ry='3' fill='none' stroke='%23494f52' stroke-width='1.6'/></svg>")`;

/**
 * One store's lumber racks, one rack per purchase channel carried there
 * (see lumberStock.ts). Locked channels are completely absent — new racks
 * appear as reputation grows. No custom cutting anywhere: milling stock
 * down to what a project needs is the game.
 *
 * The racks mimic a real hardwood aisle: one bay per species, boards
 * standing on end and packed shoulder to shoulder, wooden posts between
 * bays, a safety chain across the front, and a paper tag stapled to each
 * board with its dims and price. The board itself is the buy button.
 * Everything reads right to left. The milled state and the channel's
 * flavor line wait in the channel-name tooltip; the surrounding overlay
 * owns the section heading, so each store keeps its own signage.
 */
export const BoardSelector: React.FC<{ store: StoreId }> = ({ store }) => {
  const gameState = useGameState();
  const channels = unlockedLumberChannels(gameState.reputation, store);

  return (
    <div className="flex flex-wrap items-end justify-center gap-x-2 gap-y-3">
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
        <h3 className="inline-block font-condensed font-bold uppercase tracking-wider text-base text-ink-black cursor-help mb-1">
          {channel.name}
        </h3>
      </Tooltip>
      <ul className="flex items-end">
        <RackPost />
        {[...channel.species].reverse().map((species) => (
          <React.Fragment key={species}>
            <SpeciesBay species={species} channel={channel} />
            <RackPost />
          </React.Fragment>
        ))}
      </ul>
    </div>
  );
};

/** A wooden upright between bays, running down past the rail to the floor. */
const RackPost: React.FC = () => (
  <li
    aria-hidden
    className="w-1.5 shrink-0 self-stretch"
    style={{ background: POST_BG }}
  />
);

/**
 * One species' bay: every size the channel carries standing shoulder to
 * shoulder (read right to left), a rail at the boards' feet, and a chain
 * across the front with the species name on a paper placard hung from it.
 */
const SpeciesBay: React.FC<{
  species: Species;
  channel: LumberChannel;
}> = ({ species, channel }) => {
  const chainBottom = CHAIN_HEIGHT_FEET * PX_PER_FOOT;
  return (
    <li className="flex flex-col">
      <div className="relative flex items-end justify-center gap-px px-0.5">
        {[...channel.skus].reverse().map((sku) => (
          <BoardForSale
            key={`${sku.length}x${sku.width}x${sku.thickness}`}
            sku={sku}
            species={species}
            channel={channel}
          />
        ))}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-10 h-2"
          style={{
            bottom: chainBottom,
            backgroundImage: CHAIN_BG,
            backgroundRepeat: "repeat-x",
          }}
        />
        {/* Species placard hanging from the chain by a short wire */}
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center"
          style={{ top: `calc(100% - ${chainBottom + 4}px)` }}
        >
          <span aria-hidden className="h-1.5 w-px bg-[#494f52]" />
          <span className="rounded-[1px] border border-paper-manila-edge bg-paper-manila px-1.5 py-0.5 font-condensed font-bold text-xs uppercase tracking-wide text-ink-black shadow-sm">
            {speciesLabel(species)}
          </span>
        </div>
      </div>
      <div aria-hidden className="h-2 w-full" style={{ background: RAIL_BG }} />
    </li>
  );
};

const BoardForSale: React.FC<{
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

  // The tag distinguishes the boards of a bay — species is on the floor
  const nominal = nominalSizeLabel(material);
  const sizeLine = nominal ?? `${sku.thickness}/4×${sku.width}"`;

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

  const tooltip =
    `${fullName} — ${describeStockDimensionsPlain(material)}` +
    (numberOwned > 0 ? ` — ${numberOwned} in your inventory` : "");

  return (
    <Tooltip content={tooltip}>
      <button
        className="relative block shrink-0 transition-[filter] enabled:cursor-pointer enabled:hover:brightness-110 disabled:opacity-60"
        style={{ height: sku.length * PX_PER_FOOT }}
        disabled={gameState.money < price}
        data-sfx="ui-purchase"
        aria-label={`Buy ${fullName}`}
        onClick={() =>
          applyAction(
            buyMaterialAction(channelBoard(channel, sku, species), price),
          )
        }
      >
        <BoardFaceSvg
          vertical
          board={material}
          className="block h-full w-auto"
        />
        {/* The paper tag stapled near the board's foot */}
        <span className="absolute left-1/2 bottom-2 z-20 -translate-x-1/2 flex flex-col items-center rounded-[1px] border border-paper-manila-edge bg-paper-ivory px-0.5 py-px font-condensed leading-tight text-ink-black shadow-sm">
          <span className="text-[10px] uppercase whitespace-nowrap">
            {sizeLine}
          </span>
          <span className="text-[10px] whitespace-nowrap">{`${sku.length}'`}</span>
          <span className="text-[11px] font-bold tabular-nums whitespace-nowrap">
            ${price.toFixed(2)}
          </span>
          {numberOwned > 0 && (
            <span
              className={`text-[10px] font-semibold tabular-nums ${
                channel.store === "lumberyard"
                  ? "text-mill-green"
                  : "text-store-orange-dark"
              }`}
            >
              ×{numberOwned}
            </span>
          )}
        </span>
      </button>
    </Tooltip>
  );
};
