import { AutoPauser } from "./core/AutoPauser";
import { Game } from "./core/Game";
import { polyfill } from "./core/Polyfills";
import { loadSaveFile, SaveFile, serializeGame } from "./sim/save/SaveFile";
import { SaveManager } from "./sim/save/SaveManager";
import { ShortcutDispatcher } from "./shell/dispatch/ShortcutDispatcher";
import { TargetingState } from "./shell/dispatch/TargetingState";
import { HudRoot } from "./shell/HudRoot";
import { OverlayRoot } from "./shell/OverlayRoot";
import { PayoutBuffer } from "./shell/PayoutBuffer";
import { BenchDive } from "./shell/scenes/bench/BenchDive";
import { BenchArrangeView } from "./shell/scenes/bench/BenchArrangeView";
import { BenchAssemblyView } from "./shell/scenes/bench/BenchAssemblyView";
import { BenchDiveView } from "./shell/scenes/bench/BenchDiveView";
import { BenchGlueView } from "./shell/scenes/bench/BenchGlueView";
import { BenchPryView } from "./shell/scenes/bench/BenchPryView";
import { BenchSawView } from "./shell/scenes/bench/BenchSawView";
import { BenchStrokeView } from "./shell/scenes/bench/BenchStrokeView";
import { SceneDirector } from "./shell/scenes/SceneDirector";
import { TripTheater } from "./shell/scenes/TripTheater";
import { writeEngineSave } from "./shell/saveSlot";
import { ShellStore } from "./shell/ShellStore";
import { loadAssets } from "./utils/loadAssets";
import { loadFonts } from "./utils/loadFonts";
import { CameraRig } from "./views/CameraRig";
import { MousePicking } from "./views/MousePicking";
import { FootstepSoundView } from "./views/FootstepSoundView";
import { MachineSoundView } from "./views/MachineSoundView";
import { MovementInput } from "./views/MovementInput";
import { SoundView } from "./views/SoundView";
import { TargetHighlightView } from "./views/TargetHighlightView";
import { TutorialHighlightView } from "./views/TutorialHighlightView";
import { registerAllViews } from "./views/register";

/**
 * The engine shell: the entity-based rebuild of the game, served at /.
 * The shell it replaced is still built beside it at /legacy.html, as the
 * reference this one is checked against until the migration's last
 * deletion lands (see MIGRATION.md).
 */

async function main() {
  polyfill();
  registerAllViews();
  // index.html links the same stylesheet as the old shell, so loadFonts
  // finds every declared face — including the stand sign's canvas-drawn
  // Shantell Notes, which must be in before StandView's first draw.
  await Promise.all([loadAssets(), loadFonts()]);

  const game = new Game();
  await game.init({ rendererOptions: { background: "#1f1c18" } });

  game.addEntity(new AutoPauser());
  game.addEntity(new CameraRig());
  // The venue's views — the shop's scenery, or the store's scene — are
  // the SceneDirector's to spawn and swap (phase 6's one-scene-at-a-time
  // contract); nothing scenery-shaped is added here directly.
  game.addEntity(new TripTheater());
  game.addEntity(new SceneDirector());
  // The bench dive: its state, and the zoomed surface over the world.
  game.addEntity(new BenchDive());
  game.addEntity(new BenchDiveView());
  game.addEntity(new BenchPryView());
  game.addEntity(new BenchSawView());
  game.addEntity(new BenchArrangeView());
  game.addEntity(new BenchGlueView());
  game.addEntity(new BenchAssemblyView());
  game.addEntity(new BenchStrokeView());
  game.addEntity(new MovementInput());
  game.addEntity(new SoundView());
  game.addEntity(new MachineSoundView());
  game.addEntity(new FootstepSoundView());
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
  game.addEntity(new PayoutBuffer());
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
