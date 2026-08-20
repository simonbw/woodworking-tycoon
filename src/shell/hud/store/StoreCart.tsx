import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import React, { useState } from "react";
import { CartIcon } from "../../../components/CartIcon";
import {
  CartLineIcon,
  cartLineName,
} from "../../../components/shopping/StoreCart";
import { CartGroup, CartLine, groupCartLines } from "../../../game/cart";
import { classNames } from "../../../utils/classNames";
import { formatMoney } from "../../../utils/formatNumber";
import {
  addToCart,
  clearCart,
  removeFromCart,
} from "../../../sim/commands/cart-commands";
import { ShellStore } from "../../ShellStore";
import { useGame } from "../../useShell";

/**
 * The cart, as the store's chrome shows it — the old
 * `shopping/StoreCart.tsx` readout with its embedded actions rewired to
 * the cart commands (the icon/name helpers import from the old module
 * unchanged). Markup, classes, and testids verbatim: a running total
 * with — on hover or focus — the itemized panel hanging under it, where
 * quantities are changed and things go back on the shelf.
 *
 * The total goes red the moment the cart outruns the wallet. Nothing
 * stops you filling it past what you can pay (a store doesn't), so the
 * red figure and the greyed-out Check Out are the whole of the warning.
 */
export const StoreCartReadout: React.FC<{
  cart: ReadonlyArray<CartLine>;
  total: number;
  overdrawn: boolean;
  /** The muted ink of the bar this sits in, matching the wallet's label. */
  mutedClassName: string;
  /** The red the total turns when it outruns the wallet. */
  overdrawnClassName: string;
}> = ({ cart, total, overdrawn, mutedClassName, overdrawnClassName }) => {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const hover = useHover(context, {
    delay: { open: 80, close: 120 },
    // The pointer has to cross open air to reach the panel's buttons
    handleClose: safePolygon({ blockPointerEvents: false }),
  });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  const count = cart.length;

  return (
    <>
      <div
        ref={refs.setReference}
        {...getReferenceProps()}
        // A div, not a button: the total isn't a control — the panel it
        // opens holds the controls. tabIndex keeps it reachable anyway.
        tabIndex={0}
        data-testid="store-cart-total"
        className="flex cursor-default flex-col items-end leading-tight outline-none"
      >
        <span
          className={classNames(
            "font-condensed uppercase tracking-[0.2em] text-[0.65rem]",
            mutedClassName,
          )}
        >
          {count === 0
            ? "Cart"
            : `Cart · ${count} ${count === 1 ? "item" : "items"}`}
        </span>
        <span
          className={classNames(
            "flex items-center gap-1.5 text-xl font-bold tabular-nums",
            overdrawn && overdrawnClassName,
          )}
        >
          <CartIcon label="Cart total" />
          {formatMoney(total)}
        </span>
      </div>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            data-testid="store-cart-panel"
            className="z-50 w-[24rem] max-w-[calc(100vw-2rem)] rounded-sm border border-paper-manila-edge bg-paper-ivory text-ink-black shadow-2xl"
          >
            <CartPanel cart={cart} total={total} overdrawn={overdrawn} />
          </div>
        </FloatingPortal>
      )}
    </>
  );
};

const CartPanel: React.FC<{
  cart: ReadonlyArray<CartLine>;
  total: number;
  overdrawn: boolean;
}> = ({ cart, total, overdrawn }) => {
  const game = useGame();
  const groups = groupCartLines(cart);

  if (groups.length === 0) {
    return (
      <p className="px-4 py-5 text-center font-condensed uppercase tracking-wider text-sm text-ink-fade">
        Your cart is empty
      </p>
    );
  }

  return (
    <div className="flex max-h-[60vh] flex-col">
      <ul className="min-h-0 grow divide-y divide-paper-manila-edge/60 overflow-y-auto">
        {groups.map((group) => (
          <CartRow key={group.key} group={group} />
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-paper-manila-edge bg-paper-manila/60 px-3 py-2">
        <button
          className="font-condensed uppercase tracking-wider text-xs text-ink-fade hover:text-ink-black"
          onClick={() => {
            clearCart(game);
            game.entities.tryGetSingleton(ShellStore)?.bump();
          }}
          data-sfx="ui-back"
        >
          Empty cart
        </button>
        <span className="flex items-baseline gap-2">
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
        </span>
      </div>
      {overdrawn && (
        <p className="border-t border-paper-manila-edge px-3 py-1.5 text-xs text-ink-red">
          That&apos;s more than you have. Put something back.
        </p>
      )}
    </div>
  );
};

/** One product in the cart: what it is, how many, and what they cost. */
const CartRow: React.FC<{ group: CartGroup }> = ({ group }) => {
  const game = useGame();
  const name = cartLineName(group.line);
  // Always the last of the group, so removing one never disturbs the
  // indices of the lines still ahead of it.
  const lastIndex = group.indices[group.indices.length - 1];
  const bump = () => game.entities.tryGetSingleton(ShellStore)?.bump();

  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      {/* Clipped, not fitted: a board drawn to true aspect is a 2px
          sliver at this height, so the box shows a window onto its face
          — the grain and color that identify it — instead. */}
      <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[1px]">
        <CartLineIcon line={group.line} />
      </span>
      <span className="min-w-0 grow leading-tight">
        <span className="block truncate text-sm" title={name}>
          {name}
        </span>
        <span className="block text-xs tabular-nums text-ink-fade">
          {formatMoney(group.line.price)} each
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <StepperButton
          label={`Remove one ${name}`}
          onClick={() => {
            removeFromCart(game, lastIndex);
            bump();
          }}
        >
          −
        </StepperButton>
        <span className="w-5 text-center text-sm font-bold tabular-nums">
          {group.count}
        </span>
        <StepperButton
          label={`Add another ${name}`}
          onClick={() => {
            addToCart(game, group.line);
            bump();
          }}
        >
          +
        </StepperButton>
      </span>
      <span className="w-16 shrink-0 text-right text-sm font-bold tabular-nums">
        {formatMoney(group.price)}
      </span>
    </li>
  );
};

const StepperButton: React.FC<{
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, onClick, children }) => (
  <button
    aria-label={label}
    onClick={onClick}
    className="size-6 rounded-sm border border-paper-manila-edge bg-paper-manila text-base leading-none text-ink-black hover:bg-store-orange hover:text-white"
  >
    {children}
  </button>
);

/** The register's own way out: pay and drive home. */
export const StoreCheckoutButton: React.FC<{
  canCheckOut: boolean;
  onCheckOut: () => void;
  /** The venue's paint for the button itself. */
  className: string;
}> = ({ canCheckOut, onCheckOut, className }) => (
  <button
    className={classNames(
      "flex items-center gap-2 rounded-sm border-2 px-3 py-1.5 font-condensed font-bold uppercase tracking-[0.2em] text-sm disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    onClick={onCheckOut}
    disabled={!canCheckOut}
    data-sfx="ui-purchase"
    data-testid="store-check-out"
    data-tutorial-target="store-checkout"
  >
    <CartIcon />
    Check Out &amp; Head Home
  </button>
);
