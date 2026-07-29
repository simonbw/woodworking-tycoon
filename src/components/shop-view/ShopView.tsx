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
import {
  setOperatingAction,
  setSweepAimAction,
} from "../../game/game-actions/player-actions";
import { SWEEP_AIM_REACH } from "../../game/game-actions/dust-actions";
import { holdingBroom } from "../../game/HeldTool";
import { resolveInteract } from "../../game/interact";
import { clamp } from "../../utils/mathUtils";
import { usePaused } from "../PauseContext";
import { BroomSprite } from "./BroomSprite";
import { CarriedMachineLayer } from "./CarriedMachineLayer";
import {
  CollisionDebugLayer,
  collisionDebugRequested,
} from "./CollisionDebugLayer";
import { DustLayer } from "./DustLayer";
import { DustMotionLayer } from "./DustMotionLayer";
import { EntranceSprite } from "./EntranceSprite";
import { FeedLaneLayer } from "./FeedLaneLayer";
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
import { EnvironmentLayer } from "./EnvironmentLayer";
import { PIXELS_PER_CELL, cellToPixel, cellToPixelVec } from "./shop-scale";

/**
 * Grass and driveway kept visible around the building when fitting the
 * camera, in world pixels — the apron is what makes the shop read as a
 * building on a lot instead of a floor grid pinned to the viewport.
 */
const LOT_APRON = PIXELS_PER_CELL * 3;

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
 * follows them afterwards, so the canvas tracks the container as the
 * viewport resizes (the world container's offset and scale already do).
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
    machine: targetedMachine,
    machines: operableHere,
    isTargeted,
    setTarget,
    toggleSheet,
  } = useTargetedMachine();

  // The pile E is about to grab wears the shared targeting outline —
  // resolved by the same resolver the keyboard uses, so the highlight and
  // the keypress can never disagree about which piece leaves the floor.
  const interact = resolveInteract(gameState, targetedMachine);
  const pickupTarget =
    interact?.kind === "pick-up-floor" ? interact.piles[0] : undefined;

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

  // The world is the screen: the canvas fills the viewport edge to edge
  // and the building is centered inside it with a fitted apron of lot
  // around it (see LOT_APRON). The renderer runs at the scaled resolution
  // with the world drawn through one scaled root container, so the
  // (2×-resolution) sprite art gains real detail instead of being
  // CSS-stretched.
  //
  // `null` until the container is measured — the canvas doesn't mount
  // until then, so its very first appearance is already at the fitted
  // size (the renderer snapshots its size on init; mounting it at a
  // placeholder size would flash small, then jump).
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{
    scale: number;
    width: number;
    height: number;
  } | null>(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const rect = container.getBoundingClientRect();
      const fit = Math.min(
        rect.width / (width + LOT_APRON * 2),
        rect.height / (height + LOT_APRON * 2),
      );
      // Quantized so ordinary layout jitter doesn't rebuild the renderer
      setView({
        scale: Math.min(2, Math.max(0.5, Math.floor(fit * 20) / 20)),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [width, height]);

  if (view === null) {
    return <div ref={containerRef} className="h-full w-full min-h-0 min-w-0" />;
  }

  const { scale } = view;
  const scaledWidth = Math.round(width * scale);
  const scaledHeight = Math.round(height * scale);
  // Where the shop floor's origin lands on the canvas
  const offsetX = Math.round((view.width - scaledWidth) / 2);
  const offsetY = Math.round((view.height - scaledHeight) / 2);

  // The mouse steers the broom head: while the broom is in hand, the
  // cursor's floor cell (clamped to arm's reach) becomes the sweep aim,
  // and the swath works there instead of the facing direction. Purely an
  // aim refinement — WASD alone still sweeps ahead of you. Listened for
  // on the DOM container, where the floor mapping is these two offsets.
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!holdingBroom(gameState)) {
      updateGameState(setSweepAimAction(null));
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const cellX = Math.floor(
      (event.clientX - rect.left - offsetX) / (scale * PIXELS_PER_CELL),
    );
    const cellY = Math.floor(
      (event.clientY - rect.top - offsetY) / (scale * PIXELS_PER_CELL),
    );
    const [px, py] = gameState.player.position;
    updateGameState(
      setSweepAimAction([
        px + clamp(cellX - px, -SWEEP_AIM_REACH, SWEEP_AIM_REACH),
        py + clamp(cellY - py, -SWEEP_AIM_REACH, SWEEP_AIM_REACH),
      ]),
    );
  };
  const clearAim = () => updateGameState(setSweepAimAction(null));
  // What the canvas can see, in world pixels — the lot fills all of it
  const worldViewport = {
    left: -offsetX / scale,
    top: -offsetY / scale,
    right: (view.width - offsetX) / scale,
    bottom: (view.height - offsetY) / scale,
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full min-h-0 min-w-0 overflow-hidden"
      onPointerMove={handlePointerMove}
      onPointerLeave={clearAim}
    >
      <ShopKeyboardShortcuts />
      <HeldMovementListener enabled={!gameState.player.away && !modalOpen} />
      <HeldOperateListener
        enabled={!gameState.player.away && !modalOpen}
        onChange={(held) => updateGameState(setOperatingAction(held))}
      />
      <Application
        width={view.width}
        height={view.height}
        backgroundAlpha={0}
        antialias={true}
        onInit={capRenderRate}
      >
        <gameStateContext.Provider
          value={{ gameState, updateGameState, saveGame, quitToMenu }}
        >
          <RendererSize width={view.width} height={view.height} />
          <pixiContainer x={offsetX} y={offsetY} scale={scale}>
            <EnvironmentLayer
              width={width}
              height={height}
              viewport={worldViewport}
            />
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
                    <MaterialPilesSprite
                      materialPiles={materialPiles}
                      highlightedPile={pickupTarget}
                    />
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
              {/* Painted over the machines: a blocked lane cell is usually
                  *under* the machine that's blocking it */}
              <FeedLaneLayer />
              {collisionDebugRequested() && <CollisionDebugLayer />}
              <PlayerMotionLayer paused={paused} />
              <FootstepSoundLayer />
              <ShopVacSprite />
              {!gameState.player.away && (
                <PersonSprite person={gameState.player} />
              )}
              {/* Dust in flight rides above the tools taking it */}
              <DustMotionLayer />
              <CarriedMachineLayer />
            </pixiContainer>
          </gameStateContext.Provider>
        </Application>
        {/* The DOM overlay sits exactly on the shop floor's box, so every
            anchor inside keeps world-times-scale coordinates */}
        <div
          className="absolute z-30 pointer-events-none"
          style={{
            left: offsetX,
            top: offsetY,
            width: scaledWidth,
            height: scaledHeight,
          }}
        >
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
