import { ConsumableId } from "../../game/Consumable";
import { consumableIconSrc } from "../../utils/uiImages";

/**
 * A salvaged consumable's little victory lap: its icon leaves the point
 * where it was pried loose and flies to its row in the supplies tally
 * (SuppliesSection marks each row with `data-supply-id`; while the panel
 * is folded closed the flight lands on its header instead,
 * `data-supplies-toggle`). Pure decoration over an already-settled state
 * — the tally updated the instant the commit ran — so a missing target
 * simply drops the flight.
 */
export function flyToSupply(
  consumableId: ConsumableId,
  fromX: number,
  fromY: number,
): void {
  // The tally row may only have appeared in the commit's own render
  // (the card hides while the cabinet is empty), so measure next frame.
  requestAnimationFrame(() => {
    const target =
      document.querySelector(`[data-supply-id="${consumableId}"]`) ??
      document.querySelector("[data-supplies-toggle]");
    if (!target) return;
    const to = target.getBoundingClientRect();

    const img = document.createElement("img");
    img.src = consumableIconSrc(consumableId);
    img.alt = "";
    img.style.cssText = [
      "position: fixed",
      `left: ${fromX - 10}px`,
      `top: ${fromY - 10}px`,
      "width: 20px",
      "height: 20px",
      "image-rendering: pixelated",
      "pointer-events: none",
      "z-index: 60",
    ].join(";");
    document.body.appendChild(img);

    const dx = to.left + 10 - fromX;
    const dy = to.top + to.height / 2 - fromY;
    const flight = img.animate(
      [
        { transform: "translate(0, 0) scale(1.4)", opacity: 1 },
        {
          transform: `translate(${dx * 0.25}px, ${dy * 0.25 - 30}px) scale(1.1)`,
          opacity: 1,
          offset: 0.3,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.85 },
      ],
      { duration: 600, easing: "cubic-bezier(0.35, 0, 0.35, 1)" },
    );
    flight.onfinish = () => {
      img.remove();
      // Thump the row it landed on, the way reward chips do
      target.classList.remove("reward-pulse");
      // Force a restart if a previous pulse is still running
      void (target as HTMLElement).offsetWidth;
      target.classList.add("reward-pulse");
    };
  });
}
