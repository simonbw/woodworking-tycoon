import React, { useEffect } from "react";
import { CartLine, groupCartLines } from "../../game/cart";
import { classNames } from "../../utils/classNames";
import { formatMoney } from "../../utils/formatNumber";
import { CartLineIcon, cartLineName } from "../shopping/StoreCart";

/**
 * The register's receipt: everything in the cart, line by line with the
 * total, and the one moment money changes hands. Buying loads the bed
 * and starts the drive home — there is no paying and carrying on
 * shopping — and Cancel steps back from the counter with the cart
 * untouched.
 */
export const StoreCheckoutModal: React.FC<{
  cart: ReadonlyArray<CartLine>;
  total: number;
  overdrawn: boolean;
  onBuy: () => void;
  onCancel: () => void;
}> = ({ cart, total, overdrawn, onBuy, onCancel }) => {
  const groups = groupCartLines(cart);
  const canBuy = cart.length > 0 && !overdrawn;

  // Escape steps back from the counter, like closing any card.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/40 pointer-events-auto">
      <div
        role="dialog"
        aria-label="Register"
        data-testid="store-checkout-modal"
        className="w-[26rem] max-w-[calc(100vw-2rem)] rounded-sm border border-paper-manila-edge bg-paper-ivory text-ink-black shadow-2xl"
      >
        <p className="border-b border-paper-manila-edge px-4 py-2 font-condensed text-sm font-bold uppercase tracking-[0.2em]">
          Register
        </p>
        {groups.length === 0 ? (
          <p className="px-4 py-5 text-center font-condensed uppercase tracking-wider text-sm text-ink-fade">
            Nothing in the cart yet
          </p>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-paper-manila-edge/60 overflow-y-auto">
            {groups.map((group) => (
              <li key={group.key} className="flex items-center gap-2.5 px-3 py-2">
                <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[1px]">
                  <CartLineIcon line={group.line} />
                </span>
                <span className="min-w-0 grow leading-tight">
                  <span className="block truncate text-sm">
                    {cartLineName(group.line)}
                  </span>
                  <span className="block text-xs tabular-nums text-ink-fade">
                    {group.count} × {formatMoney(group.line.price)}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm font-bold tabular-nums">
                  {formatMoney(group.price)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-paper-manila-edge bg-paper-manila/60 px-3 py-2">
          <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
            Total
          </span>
          <span
            className={classNames(
              "text-lg font-bold tabular-nums",
              overdrawn && "text-ink-red",
            )}
          >
            {formatMoney(total)}
          </span>
        </div>
        {overdrawn && (
          <p className="border-t border-paper-manila-edge px-3 py-1.5 text-center text-xs text-ink-red">
            More than your wallet — put something back.
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-paper-manila-edge px-3 py-2.5">
          <button
            type="button"
            className="button-paper text-xs"
            data-testid="store-keep-shopping"
            data-sfx="ui-back"
            onClick={onCancel}
          >
            Keep Shopping
          </button>
          <button
            type="button"
            className="button-paper text-xs"
            data-testid="store-buy"
            data-sfx="ui-purchase"
            disabled={!canBuy}
            onClick={onBuy}
          >
            Buy &amp; Head Home · {formatMoney(total)}
          </button>
        </div>
      </div>
    </div>
  );
};
