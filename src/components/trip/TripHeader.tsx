import React from "react";
import { classNames } from "../../utils/classNames";
import { formatMoney } from "../../utils/formatNumber";
import { useGameState } from "../useGameState";

/**
 * The sign over a store trip's door: brand on the left, the player's
 * wallet, the cart, and the ways out on the right. Each venue paints it
 * its own colors — Orange Box in safety orange on white, Sawyer & Sons
 * in mill green on cream — so the tint classes come from the caller
 * while the layout stays shared.
 *
 * The cart and the register arrive as slots rather than props: what goes
 * in them is store business (see StoreCart.tsx), and a trip with nothing
 * to buy — the delivery run — just doesn't fill them.
 */
export const TripHeader: React.FC<{
  /** The brand name itself, already set in the venue's display face. */
  brand: React.ReactNode;
  tagline: string;
  /** The bar's paint job: background + text color. */
  barClassName: string;
  /**
   * How the brand and tagline line up: the store's block caps center,
   * the yard's taller script sits on the baseline.
   */
  brandRowClassName: string;
  /** The dimmed ink for the tagline and wallet label, tracking the bar text. */
  mutedClassName: string;
  /** Border and hover tint for the Head Home button, in the same tone. */
  homeButtonClassName: string;
  onHeadHome: () => void;
  /** The cart's running total, hung between the wallet and the way out. */
  cart?: React.ReactNode;
  /** The register: pay for the cart and drive home, when there's a cart to pay for. */
  checkout?: React.ReactNode;
  /**
   * Head Home is armed and asking about the cart it would abandon. The
   * button says so rather than a dialog saying it: the next press is the
   * answer, and the store is still right there behind it.
   */
  confirmingLeave?: boolean;
}> = ({
  brand,
  tagline,
  barClassName,
  brandRowClassName,
  mutedClassName,
  homeButtonClassName,
  onHeadHome,
  cart,
  checkout,
  confirmingLeave = false,
}) => {
  const gameState = useGameState();
  return (
    <div
      className={classNames(
        "px-6 py-3 flex items-center justify-between",
        barClassName,
      )}
    >
      <div className={classNames("flex gap-4", brandRowClassName)}>
        {brand}
        <span
          className={classNames(
            "font-condensed uppercase tracking-[0.3em] text-xs",
            mutedClassName,
          )}
        >
          {tagline}
        </span>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end leading-tight">
          <span
            className={classNames(
              "font-condensed uppercase tracking-[0.2em] text-[0.65rem]",
              mutedClassName,
            )}
          >
            Your Wallet
          </span>
          <span className="text-xl font-bold tabular-nums">
            {formatMoney(gameState.money)}
          </span>
        </div>
        {cart}
        {checkout}
        <button
          className={classNames(
            "border-2 rounded-sm px-3 py-1.5 font-condensed font-bold uppercase tracking-[0.2em] text-sm",
            homeButtonClassName,
          )}
          onClick={onHeadHome}
          data-sfx="ui-back"
        >
          {confirmingLeave ? "Leave cart behind?" : "Head Home"}
        </button>
      </div>
    </div>
  );
};
