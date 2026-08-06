import React from "react";
import { createPortal } from "react-dom";
import { MaterialPile } from "../../game/GameState";
import { pickUpMaterialAction } from "../../game/game-actions/player-actions";
import { resolveInteract } from "../../game/interact";
import { getMaterialFullName } from "../../game/material-helpers";
import { handSpaceLeft } from "../../game/Person";
import { formatCount } from "../../utils/formatNumber";
import { MaterialLabel } from "../MaterialLabel";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { Tooltip } from "../Tooltip";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * Everything lying within arm's reach, spread out on a card — what you'd
 * see by crouching down and going through the stack instead of taking the
 * top piece off it. Opened by right-clicking a piece on the floor.
 *
 * The floor's answer to a container's contents sheet, and for the same
 * reason: a stack is opaque from above. The rummage key (R) steps the
 * outline through these pieces one at a time, which works but only ever
 * shows you one of them; this shows the lot, and any of it can be taken
 * from here.
 *
 * Deliberately not a modal, like the station sheet: the world keeps
 * ticking and the floor's own keys stay live behind it.
 */
export const FloorSheet: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const {
    machine: targetedMachine,
    pileOffset,
    floorSheetOpen,
    closeFloorSheet,
    setPileTarget,
  } = useTargetedMachine();

  // Escape folds it up, ahead of the station sheet's own binding — this is
  // the innermost card on screen whenever it's open.
  useShortcut("close-sheet", closeFloorSheet, floorSheetOpen);

  const interact = resolveInteract(gameState, targetedMachine, pileOffset);
  const piles = interact?.kind === "pick-up-floor" ? interact.piles : [];
  const target = interact?.kind === "pick-up-floor" ? interact.target : null;

  if (!floorSheetOpen || piles.length === 0) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[35] flex items-center justify-center bg-ink-black/30 p-3 pt-24 pointer-events-auto"
      onClick={closeFloorSheet}
      data-testid="floor-sheet"
    >
      <div
        className="max-h-full w-full max-w-md overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <section className="paper-card space-y-3 shadow-xl">
          <header className="flex items-baseline justify-between border-b-2 border-ink-black/40 pb-1">
            <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
              Within reach
            </h3>
            <span className="flex items-center gap-3">
              <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade tabular-nums">
                {formatCount(piles.length)}{" "}
                {piles.length === 1 ? "piece" : "pieces"}
              </span>
              <Tooltip content="Leave it where it lies" shortcut="close-sheet">
                <button
                  className="button-paper text-xs leading-none"
                  onClick={closeFloorSheet}
                  aria-label="Close floor sheet"
                >
                  ✕
                </button>
              </Tooltip>
            </span>
          </header>
          <ul className="divide-y divide-ink-black/15 text-sm">
            {piles.map((pile) => (
              <FloorRow
                key={pile.material.id}
                pile={pile}
                targeted={pile === target}
                onTake={(all) => {
                  const space = handSpaceLeft(gameState.player);
                  const from = piles.indexOf(pile);
                  applyAction(
                    pickUpMaterialAction(
                      all
                        ? [...piles.slice(from), ...piles.slice(0, from)].slice(
                            0,
                            space,
                          )
                        : [pile],
                    ),
                  );
                }}
                onAim={() => setPileTarget(pile)}
              />
            ))}
          </ul>
        </section>
      </div>
    </div>,
    document.body,
  );
};

/**
 * One piece on the card. Pointing at the row aims the interact key at that
 * piece, the same way pointing at it on the floor does — so closing the
 * card leaves E on whatever you were just looking at.
 */
const FloorRow: React.FC<{
  pile: MaterialPile;
  targeted: boolean;
  onTake: (all: boolean) => void;
  onAim: () => void;
}> = ({ pile, targeted, onTake, onAim }) => {
  const gameState = useGameState();
  const handSpace = handSpaceLeft(gameState.player);
  return (
    <li
      className={`flex items-center gap-2 py-1.5 ${
        targeted ? "bg-ink-black/5" : ""
      }`}
      onPointerEnter={onAim}
      data-testid="floor-sheet-row"
      data-material={getMaterialFullName(pile.material)}
      data-targeted={targeted ? "true" : undefined}
    >
      <MaterialLabel material={pile.material} />
      <button
        className="button-paper ml-auto text-xs"
        disabled={handSpace === 0}
        title={handSpace === 0 ? "Hands full" : undefined}
        onClick={(event) => {
          if (handSpace === 0) return;
          onTake(event.shiftKey);
        }}
      >
        Take
      </button>
    </li>
  );
};
