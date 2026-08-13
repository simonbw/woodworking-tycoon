import React from "react";
import { CartLineIcon } from "../shopping/StoreCart";
import { ShelfBay, StoreLayout, StoreRect } from "../../game/store-layout";
import { StoreInteract } from "../../game/store-interact";
import { formatMoney } from "../../utils/formatNumber";
import { classNames } from "../../utils/classNames";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";
import { HintList, HintRow } from "../shortcuts/HintList";
import { ShortcutKeys } from "../shortcuts/Kbd";
import { Tooltip } from "../Tooltip";

/**
 * The DOM layer pinned over the store's canvas: the aisle signage, the
 * key-hint chips at whatever the shopper stands at, and each bay's
 * shelf tag (the price and the name — the same face a real shelf edge
 * wears). The tags stay put away until asked for: the bay the shopper
 * stands at shows its tag, and the mouse can hover any bay's footprint
 * to read one — the merchandise itself is the floor's picture, not a
 * field of labels. The same contract as the shop floor's overlay
 * otherwise: the mouse only acts on what the body can already reach —
 * a tag's button is dead until you're standing at its bay.
 *
 * Bays whose merchandise is drawn at world size (the floor piles, the
 * machine displays, the tool wall) wear a compact tag — the stock itself
 * is the picture. Only the racking with no world art (supplies) keeps
 * the icon on its tag.
 */

/** A cluster pinned to a world point, hanging in the given direction. */
const At: React.FC<{
  x: number;
  y: number;
  scale: number;
  anchor?: "center" | "above" | "below";
  className?: string;
  children: React.ReactNode;
}> = ({ x, y, scale, anchor = "center", className, children }) => (
  <div
    className={classNames("absolute", className)}
    style={{
      left: x * PIXELS_PER_CELL * scale,
      top: y * PIXELS_PER_CELL * scale,
      transform:
        anchor === "center"
          ? "translate(-50%, -50%)"
          : anchor === "above"
            ? "translate(-50%, -100%)"
            : "translate(-50%, 0)",
    }}
  >
    {children}
  </div>
);

const rectCenter = (rect: StoreRect): [number, number] => [
  (rect.min[0] + rect.max[0]) / 2,
  (rect.min[1] + rect.max[1]) / 2,
];

/** The world point a fixture's tag sits at: nudged toward the shopped
 * face, so facing runs never stack their tags and a wall bay's tag
 * hangs into its aisle rather than over the wall. */
function tagPoint(rect: StoreRect, facing: number): [number, number] {
  const [cx, cy] = rectCenter(rect);
  const nudge = 0.4;
  switch (facing) {
    case 1:
      return [cx, rect.min[1] - nudge];
    case 3:
      return [cx, rect.max[1] + nudge];
    case 0:
      return [rect.max[0] - nudge, cy];
    default:
      return [rect.min[0] + nudge, cy];
  }
}

/** The world point a fixture's chip hangs from: off its shopped face,
 * clear of the tag sitting between it and the shelf. */
function chipPoint(
  rect: StoreRect,
  facing: number,
): [number, number, "above" | "below"] {
  const [cx, cy] = rectCenter(rect);
  switch (facing) {
    case 1:
      return [cx, rect.min[1] - 1.7, "above"];
    case 3:
      return [cx, rect.max[1] + 1.7, "below"];
    case 0:
      return [rect.max[0] + 1.9, cy, "above"];
    default:
      return [rect.min[0] - 1.9, cy, "above"];
  }
}

