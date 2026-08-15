import React from "react";
import { ShortcutProvider } from "../components/shortcuts/ShortcutProvider";
import { Persistence } from "../config/constants";
import { ReactEntity } from "../core/ReactEntity";
import { V } from "../core/Vector";
import { OverlayFrameContext, OverlayLayer } from "./hud/overlay/OverlayLayer";
import { ShellProvider, useShopOpen } from "./useShell";

/** The overlay only exists while a shop is live (a Player is in play). */
const OverlayGate: React.FC = () => {
  const open = useShopOpen();
  return open ? <OverlayLayer /> : null;
};

/**
 * The world-pinned DOM layer — the old ShopOverlayLayer's mount point.
 * Where the HUD root renders on state-change signals, this one rides the
 * camera: `autoRender` stays on, so the tree re-renders every frame with
 * the camera's current transform and the chips stay pinned to the things
 * they annotate while the view scrolls. The per-frame tree is kept
 * small — the chips on the targeted machine, the prompts at the stand
 * and the truck, the player's own cluster; the big screen-anchored
 * cards (station sheet, floor sheet) live in the HUD root instead.
 *
 * Its own ShortcutProvider hosts the trip card's DOM-side bindings
 * (panel cursor, door digits) — a separate React root can't reach the
 * HUD root's provider, and the ids the two register never overlap. The
 * modal scope is mirrored through the ShellStore (the card's bindings
 * gate on it), since the modals all mount under the HUD root.
 */
export class OverlayRoot extends ReactEntity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  constructor() {
    super(() => {
      const renderer = this.game.renderer;
      if (!renderer) {
        return <></>;
      }
      const camera = this.game.camera;
      const origin = camera.toScreen(V(0, 0));
      return (
        <ShellProvider game={this.game}>
          <ShortcutProvider>
            <OverlayFrameContext.Provider
              value={{
                origin: [origin[0], origin[1]],
                scale: camera.z,
                width: renderer.getWidth(),
                height: renderer.getHeight(),
              }}
            >
              <OverlayGate />
            </OverlayFrameContext.Provider>
          </ShortcutProvider>
        </ShellProvider>
      );
    }, true);
  }

  onAdd() {
    super.onAdd();
    // A fixed sheet over the whole canvas that ignores the pointer; the
    // prompts that take clicks (the trip card) opt back in. Below the
    // HUD root's 10, so screen chrome always wins the stack.
    Object.assign(this.el.style, {
      position: "fixed",
      inset: "0",
      zIndex: "5",
      pointerEvents: "none",
    });
  }
}
