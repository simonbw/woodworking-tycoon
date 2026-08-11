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
import { CLAMP_NAME } from "../../game/Clamp";
import { CartGroup, CartLine, groupCartLines } from "../../game/cart";
import { CONSUMABLE_TYPES } from "../../game/Consumable";
import {
  addToCartAction,
  clearCartAction,
  removeFromCartAction,
} from "../../game/game-actions/cart-actions";
import { BROOM_NAME } from "../../game/HeldTool";
import { MACHINE_TYPES, MachineId } from "../../game/Machine";
import { getMaterialFullName } from "../../game/material-helpers";
import { SHOP_VAC_NAME } from "../../game/ShopVac";
import { ToolId } from "../../game/Tool";
import { UPGRADE_TYPES, UpgradeId } from "../../game/Upgrade";
import { classNames } from "../../utils/classNames";
import { formatMoney } from "../../utils/formatNumber";
import { CartIcon } from "../CartIcon";
import {
  BroomIcon,
  ClampIcon,
  ConsumableIcon,
  MachineIcon,
  ShopVacIcon,
  ToolIcon,
  UpgradeIcon,
} from "../ItemIcon";
import { useApplyGameAction } from "../useGameState";
import { BoardFaceSvg } from "./BoardFaceSvg";
import { SheetFaceSvg } from "./SheetFaceSvg";

/**
 * The cart, as the store's chrome shows it: a running total in the top
 * bar between the wallet and the way out, and — on hover or focus — the
 * itemized list hanging under it, where quantities are changed and
 * things go back on the shelf.
 *
 * The total goes red the moment the cart outruns the wallet. Nothing
 * stops you filling it past what you can pay (a store doesn't), so the
 * red figure and the greyed-out Check Out are the whole of the warning.
 *
 * The panel is a real popover rather than a Tooltip: tooltips here are
 * `pointer-events-none` by design, and this one is full of buttons. It
 * stays open across the gap between the total and the panel
 * (`safePolygon`), which is what makes "point at it, then reach for the
 * minus" work.
 */
export const StoreCartReadout: React.FC<{
  cart: ReadonlyArray<CartLine>;
  total: number;
  overdrawn: boolean;
  /** The muted ink of the bar this sits in, matching the wallet's label. */
  mutedClassName: string;
  /**
   * The red the total turns when it outruns the wallet. Each venue paints
   * its own: ink red reads on the store's white bar and would disappear
   * into the lumberyard's green one.
   */
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

/**
 * The register. One press pays for the cart and drives home — there is
 * no ringing up and carrying on shopping, because what you buy goes in
 * the truck's bed and the bed goes home. Absent entirely while the cart
 * is empty (Head Home is the only way out then), and disabled while the
 * cart outruns the wallet.
 */
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

const CartPanel: React.FC<{
  cart: ReadonlyArray<CartLine>;
  total: number;
  overdrawn: boolean;
}> = ({ cart, total, overdrawn }) => {
  const applyAction = useApplyGameAction();
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
          onClick={() => applyAction(clearCartAction())}
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
        <p className="border-t border-paper-manila-edge px-3 py-1.5 text-center text-xs text-ink-red">
          More than your wallet — put something back.
        </p>
      )}
    </div>
  );
};

/** One product in the cart: what it is, how many, and what they cost. */
const CartRow: React.FC<{ group: CartGroup }> = ({ group }) => {
  const applyAction = useApplyGameAction();
  const name = cartLineName(group.line);
  // Always the last of the group, so removing one never disturbs the
  // indices of the lines still ahead of it.
  const lastIndex = group.indices[group.indices.length - 1];

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
          onClick={() => applyAction(removeFromCartAction(lastIndex))}
        >
          −
        </StepperButton>
        <span className="w-5 text-center text-sm font-bold tabular-nums">
          {group.count}
        </span>
        <StepperButton
          label={`Add another ${name}`}
          onClick={() => applyAction(addToCartAction(group.line))}
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

/** What a line is called on the receipt. */
export function cartLineName(line: CartLine): string {
  switch (line.kind) {
    case "material":
      return getMaterialFullName(line.material);
    case "machine":
      return MACHINE_TYPES[line.machineTypeId].name;
    case "consumablePack":
      return CONSUMABLE_TYPES[line.consumableId].packName;
    case "upgrade":
      return UPGRADE_TYPES[line.upgradeId].name;
    case "clamp":
      return CLAMP_NAME;
    case "broom":
      return BROOM_NAME;
    case "shopVac":
      return SHOP_VAC_NAME;
  }
}

/** The same picture the shelf tag showed, shrunk to a receipt line. */
const CartLineIcon: React.FC<{ line: CartLine }> = ({ line }) => {
  switch (line.kind) {
    case "material": {
      const material = line.material;
      if (material.type === "board") {
        return (
          <BoardFaceSvg board={material} className="h-8 w-auto max-w-none" />
        );
      }
      if (material.type === "plywood") {
        return <SheetFaceSvg kind={material.kind} className="size-7" />;
      }
      if (material.type === "tool") {
        return (
          <ToolIcon toolId={material.toolId as ToolId} className="size-7" />
        );
      }
      return null;
    }
    case "machine":
      return (
        <MachineIcon
          machineId={line.machineTypeId as MachineId}
          className="max-h-8 w-auto"
        />
      );
    case "consumablePack":
      return (
        <ConsumableIcon consumableId={line.consumableId} className="size-7" />
      );
    case "upgrade":
      return (
        <UpgradeIcon
          upgradeId={line.upgradeId as UpgradeId}
          className="size-7"
        />
      );
    case "clamp":
      return <ClampIcon className="size-7" />;
    case "broom":
      return <BroomIcon className="size-7" />;
    case "shopVac":
      return <ShopVacIcon className="size-7" />;
  }
};
