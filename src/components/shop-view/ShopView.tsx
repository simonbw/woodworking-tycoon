import { Application, useApplication } from "@pixi/react";
import type { Application as PixiApplication } from "pixi.js";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCellMap } from "../useCellMap";
import { isSameMachine, machineKey } from "../../game/Machine";
import { vectorKey } from "../../game/Vectors";
import { useTexture } from "../../utils/useTexture";
import {
  gameStateContext,
  useApplyGameAction,
  useGameState,
  useMachines,
  useQuitToMenu,
  useSaveGame,
} from "../useGameState";
import { useModalOpen } from "../shortcuts/ShortcutProvider";
import { setOperatingAction } from "../../game/game-actions/player-actions";
import { usePaused } from "../PauseContext";
import { BroomSprite } from "./BroomSprite";
import { CarriedMachineLayer } from "./CarriedMachineLayer";
import {
  CollisionDebugLayer,
  collisionDebugRequested,
} from "./CollisionDebugLayer";
import { DustLayer } from "./DustLayer";
import { EntranceSprite } from "./EntranceSprite";
import { FloorTileSprite } from "./FloorTileSprite";
import { HeldMovementListener } from "./heldMovementInput";
import { HeldOperateListener } from "./heldOperateInput";
import { MachineCrateSprite } from "./MachineCrateSprite";
import { MachineSprite } from "./MachineSprite";
import { useTargetedMachine } from "../TargetedMachineContext";
import { ShopOverlayLayer } from "../shop-overlay/ShopOverlayLayer";
import { MaterialPilesSprite } from "./MaterialPileSprite";
import { PersonSprite } from "./PersonSprite";
import { FootstepSoundLayer } from "./FootstepSoundLayer";
import { PlayerMotionLayer } from "./PlayerMotionLayer";
import { ShopKeyboardShortcuts } from "./ShopKeyboardShortcuts";
import { ShopVacSprite } from "./ShopVacSprite";
import { cellToPixel, cellToPixelVec } from "./shop-scale";

/**
 * How much of the shop's pixels the E2E build actually rasterizes. The
 * suite never looks at them — one spec checks the canvas is on screen and
 * nothing reads back a colour — but headless Chromium has no GPU, so every
 * frame is a software raster of the full canvas, and that is the largest
 * single cost in the suite. A tenth in each axis leaves a hundredth of the
 * fill work. Only the backing store shrinks: CSS size, hit testing, and
 * the ticker's deltas are all in logical pixels, so nothing a spec drives
 * can tell the difference.
 */
const E2E_RENDER_SCALE = 0.1;

/**
 * Trim the renderer down when the E2E server asks for it (E2E_RENDER_FPS;
 * every other build leaves this empty and the ticker runs free at full
 * resolution).
 *
 * Headless Chromium runs rAF as fast as it can, and a render loop that
 * never yields keeps the main thread busy enough that every Playwright
 * round-trip has to queue behind a frame — measured at 13ms against 0.8ms
 * with the canvas gone. That tax lands on every click and every assertion
 * in the suite. Capping the rate hands the thread back between frames.
 *
 * Don't cap below 10. Walking integrates off the ticker's delta, and
 * PlayerMotionLayer clamps that delta to 100ms so a tab-switch hitch can't
 * fling the body — which means at any rate slower than 10fps the clamp bites
 * every frame and the player covers less ground per second than they should.
 * At 5fps the body walked at half speed, and the movement specs' waits went
 * from comfortable to marginal. Ten is where the clamp stops mattering; going
 * higher buys nothing measurable now that the resolution is scaled down.
 */
function capRenderRate(app: PixiApplication): void {
  const fps = Number(process.env.E2E_RENDER_FPS);
  if (Number.isFinite(fps) && fps > 0) {
    app.ticker.maxFPS = fps;
    app.renderer.resolution = E2E_RENDER_SCALE;
  }
}

/**
 * Application's width/height props only apply at renderer init — this
 * follows them afterwards, so the canvas tracks the fit-to-column scale
 * (the wrapper and the world container already do).
 */
const RendererSize: React.FC<{ width: number; height: number }> = ({
  width,
  height,
}) => {
  const { app } = useApplication();
  useEffect(() => {
    if (
      app?.renderer &&
      (app.renderer.width !== width || app.renderer.height !== height)
    ) {
      app.renderer.resize(width, height);
    }
  }, [app, width, height]);
  return null;
};

