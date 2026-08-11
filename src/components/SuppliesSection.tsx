import React, { useEffect, useRef, useState } from "react";
import { CLAMP_NAME, clampsInUse } from "../game/Clamp";
import { CONSUMABLE_TYPES, ConsumableId } from "../game/Consumable";
import { formatCount } from "../utils/formatNumber";
import { ConsumableIcon } from "./ItemIcon";
import { useGameState } from "./useGameState";

/**
 * The supply cabinet's running tally, folded into a collapsible panel on
 * the right edge just below the top bar: every consumable with stock on
 * hand, plus the clamp rack. It starts closed — the header alone says the
 * cabinet has something in it — and remembers whether you left it open.
 * Hidden entirely while the cabinet is empty so the early game stays
 * quiet, and while you're away on a trip.
 *
 * Unlike the other HUD chips it stays up during bench work (salvage
 * flights land on it — see flyToSupply), so it publishes its footprint as
 * `--supplies-clearance` on the root element for the bench view's
 * right-anchored glue-up cluster to start below.
 */

const OPEN_KEY = "woodworking-tycoon-supplies-open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "true";
  } catch {
    return false;
  }
}

export const SuppliesSection: React.FC = () => {
  const gameState = useGameState();
  const [open, setOpen] = useState(readOpen);
  const sectionRef = useRef<HTMLElement>(null);

  const stocked = (Object.keys(CONSUMABLE_TYPES) as ConsumableId[]).filter(
    (id) => (gameState.consumables[id] ?? 0) > 0,
  );
  const clampsOwned = gameState.clamps;
  const clampsHeld = clampsInUse(gameState.machines);
  const visible =
    !gameState.player.away && (stocked.length > 0 || clampsOwned > 0);

  useEffect(() => {
    const root = document.documentElement;
    const el = sectionRef.current;
    if (!el) {
      root.style.setProperty("--supplies-clearance", "0px");
      return;
    }
    const observer = new ResizeObserver(() => {
      // The 12px matches the HUD's space-y-3 rhythm
      root.style.setProperty(
        "--supplies-clearance",
        `${el.offsetHeight + 12}px`,
      );
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty("--supplies-clearance", "0px");
    };
  }, [visible, open]);

  if (!visible) return null;

  const toggle = () => {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      try {
        localStorage.setItem(OPEN_KEY, String(next));
      } catch {
        // Private-mode storage failures just lose the preference
      }
      return next;
    });
  };

  return (
    <section ref={sectionRef} className="hud-chip w-56 px-3 py-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        // The landing pad for salvage flights while the list is folded
        // away (see flyToSupply)
        data-supplies-toggle
        className="flex w-full items-center justify-between gap-4 font-condensed text-[0.65rem] uppercase tracking-[0.2em] text-paper-manila/60 hover:text-paper-manila"
      >
        Supplies
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <ul className="space-y-1 pt-1">
          {stocked.map((id) => {
            const type = CONSUMABLE_TYPES[id];
            const amount = gameState.consumables[id];
            return (
              <li
                key={id}
                // The landing pad for salvage flights (see flyToSupply)
                data-supply-id={id}
                className="flex items-baseline justify-between gap-4"
              >
                <span className="flex items-center gap-2 font-condensed text-sm text-paper-manila">
                  <ConsumableIcon
                    consumableId={id}
                    className="size-5 shrink-0 [image-rendering:pixelated]"
                  />
                  {type.name}
                </span>
                <span className="text-sm tabular-nums text-paper-manila/80">
                  {/* "8" for nails (the name already says what they are),
                      "16 oz" for measured goods */}
                  {type.unit === type.name.toLowerCase()
                    ? formatCount(amount)
                    : `${formatCount(amount)} ${type.unit}`}
                </span>
              </li>
            );
          })}
          {/* Clamps aren't spent, so the tally reads as a rack count:
              how many you own, and how many are holding a glue-up */}
          {clampsOwned > 0 && (
            <li className="flex items-baseline justify-between gap-4">
              <span className="font-condensed text-sm text-paper-manila">
                {CLAMP_NAME}s
              </span>
              <span className="text-sm tabular-nums text-paper-manila/80">
                {clampsHeld > 0
                  ? `${formatCount(clampsOwned - clampsHeld)} of ${formatCount(clampsOwned)} free`
                  : formatCount(clampsOwned)}
              </span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
};
