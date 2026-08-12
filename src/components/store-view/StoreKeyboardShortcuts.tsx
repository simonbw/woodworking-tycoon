import React, { useRef } from "react";
import { StoreInteract } from "../../game/store-interact";
import { LumberRack, SheetRack, ShelfBay } from "../../game/store-layout";
import { useShortcut } from "../shortcuts/ShortcutProvider";

/**
 * The store floor's keys, mirroring the shop's: F acts on the shelf in
 * front of you (one in the cart), E takes things back and works the
 * register and the way home, Tab spreads a rack's card, Escape folds it.
 * Every binding reads the same resolver the chips draw from
 * (store-interact.ts), so a key never does something the chip didn't
 * offer. ShopKeyboardShortcuts stands down for the whole trip (it guards
 * on `away`), so the ids never fight.
 */
export const StoreKeyboardShortcuts: React.FC<{
  interact: StoreInteract | null;
  openRackId: string | null;
  onAddFromBay: (bay: ShelfBay) => void;
  onReturnToBay: (bay: ShelfBay) => void;
  onBrowseRack: (rack: LumberRack | SheetRack) => void;
  onCloseRack: () => void;
  onCheckout: () => void;
  onLeave: () => void;
}> = ({
  interact,
  openRackId,
  onAddFromBay,
  onReturnToBay,
  onBrowseRack,
  onCloseRack,
  onCheckout,
  onLeave,
}) => {
  // Read at dispatch time, the same pattern the shop's handler uses.
  const interactRef = useRef(interact);
  interactRef.current = interact;

  const bay = interact?.fixture?.kind === "bay" ? interact.fixture : null;
  const rack =
    interact?.fixture && interact.fixture.kind !== "bay"
      ? (interact.fixture as LumberRack | SheetRack)
      : null;

  useShortcut(
    "put-down",
    () => {
      const now = interactRef.current;
      if (now?.fixture?.kind === "bay") {
        onAddFromBay(now.fixture);
      }
    },
    bay != null,
  );

  useShortcut(
    "pick-up",
    () => {
      const now = interactRef.current;
      if (!now) return;
      if (now.atRegister) return onCheckout();
      if (now.atCab) return onLeave();
      if (now.fixture?.kind === "bay" && now.inCart > 0) {
        return onReturnToBay(now.fixture);
      }
      if (now.fixture && now.fixture.kind !== "bay") {
        return onBrowseRack(now.fixture as LumberRack | SheetRack);
      }
    },
    interact != null &&
      (interact.atRegister ||
        interact.atCab ||
        (bay != null && interact.inCart > 0) ||
        rack != null),
  );

  useShortcut(
    "open-station-sheet",
    () => {
      if (openRackId) {
        onCloseRack();
        return;
      }
      const now = interactRef.current;
      if (now?.fixture && now.fixture.kind !== "bay") {
        onBrowseRack(now.fixture as LumberRack | SheetRack);
      }
    },
    rack != null || openRackId != null,
  );

  useShortcut("close-sheet", onCloseRack, openRackId != null);

  return null;
};
