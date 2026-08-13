import React, { useRef } from "react";
import { StoreInteract } from "../../game/store-interact";
import { ShelfBay } from "../../game/store-layout";
import { useShortcut } from "../shortcuts/ShortcutProvider";

/**
 * The store floor's keys, mirroring the shop's: E takes things — one off
 * the shelf into the cart — and works the register and the way home; F
 * puts things down, one from the cart back on its shelf. Every binding
 * reads the same resolver the chips draw from (store-interact.ts), so a
 * key never does something the chip didn't offer. ShopKeyboardShortcuts
 * stands down for the whole trip (it guards on `away`), so the ids never
 * fight.
 */
export const StoreKeyboardShortcuts: React.FC<{
  interact: StoreInteract | null;
  onAddFromBay: (bay: ShelfBay) => void;
  onReturnToBay: (bay: ShelfBay) => void;
  onOpenCheckout: () => void;
  onLeave: () => void;
}> = ({ interact, onAddFromBay, onReturnToBay, onOpenCheckout, onLeave }) => {
  // Read at dispatch time, the same pattern the shop's handler uses.
  const interactRef = useRef(interact);
  interactRef.current = interact;

  const bay = interact?.fixture ?? null;

  useShortcut(
    "pick-up",
    () => {
      const now = interactRef.current;
      if (!now) return;
      if (now.atRegister) return onOpenCheckout();
      if (now.atCab) return onLeave();
      if (now.fixture) {
        onAddFromBay(now.fixture);
      }
    },
    interact != null && (interact.atRegister || interact.atCab || bay != null),
  );

  useShortcut(
    "put-down",
    () => {
      const now = interactRef.current;
      if (now?.fixture && now.inCart > 0) {
        onReturnToBay(now.fixture);
      }
    },
    bay != null && (interact?.inCart ?? 0) > 0,
  );

  return null;
};
