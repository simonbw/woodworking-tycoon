import { AutoPauser } from "./core/AutoPauser";
import { Game } from "./core/Game";
import { polyfill } from "./core/Polyfills";
import { bootShop } from "./sim/bootstrap";
import { loadSaveFile, SaveFile, serializeGame } from "./sim/save/SaveFile";
import { SaveManager } from "./sim/save/SaveManager";
import { ShortcutDispatcher } from "./shell/dispatch/ShortcutDispatcher";
import { TargetingState } from "./shell/dispatch/TargetingState";
import { loadAssets } from "./utils/loadAssets";
import { CameraRig } from "./views/CameraRig";
import { DaylightView } from "./views/DaylightView";
import { EnvironmentView } from "./views/EnvironmentView";
import { FloorView } from "./views/FloorView";
import { MousePicking } from "./views/MousePicking";
import { MovementInput } from "./views/MovementInput";
import { TargetHighlightView } from "./views/TargetHighlightView";
import { PowerCordView } from "./views/PowerCordView";
import { registerAllViews } from "./views/register";

/**
 * The engine shell: the entity-based rebuild of the game, running alongside
 * the current app while the migration is in progress (see MIGRATION.md).
 * Served at /engine.html.
 */

/** The engine shell's own save slot — separate from the old shell's. */
const SAVE_KEY = "woodworking-tycoon-engine-save";

function readStoredSave(): SaveFile | undefined {
  try {
    const serialized = localStorage.getItem(SAVE_KEY);
    return serialized ? (JSON.parse(serialized) as SaveFile) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The one canvas-drawn typeface: the stand's hand-written FOR SALE sign
 * (StandView). The old shell got it from the CSS bundle's @font-face;
 * engine.html ships no stylesheet, so the shell registers the face
 * itself. The full font set arrives with the phase-5 DOM port.
 */
async function loadSignFont(): Promise<void> {
  try {
    const face = new FontFace(
      "Shantell Notes",
      'url("/fonts/shantell-notes.woff2") format("woff2")',
      { weight: "300 800" },
    );
    document.fonts.add(await face.load());
  } catch {
    // The sign falls back to the default face rather than blocking boot.
  }
}

async function main() {
  polyfill();
  registerAllViews();
  await Promise.all([loadAssets(), loadSignFont()]);

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

  const saveManager = game.addEntity(
    new SaveManager({
      write: (file) => localStorage.setItem(SAVE_KEY, JSON.stringify(file)),
    }),
  );
  // Because a save is always waiting, the write must land even when the
  // tab goes away mid-idle.
  window.addEventListener("pagehide", () => saveManager.flush());

  bootShop(game, readStoredSave());

  // Handy for poking at the world from the console while the shell is bare.
  (window as unknown as { game: Game }).game = game;

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
