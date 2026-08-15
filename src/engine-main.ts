import { Assets } from "pixi.js";
import { AutoPauser } from "./core/AutoPauser";
import { Game } from "./core/Game";
import { polyfill } from "./core/Polyfills";
import { CameraPanController } from "./engine-shell/CameraPanController";
import { EmptyLot } from "./engine-shell/EmptyLot";

/**
 * The engine shell: the entity-based rebuild of the game, running alongside
 * the current app while the migration is in progress (see MIGRATION.md).
 * Served at /engine.html.
 */
async function main() {
  polyfill();

  const textures = ["/images/grass.png", "/images/asphalt.png"];
  for (const path of textures) {
    Assets.add({ alias: path, src: path });
  }
  await Assets.load(textures);

  const game = new Game();
  await game.init({ rendererOptions: { background: "#1f1c18" } });

  game.camera.z = 30;
  game.addEntity(new AutoPauser());
  game.addEntity(new EmptyLot());
  game.addEntity(new CameraPanController());

  // Handy for poking at the world from the console while the shell is bare.
  (window as unknown as { game: Game }).game = game;
}

main();
