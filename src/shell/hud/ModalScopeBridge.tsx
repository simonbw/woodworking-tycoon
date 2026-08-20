import React, { useEffect } from "react";
import { useModalOpen } from "../../components/shortcuts/ShortcutProvider";
import { ShellStore } from "../ShellStore";
import { useGame } from "../useShell";

/**
 * Mirrors the ShortcutProvider's modal scope into the ShellStore, so the
 * engine's input entities know when a DOM dialog owns the keyboard. The
 * provider tracks scope for the DOM tree on its own; this is the one
 * wire back down to the entity world.
 */
export const ModalScopeBridge: React.FC = () => {
  const game = useGame();
  const modalOpen = useModalOpen();

  useEffect(() => {
    game.entities.getSingleton(ShellStore).setModalOpen(modalOpen);
  }, [game, modalOpen]);

  return null;
};