const ShelfTag: React.FC<{
  bay: ShelfBay;
  scale: number;
  inReach: boolean;
  /** The tutorial's current DOM targets: a targeted tag shows without
   * hover — the guided opening's ring needs it to exist on screen. */
  tutorialIds: ReadonlySet<string>;
  inCart: number;
  onAdd: () => void;
}> = ({ bay, scale, inReach, tutorialIds, inCart, onAdd }) => {
  const { name, description, line } = bay.product;
  const [cx, cy] = tagPoint(bay.rect, bay.facing);
  const toolId =
    line.kind === "material" && line.material.type === "tool"
      ? line.material.toolId
      : null;
  const tutorialTarget = toolId
    ? `store-tool-${toolId}`
    : line.kind === "broom"
      ? "store-tool-broom"
      : undefined;
  const forced = tutorialTarget != null && tutorialIds.has(tutorialTarget);
  // The stock drawn at world size is its own picture; only bays without
  // world art put an icon on the tag.
  const compact = bay.display !== "racking" || toolId != null;
  const cell = PIXELS_PER_CELL * scale;
  return (
    // The bay's footprint is the tag's hover surface: the floor reads
    // clean until the mouse asks about a pile, or the body stands at it.
    <div
      className="group pointer-events-auto absolute"
      style={{
        left: bay.rect.min[0] * cell,
        top: bay.rect.min[1] * cell,
        width: (bay.rect.max[0] - bay.rect.min[0]) * cell,
        height: (bay.rect.max[1] - bay.rect.min[1]) * cell,
      }}
    >
      <div
        className={classNames(
          "absolute -translate-x-1/2 -translate-y-1/2",
          inReach || forced ? "block" : "hidden group-hover:block",
          inReach ? "z-20" : "z-10",
        )}
        style={{
          left: (cx - bay.rect.min[0]) * cell,
          top: (cy - bay.rect.min[1]) * cell,
        }}
      >
      <Tooltip
        content={`${name} — ${formatMoney(line.price)}. ${description}`}
        delay={120}
      >
        <button
          type="button"
          aria-label={`Add ${name} to cart`}
          disabled={!inReach}
          onClick={onAdd}
          data-sfx="ui-purchase"
          data-tutorial-target={tutorialTarget}
          className={classNames(
            "pointer-events-auto flex flex-col items-center gap-0.5 rounded-[2px] border border-paper-manila-edge bg-paper-ivory/95 px-1 py-0.5 shadow-sm",
            inReach
              ? "cursor-pointer ring-1 ring-ink-blue/40"
              : "cursor-default",
          )}
        >
          {!compact && (
            <span className="grid size-7 place-items-center overflow-hidden">
              <CartLineIcon line={line} />
            </span>
          )}
          <span className="max-w-20 truncate font-condensed text-[9px] uppercase leading-none text-ink-black">
            {name}
          </span>
          <span className="font-condensed text-[10px] font-bold leading-none tabular-nums text-ink-black">
            {formatMoney(line.price)}
          </span>
          {inCart > 0 && (
            <span className="font-condensed text-[9px] font-semibold leading-none tabular-nums text-ink-blue">
              {inCart} in cart
            </span>
          )}
        </button>
      </Tooltip>
      </div>
    </div>
  );
};

/** Big-box aisle signage: an orange blade hung over the run. */
const SignChip: React.FC<{
  title: string;
  x: number;
  y: number;
  scale: number;
}> = ({ title, x, y, scale }) => (
  <At x={x} y={y} scale={scale} className="z-10">
    <span className="block whitespace-nowrap rounded-[2px] bg-store-orange px-1.5 py-0.5 font-condensed text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
      {title}
    </span>
  </At>
);

