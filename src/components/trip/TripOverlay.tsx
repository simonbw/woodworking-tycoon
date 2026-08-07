import React from "react";
import { classNames } from "../../utils/classNames";
import { useModalScope, useShortcut } from "../shortcuts/ShortcutProvider";

/**
 * Binding the trip keys is a separate (null-rendering) component so the
 * hooks only exist when a trip offers a way home — the scavenging trip
 * offers one only while it's parked at a decision, and claims nothing
 * while a search is running.
 */
const TripKeyScope: React.FC<{ onHeadHome: () => void }> = ({ onHeadHome }) => {
  useModalScope();
  useShortcut("close-modal", onHeadHome);
  return null;
};

/**
 * The full-bleed shell every away trip renders into: the workshop-dark
 * backdrop covering the whole screen while the shop keeps ticking behind
 * it. Only mounted while the trip is live (each overlay guards on
 * `player.away` before rendering it), so the modal scope comes and goes
 * with the trip itself. Escape means Head Home where a trip has one.
 */
export const TripOverlay: React.FC<{
  /** The dialog's accessible name — the venue. */
  label: string;
  /** Escape's meaning here; omit for trips with no way home but time. */
  onHeadHome?: () => void;
  /** Extra layout classes on the shell (e.g. the scavenge log's gap). */
  className?: string;
  testId?: string;
  children: React.ReactNode;
}> = ({ label, onHeadHome, className, testId, children }) => (
  <div
    className={classNames(
      "fixed inset-0 z-40 flex flex-col overflow-hidden bg-workshop-bg p-6",
      className,
    )}
    role="dialog"
    aria-modal="true"
    aria-label={label}
    data-testid={testId}
  >
    {onHeadHome && <TripKeyScope onHeadHome={onHeadHome} />}
    {children}
  </div>
);
