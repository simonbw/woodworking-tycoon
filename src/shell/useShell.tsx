import React, {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { Game } from "../core/Game";
import { GameState } from "../game/GameState";
import { Player } from "../sim/entities/Player";
import { projectGameState } from "../sim/projection";
import { ShellStore } from "./ShellStore";

/**
 * The DOM layer's hooks over the entity world — the successor of
 * `useGameState.tsx` (migration decision 8). The old provider handed
 * components an immutable `GameState` and re-rendered on every applied
 * action; here the sim mutates imperatively, so components subscribe to
 * the ShellStore's version signal via `useSyncExternalStore` and read
 * the world through the projection.
 *
 * `useShopState()` is the drop-in for the old `useGameState()`: a
 * read-only projected `GameState`, rebuilt once per version bump and
 * shared by every caller in the same render pass. Mutations don't go
 * back through a setter — components call the command layer
 * (`src/sim/commands/`) with the game from `useGame()`.
 */

interface ShellContextValue {
  game: Game;
  store: ShellStore;
}

const shellContext = createContext<ShellContextValue | undefined>(undefined);

export const ShellProvider: React.FC<{
  game: Game;
  children?: ReactNode;
}> = ({ game, children }) => {
  const value = useMemo(
    () => ({ game, store: game.entities.getSingleton(ShellStore) }),
    [game],
  );
  return (
    <shellContext.Provider value={value}>{children}</shellContext.Provider>
  );
};

function useShell(): ShellContextValue {
  const value = useContext(shellContext);
  if (value === undefined) {
    throw new Error("useShell must be used within a ShellProvider");
  }
  return value;
}

/** The running game, for reads the projection doesn't carry and for commands. */
export function useGame(): Game {
  return useShell().game;
}

/**
 * The ShellStore's version, subscribing the component to state changes.
 * The value itself only matters as a memo key.
 */
export function useShellVersion(): number {
  const { store } = useShell();
  return useSyncExternalStore(store.subscribe, store.getVersion);
}

/** Whether a shop is live — false on the menus, before any world exists. */
export function useShopOpen(): boolean {
  const { game } = useShell();
  useShellVersion();
  return game.entities.tryGetSingleton(Player) !== undefined;
}

/**
 * The world as `GameState`, read-only — the successor of
 * `useGameState()`. Only valid while a shop is open (`useShopOpen`).
 */
export function useShopState(): GameState {
  const { game } = useShell();
  const version = useShellVersion();
  // The projection is a fresh assembly each call; memoizing on the
  // version keeps one render pass to one assembly.
  return useMemo(() => projectGameState(game), [game, version]);
}