export const StoreOverlayLayer: React.FC<{
  layout: StoreLayout;
  scale: number;
  interact: StoreInteract | null;
  /** Cart counts per bay id — what the tags call out. */
  bayCartCounts: ReadonlyMap<string, number>;
  /** The tutorial's current DOM target ids (empty outside the opening). */
  tutorialIds: ReadonlySet<string>;
  armedLeave: boolean;
  onAddFromBay: (bay: ShelfBay) => void;
  onCheckout: () => void;
}> = ({
  layout,
  scale,
  interact,
  bayCartCounts,
  tutorialIds,
  armedLeave,
  onAddFromBay,
  onCheckout,
}) => {
  const standingBay = interact?.fixture ?? null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* The storefront's own sign, centered over the door wall. */}
      <At
        x={layout.interior[0] / 2}
        y={layout.interior[1] + 0.25}
        scale={scale}
        className="z-10"
      >
        <span className="block whitespace-nowrap rounded-[2px] bg-store-orange px-2 py-1 font-stencil text-xs font-bold uppercase tracking-[0.2em] text-white shadow">
          {layout.store === "orangeBox" ? "The Orange Box" : "Sawyer & Sons"}
        </span>
      </At>

      {layout.signs.map((sign) => (
        <SignChip
          key={sign.title}
          title={sign.title}
          x={sign.at[0]}
          y={sign.at[1]}
          scale={scale}
        />
      ))}

      {layout.fixtures.map((fixture) => (
        <ShelfTag
          key={fixture.id}
          bay={fixture}
          scale={scale}
          inReach={standingBay?.id === fixture.id}
          tutorialIds={tutorialIds}
          inCart={bayCartCounts.get(fixture.id) ?? 0}
          onAdd={() => onAddFromBay(fixture)}
        />
      ))}

      {/* ---- The chip at whatever the shopper stands at ---- */}

      {standingBay && (
        <ChipAt
          rect={standingBay.rect}
          facing={standingBay.facing}
          scale={scale}
        >
          <HintList testId="store-bay-chips">
            <HintRow className="text-paper-manila/60">
              {standingBay.product.name}
            </HintRow>
            <HintRow keys={<ShortcutKeys shortcut="put-down" />}>
              put one in the cart ·{" "}
              {formatMoney(standingBay.product.line.price)}
            </HintRow>
            {(interact?.inCart ?? 0) > 0 && (
              <HintRow keys={<ShortcutKeys shortcut="pick-up" />}>
                put one back ({interact?.inCart})
              </HintRow>
            )}
          </HintList>
        </ChipAt>
      )}

      {interact?.atRegister && (
        <ChipAt rect={layout.register} facing={1} scale={scale}>
          <div className="flex flex-col items-center gap-1">
            <HintList testId="store-register-chips">
              <HintRow className="text-paper-manila/60">Register</HintRow>
              {interact.cartCount === 0 ? (
                <HintRow className="text-paper-manila/60">
                  nothing in the cart yet
                </HintRow>
              ) : interact.canCheckOut ? (
                <HintRow keys={<ShortcutKeys shortcut="pick-up" />}>
                  check out · {formatMoney(interact.total)}
                </HintRow>
              ) : (
                <HintRow className="text-red-300">
                  more than your wallet — put something back
                </HintRow>
              )}
            </HintList>
            <button
              type="button"
              className="button-paper pointer-events-auto text-xs"
              data-testid="store-check-out"
              data-tutorial-target="store-checkout"
              data-sfx="ui-purchase"
              disabled={!interact.canCheckOut}
              onClick={onCheckout}
            >
              Check Out · {formatMoney(interact.total)}
            </button>
          </div>
        </ChipAt>
      )}

      {interact?.atCab && (
        <ChipAt rect={layout.truckCab} facing={1} scale={scale}>
          <HintList testId="store-cab-chips">
            <HintRow className="text-paper-manila/60">The truck</HintRow>
            {armedLeave ? (
              <>
                <HintRow className="text-red-300">
                  leave the cart behind?
                </HintRow>
                <HintRow keys={<ShortcutKeys shortcut="pick-up" />}>
                  head home anyway
                </HintRow>
              </>
            ) : (
              <HintRow keys={<ShortcutKeys shortcut="pick-up" />}>
                head home
              </HintRow>
            )}
          </HintList>
        </ChipAt>
      )}
    </div>
  );
};

const ChipAt: React.FC<{
  rect: StoreRect;
  facing: number;
  scale: number;
  children: React.ReactNode;
}> = ({ rect, facing, scale, children }) => {
  const [x, y, anchor] = chipPoint(rect, facing);
  return (
    <At x={x} y={y} scale={scale} anchor={anchor} className="z-20">
      {children}
    </At>
  );
};
