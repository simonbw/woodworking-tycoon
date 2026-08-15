import { AutoPauser } from "./core/AutoPauser";
import { Game } from "./core/Game";
import { polyfill } from "./core/Polyfills";
import { loadSaveFile, SaveFile, serializeGame } from "./sim/save/SaveFile";
import { SaveManager } from "./sim/save/SaveManager";
import { ShortcutDispatcher } from "./shell/dispatch/ShortcutDispatcher";
import { TargetingState } from "./shell/dispatch/TargetingState";
import { HudRoot } from "./shell/HudRoot";
import { OverlayRoot } from "./shell/OverlayRoot";
import { writeEngineSave } from "./shell/saveSlot";
import { ShellStore } from "./shell/ShellStore";
import { loadAssets } from "./utils/loadAssets";
import { loadFonts } from "./utils/loadFonts";
import { CameraRig } from "./views/CameraRig";
import { DaylightView } from "./views/DaylightView";
import { EnvironmentView } from "./views/EnvironmentView";
import { FloorView } from "./views/FloorView";
import { MousePicking } from "./views/MousePicking";
import { MovementInput } from "./views/MovementInput";
import { TargetHighlightView } from "./views/TargetHighlightView";
import { TutorialHighlightView } from "./views/TutorialHighlightView";
import { PowerCordView } from "./views/PowerCordView";
import { registerAllViews } from "./views/register";

/**
 * The engine shell: the entity-based rebuild of the game, running alongside
 * the current app while the migration is in progress (see MIGRATION.md).
 * Served at /engine.html.
 */

async function main() {
  polyfill();
  registerAllViews();
  // engine.html links the same stylesheet as the old shell, so loadFonts
  // finds every declared face — including the stand sign's canvas-drawn
  // Shantell Notes, which must be in before StandView's first draw.
  await Promise.all([loadAssets(), loadFonts()]);

  const game = new Game();
  await game.init({ rendererOptions: { background: "#1f1c18" } });

  game.addEntity(new AutoPauser());
  game.addEntity(new CameraRig());
  // Scenery views (each draws on its own layer; sim-paired views spawn
  // through the view registry instead): the lot, the slab over it, the
  // cords on the slab, and the light over the whole world.
  game.addEntity(new EnvironmentView());
  game.addEntity(new FloorView());
  game.addEntity(new PowerCordView());
  game.addEntity(new DaylightView());
  game.addEntity(new MovementInput());
  game.addEntity(new TargetingState());
  game.addEntity(new ShortcutDispatcher());
  game.addEntity(new MousePicking());
  game.addEntity(new TargetHighlightView());
  // After the white rim on purpose: the coach's orange yields to it.
  game.addEntity(new TutorialHighlightView());
  // The DOM layer: the state-change signal first, then the React roots
  // that resolve it at first render — the HUD (screen-anchored, renders
  // on signals) and the overlay (world-pinned, re-renders every frame
  // to ride the camera).
  game.addEntity(new ShellStore());
  game.addEntity(new HudRoot());
  game.addEntity(new OverlayRoot());

  const saveManager = game.addEntity(
    new SaveManager({ write: writeEngineSave }),
  );
  // Because a save is always waiting, the write must land even when the
  // tab goes away mid-idle.
  window.addEventListener("pagehide", () => saveManager.flush());

  // No shop boots here: the world stays empty (every input and view
  // entity stands down without a Player), so the HUD root shows the
  // start menu, and its buttons boot the shop — fresh, or from the
  // engine save slot. A quit-to-menu reload lands back here with
  // Continue on offer.

  // Handy for poking at the world from the console while the shell is bare.
  (window as unknown as { game: Game }).game = game;

  // The menu is the first real paint; the boot placeholder has done its job.
  document.getElementById("boot-loading")?.remove();

  installTestHooks(game);
}

/**
 * The E2E surface, same contract as the old shell's Ticker hooks: read
 * and replace the world, advance it synchronously, pause it, and throttle
 * rendering (see capRenderRate in WorldScene for why E2E builds cap).
 * Dev/test builds only.
 */
function installTestHooks(game: Game) {
  if (process.env.NODE_ENV === "production") return;

  const hooks = window as unknown as {
    __GET_GAME_STATE__: () => SaveFile;
    __UPDATE_GAME_STATE__: (save: SaveFile) => void;
    __ADVANCE_TICKS__: (ticks: number) => void;
    __SET_PAUSED__: (paused: boolean) => void;
  };
  hooks.__GET_GAME_STATE__ = () => serializeGame(game);
  hooks.__UPDATE_GAME_STATE__ = (save) => loadSaveFile(game, save);
  hooks.__ADVANCE_TICKS__ = (ticks) => game.step(ticks);
  hooks.__SET_PAUSED__ = (paused) => (paused ? game.pause() : game.unpause());

  const fps = Number(process.env.E2E_RENDER_FPS);
  if (Number.isFinite(fps) && fps > 0) {
    game.renderFpsCap = fps;
  }
}

main();
