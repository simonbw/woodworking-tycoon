import { AutoPauser } from "./core/AutoPauser";
import { Game } from "./core/Game";
import { polyfill } from "./core/Polyfills";
import { GameState } from "./game/GameState";
import { machineKey } from "./game/Machine";
import { pryPalletNail, startGlueUp } from "./sim/commands/bench-commands";
import {
  finishAttendedWork,
  operateMachine,
} from "./sim/commands/machine-commands";
import { MachineEntity } from "./sim/entities/MachineEntity";
import { projectGameState } from "./sim/projection";
import { TimeFlow } from "./sim/TimeFlow";
import { loadGameState } from "./sim/save/fixture";
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
import { preloadSounds } from "./utils/soundAssets";
import { preloadUiImages } from "./utils/uiImages";
import { CameraRig } from "./views/CameraRig";
import { CANVAS_RESOLUTION } from "./views/canvas-resolution";
import { MousePicking } from "./views/MousePicking";
import { FootstepSoundView, walkingPlayer } from "./views/FootstepSoundView";
import { MachineSoundView } from "./views/MachineSoundView";
import { MovementInput } from "./views/MovementInput";
import { SoundView } from "./views/SoundView";
import { TargetHighlightView } from "./views/TargetHighlightView";
import { TutorialHighlightView } from "./views/TutorialHighlightView";
import { registerAllViews } from "./views/register";
// The shop-state fixtures, on window for the specs and for poking at
// the world from the console (see tests/fixtures/index.ts).
import "../tests/fixtures";

/**
 * The game: an entity world, its views, and the shell over it. This is
 * where the standing entities are put in place and the world is left
 * empty for the start menu to fill.
 */

async function main() {
  polyfill();
  registerAllViews();
  // index.html links the stylesheet that declares every face, so
  // loadFonts finds them all — including the stand sign's canvas-drawn
  // Shantell Notes, which must be in before StandView's first draw.
  await Promise.all([loadAssets(), loadFonts()]);

  const game = new Game();
  await game.init({
    rendererOptions: {
      background: "#1f1c18",
      // High-density displays render at their real pixel ratio (capped);
      // the outline filters rasterize at the same number, or the rimmed
      // object comes back blurry (see canvas-resolution.ts).
      resolution: CANVAS_RESOLUTION,
    },
  });

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
  game.addEntity(new FootstepSoundView(walkingPlayer));
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
  // tab goes away mid-idle. `pagehide` covers the tab closing or
  // navigating; a phone that evicts a backgrounded tab never fires it, so
  // the tab going hidden saves too. The flush is synchronous and doesn't
  // need a tick, so the AutoPauser freezing the world on the same event
  // makes no difference to it.
  const flushSave = () => saveManager.flush();
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushSave();
    }
  });

  // No shop boots here: the world stays empty (every input and view
  // entity stands down without a Player), so the HUD root shows the
  // start menu, and its buttons boot the shop — fresh, or from the
  // engine save slot. A quit-to-menu reload lands back here with
  // Continue on offer.

  // Handy for poking at the world from the console while the shell is bare.
  (window as unknown as { game: Game }).game = game;

  // The menu is the first real paint; the boot placeholder has done its job.
  document.getElementById("boot-loading")?.remove();

  // The overlays' own images aren't on screen yet, and nothing can be heard
  // before the first user gesture, so images and sounds warm in the
  // background instead of holding up the first frame.
  preloadUiImages();
  preloadSounds();

  installTestHooks(game);
}

/**
 * The E2E surface: read and replace the world, advance it synchronously,
 * pause it, and throttle rendering. Dev/test builds only.
 *
 * State reads and writes speak the shop-state shape the specs are
 * written against — `projectGameState` out, the fixture loader in, the
 * same two directions the sequence tier's fixtures travel. The save
 * file, which is a different shape (entities and singletons), has its
 * own pair for the specs that care about what's on disk.
 */
function installTestHooks(game: Game) {
  if (process.env.NODE_ENV === "production") return;

  const hooks = window as unknown as {
    __GET_GAME_STATE__: () => GameState;
    __UPDATE_GAME_STATE__: (
      next: GameState | ((state: GameState) => GameState),
    ) => void;
    __GET_SAVE__: () => SaveFile;
    __LOAD_SAVE__: (save: SaveFile) => void;
    __ADVANCE_TICKS__: (ticks: number) => void;
    __SET_PAUSED__: (paused: boolean) => void;
    __START_OPERATION__: (machineIndex: number) => void;
    __FINISH_ATTENDED_WORK__: (machineIndex: number) => void;
    __PRY_PALLET_NAIL__: (machineIndex: number) => void;
    __START_GLUE_UP__: (
      machineIndex: number,
      pieceIds: ReadonlyArray<string>,
    ) => void;
  };
  hooks.__GET_GAME_STATE__ = () => projectGameState(game);
  hooks.__UPDATE_GAME_STATE__ = (next) =>
    loadGameState(
      game,
      typeof next === "function" ? next(projectGameState(game)) : next,
    );
  hooks.__GET_SAVE__ = () => serializeGame(game);
  hooks.__LOAD_SAVE__ = (save) => loadSaveFile(game, save);
  // A tick a spec asks for is a tick of the *shop's* clock: the clock is
  // spend-to-advance, so an idle shop would creep through an engine tick
  // without the minute the spec is waiting on. Forced minutes are the
  // driver's own path
  // (ShopDriver.tick), served one per engine tick.
  hooks.__ADVANCE_TICKS__ = (ticks) => {
    const timeFlow = game.entities.getSingleton(TimeFlow);
    for (let i = 0; i < ticks; i++) {
      timeFlow.forceMinutes(1);
      game.step(1);
    }
  };
  hooks.__SET_PAUSED__ = (paused) => (paused ? game.pause() : game.unpause());

  // The bench's commits, by the machine's place in the shop-state list:
  // hand work finishes through the same commands the gestures dispatch
  // (docs/bench-work.md, decision 1), and a spec that isn't testing the
  // gesture drives them straight. Never exposed as UI.
  const bench = (machineIndex: number): MachineEntity | null =>
    machineEntities(game)[machineIndex] ?? null;
  hooks.__START_OPERATION__ = (machineIndex) => {
    const entity = bench(machineIndex);
    if (entity) operateMachine(game, entity);
  };
  hooks.__FINISH_ATTENDED_WORK__ = (machineIndex) => {
    const entity = bench(machineIndex);
    if (entity) finishAttendedWork(game, entity);
  };
  hooks.__PRY_PALLET_NAIL__ = (machineIndex) => {
    const entity = bench(machineIndex);
    if (entity) pryPalletNail(game, entity);
  };
  hooks.__START_GLUE_UP__ = (machineIndex, pieceIds) => {
    const entity = bench(machineIndex);
    if (entity) startGlueUp(game, entity, pieceIds);
  };

  const fps = Number(process.env.E2E_RENDER_FPS);
  if (Number.isFinite(fps) && fps > 0) {
    game.renderFpsCap = fps;
  }
}

main();

/**
 * The machines in the order shop state lists them, so an index taken
 * from `__GET_GAME_STATE__().machines` names the same one here.
 */
function machineEntities(game: Game): MachineEntity[] {
  const keys = projectGameState(game).machines.map((state) =>
    machineKey(state),
  );
  const byKey = new Map(
    [...game.entities.byConstructor(MachineEntity)].map((entity) => [
      machineKey(entity.state),
      entity,
    ]),
  );
  return keys
    .map((key) => byKey.get(key))
    .filter((entity): entity is MachineEntity => entity != null);
}
