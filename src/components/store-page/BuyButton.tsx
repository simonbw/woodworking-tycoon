import React from "react";
import { classNames } from "../../utils/classNames";

/**
 * The orange spend-money button: Orange Box's house style, also worn by
 * anything else that costs the player something (the journal's Learn
 * button). Greys out via `disabled` when the player can't afford it —
 * callers only decide when, not how it looks.
 */
export const BuyButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    /**
     * "aisle" is the store's product-card size; "compact" squeezes into
     * tighter rows like the journal's skill cards.
     */
    size?: "aisle" | "compact";
    /** Routed to the delegated click-sound listener (e.g. "ui-purchase"). */
    "data-sfx"?: string;
  }
> = ({ size = "aisle", className, ...buttonProps }) => (
  <button
    className={classNames(
      "bg-store-orange hover:bg-store-orange-dark disabled:bg-store-concrete-dark disabled:text-ink-fade text-white font-condensed font-bold uppercase tracking-widest rounded-sm shadow",
      size === "aisle" ? "text-xs px-3 py-1" : "text-[0.75rem] px-2 py-0.5",
      className,
    )}
    {...buttonProps}
  />
);