export const ShopView: React.FC = () => {
  const gameState = useGameState();
  const machines = useMachines();
  const updateGameState = useApplyGameAction();
  const saveGame = useSaveGame();
  const quitToMenu = useQuitToMenu();
  const cellMap = useCellMap();
  const floorTexture = useTexture("/images/concrete-floor-2-big.png");
  const modalOpen = useModalOpen();
  const { paused } = usePaused();
  const {
    machines: operableHere,
    isTargeted,
    setTarget,
    toggleSheet,
  } = useTargetedMachine();

  // Clicking a machine you're standing at aims the keyboard at it; a
  // second click on a recipe-driven station spreads its sheet open. The
  // mouse can't reach machines you're not at — walk over first.
  const machineClickHandler = (machine: (typeof machines)[number]) => {
    const reachable = operableHere.some((candidate) =>
      isSameMachine(candidate.state, machine.state),
    );
    if (!reachable) return undefined;
    return () => {
      if (!isTargeted(machine)) {
        setTarget(machine);
      } else {
        toggleSheet();
      }
    };
  };

  const materialPileGroups = cellMap
    .getCells()
    .filter((cell) => cell.materialPiles.length > 0)
    .map((cell) => cell.materialPiles);

  const width = cellToPixel(cellMap.getWidth());
  const height = cellToPixel(cellMap.getHeight());

  // The shop is the screen: the canvas scales to fill whatever space the
  // rails leave it. The renderer runs at the scaled resolution with the
  // world drawn through one scaled root container, so the (2×-resolution)
  // sprite art gains real detail instead of being CSS-stretched.
  //
  // `null` until the column is measured — the canvas doesn't mount until
  // then, so its very first appearance is already at the fitted size
  // (the renderer snapshots its size on init; mounting it at a
  // placeholder size would flash small, then jump).
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const rect = container.getBoundingClientRect();
      const fit = Math.min(rect.width / width, rect.height / height);
      // Quantized so ordinary layout jitter doesn't rebuild the renderer
      setScale(Math.min(2, Math.max(0.5, Math.floor(fit * 20) / 20)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [width, height]);

  if (scale === null) {
    return (
      <div
        ref={containerRef}
        className="h-full w-full min-h-0 min-w-0 flex items-center justify-center"
      />
    );
  }

  const scaledWidth = Math.round(width * scale);
  const scaledHeight = Math.round(height * scale);

  return (
    <div
      ref={containerRef}
      className="h-full w-full min-h-0 min-w-0 flex items-center justify-center"
    >
      <div
        className="relative"
        style={{ width: scaledWidth, height: scaledHeight }}
      >
        <ShopKeyboardShortcuts />
        <HeldMovementListener enabled={!gameState.player.away && !modalOpen} />
        <HeldOperateListener
          enabled={!gameState.player.away && !modalOpen}
          onChange={(held) => updateGameState(setOperatingAction(held))}
        />
        <Application
          width={scaledWidth}
          height={scaledHeight}
          backgroundAlpha={0}
          antialias={true}
          onInit={capRenderRate}
        >
          <gameStateContext.Provider
            value={{ gameState, updateGameState, saveGame, quitToMenu }}
          >
            <RendererSize width={scaledWidth} height={scaledHeight} />
            <pixiContainer scale={scale}>
              <pixiTilingSprite
                eventMode="static"
                texture={floorTexture}
                tilePosition={{ x: 0, y: 0 }}
                tileScale={{ x: 0.25, y: 0.25 }}
                width={width}
                height={height}
              />
              {cellMap.getCells().map((cell) => (
                <FloorTileSprite
                  cell={cell}
                  key={`cell-${vectorKey(cell.position)}`}
                />
              ))}
              <EntranceSprite />
              {/* Settled sawdust sits on the floor, under everything that moves */}
              <DustLayer width={width} height={height} />
              {gameState.progression.sweepingUnlocked && <BroomSprite />}

              {gameState.machineCrates.map((crate, index) => (
                <MachineCrateSprite
                  crate={crate}
                  key={`crate-${index}-${vectorKey(crate.position)}`}
                />
              ))}

              {materialPileGroups.map((materialPiles, i) => {
                const [x, y] = cellToPixelVec(materialPiles[0].position);
                return (
                  <pixiContainer
                    key={`pile${vectorKey(materialPiles[0].position)}`}
                    x={x}
                    y={y}
                  >
                    <MaterialPilesSprite materialPiles={materialPiles} />
                  </pixiContainer>
                );
              })}
              {[...machines]
                // Worktables draw first so mounted benchtop machines sit on top
                .sort(
                  (a, b) =>
                    Number(b.type.worktable ?? false) -
                    Number(a.type.worktable ?? false),
                )
                .map((machinePlacement) => (
                  <MachineSprite
                    key={machineKey(machinePlacement.state)}
                    machine={machinePlacement}
                    isSelected={
                      !gameState.player.away &&
                      gameState.player.carriedMachine == null &&
                      isTargeted(machinePlacement)
                    }
                    onClick={machineClickHandler(machinePlacement)}
                  />
                ))}
              {collisionDebugRequested() && <CollisionDebugLayer />}
              <PlayerMotionLayer paused={paused} />
              <FootstepSoundLayer />
              <ShopVacSprite />
              {!gameState.player.away && (
                <PersonSprite person={gameState.player} />
              )}
              <CarriedMachineLayer />
            </pixiContainer>
          </gameStateContext.Provider>
        </Application>
        {/* Everything you can do, shown at the thing you'd do it to */}
        <ShopOverlayLayer
          width={scaledWidth}
          height={scaledHeight}
          scale={scale}
        />
      </div>
    </div>
  );
};
