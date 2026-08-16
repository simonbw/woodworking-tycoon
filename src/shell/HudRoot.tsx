import React from "react";
import { BrowserDefaultsGuard } from "../components/BrowserDefaultsGuard";
import { ShortcutProvider } from "../components/shortcuts/ShortcutProvider";
import { UiSoundLayer } from "../components/UiSoundLayer";
import { Persistence } from "../config/constants";
import { ReactEntity } from "../core/ReactEntity";
import { EngineHud } from "./hud/EngineHud";
import { ModalScopeBridge } from "./hud/ModalScopeBridge";
import { ShellProvider } from "./useShell";

/**
 * The DOM layer's mount point: a ReactEntity hosting the HUD tree over
 * the canvas. `autoRender` is off — the root renders once when added,
 * and everything after flows through the components' own
 * `useSyncExternalStore` subscriptions to the ShellStore, so a quiet
 * frame costs the DOM nothing (migration decision 8).
 *
 * Requires the ShellStore to be in the game already (ShellProvider
 * resolves it at first render).
 */
export class HudRoot extends ReactEntity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  constructor() {
    super(
      // The old shell's ShortcutProvider mounts verbatim — it's
      // self-contained (its own keydown listener, scopes, registrations)
      // and serves the DOM-side bindings (open-journal, close-modal, …);
      // the floor's keys stay with the engine's ShortcutDispatcher, and
      // the two never bind the same id. ModalScopeBridge tells the
      // engine's input entities when a dialog owns the keyboard.
      () => (
        <ShellProvider game={this.game}>
          <ShortcutProvider>
            <BrowserDefaultsGuard />
            {/* The old shell's UI sound layer mounts verbatim: it hangs
                its own listeners on the document and gives every button
                a hover tick and a press, with no game state involved. */}
            <UiSoundLayer />
            <ModalScopeBridge />
            <EngineHud />
          </ShortcutProvider>
        </ShellProvider>
      ),
      false,
    );
  }

  onAdd() {
    super.onAdd();
    // A fixed sheet over the whole canvas that ignores the pointer;
    // the HUD's chips opt back in (the HomePage layout contract).
    Object.assign(this.el.style, {
      position: "fixed",
      inset: "0",
      zIndex: "10",
      pointerEvents: "none",
    });
    this.reactRender();
  }
}
