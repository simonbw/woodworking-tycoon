import React, { useContext } from "react";
import {
  interactLabel,
  resolveInteract,
  takeBlockedReason,
} from "../../../game/interact";
import { atStand, isSellable, standRect } from "../../../game/stand";
import { PIXELS_PER_CELL } from "../../../views/shop-scale";
import {
  HintList,
  HintRow,
  ReasonRow,
} from "../../../components/shortcuts/HintList";
import { ShortcutKeys } from "../../../components/shortcuts/Kbd";
import { useShopState } from "../../useShell";
import { useTargeting } from "../useTargeting";
import { OverlayFrameContext } from "./OverlayLayer";

/**
 * The for-sale stand's hint chips, pinned over the table the way the
 * truck's bed wears its own. Sellable work in hand goes out with F, and
 * E takes the newest piece back.
 */
export const StandPrompt: React.FC<{ canvasWidth: number }> = ({
  canvasWidth,
}) => {
  const gameState = useShopState();
  const { machine: targetedMachine } = useTargeting();
  const frame = useContext(OverlayFrameContext);

  if (
    gameState.player.away ||
    gameState.player.carriedMachine != null ||
    !atStand(gameState.shopInfo, gameState.player.position)
  ) {
    return null;
  }

  const interact = resolveInteract(gameState, targetedMachine);
  const sellableInHand = gameState.player.inventory.some(isSellable);

  const rows: React.ReactNode[] = [];
  if (interact?.kind === "stand") {
    rows.push(
      // Named by the shared resolver, so the chip and the outlined piece
      // on the table always agree about what E takes back.
      <HintRow key="take" keys={<ShortcutKeys shortcut="pick-up" />}>
        {interactLabel(interact)}
        {interact.count > 1 && ` (${interact.count})`}
      </HintRow>,
    );
  } else if (gameState.stand.length > 0) {
    // Stock on the table but the hands can't take it back — say why
    // instead of letting the chip go quiet about it.
    const takeBlocked = takeBlockedReason(gameState);
    if (takeBlocked) {
      rows.push(<ReasonRow key="take-blocked">{takeBlocked}</ReasonRow>);
    }
  }
  if (sellableInHand) {
    rows.push(
      // Just the verb: the hands strip already names what's in hand, and
      // the chip's own title says where it's going.
      <HintRow key="place" keys={<ShortcutKeys shortcut="put-down" />}>
        set out for sale
      </HintRow>,
    );
  }
  if (rows.length === 0) {
    return null;
  }

  const rect = standRect(gameState.shopInfo);
  const cellPx = PIXELS_PER_CELL * frame.scale;
  const centerX = frame.origin[0] + ((rect.min[0] + rect.max[0]) / 2) * cellPx;
  return (
    <div
      className="absolute z-10"
      style={{
        left: Math.min(Math.max(centerX, 70), canvasWidth - 70),
        top: frame.origin[1] + rect.min[1] * cellPx - 4,
        transform: "translate(-50%, -100%)",
      }}
    >
      <HintList testId="stand-chips">
        <HintRow className="text-paper-manila/60">For-Sale Stand</HintRow>
        {rows}
      </HintList>
    </div>
  );
};
