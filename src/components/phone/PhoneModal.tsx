import React, { useState } from "react";
import { classNames } from "../../utils/classNames";
import { Modal } from "../Modal";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { StarIcon } from "../StarIcon";
import {
  formatCount,
  formatDecimal,
  formatMoney,
} from "../../utils/formatNumber";
import { useGameState } from "../useGameState";
import { JobBoardSection } from "./JobBoardSection";
import { ListingsSection } from "./ListingsSection";

type PhoneTab = "sell" | "jobs";

/**
 * The player's phone, pulled out as an overlay while they stand in the
 * shop — time keeps running while you scroll. It shows one site,
 * SawdustList (the local makers' classifieds): a For Sale tab for the
 * player's listings and a Job Board tab for one-off offers.
 */
export const PhoneModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  // The phone's own key (P) also puts it away; Escape comes with the shell.
  useShortcut("close-phone", onClose);

  const [tab, setTab] = useState<PhoneTab>("sell");

  return (
    <Modal
      onClose={onClose}
      label="Phone"
      // The handset
      panelClassName="relative flex h-[min(85vh,52rem)] w-[26rem] max-w-full flex-col rounded-[2.25rem] border border-black bg-zinc-900 p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
    >
      {/* The screen */}
      <div className="flex min-h-0 grow flex-col overflow-hidden rounded-[1.75rem] bg-paper-ivory text-ink-black">
        <StatusBar />
        <SiteHeader />
        <TabSwitcher tab={tab} onSelect={setTab} />
        <div className="min-h-0 grow overflow-y-auto px-4 py-3">
          {tab === "sell" ? <ListingsSection /> : <JobBoardSection />}
        </div>
      </div>
      {/* Home indicator */}
      <div className="mx-auto mt-2 h-1 w-24 shrink-0 rounded-full bg-zinc-600" />
      <button
        className="absolute -right-2 -top-2 z-10 h-7 w-7 rounded-full border border-black bg-zinc-800 text-sm leading-none text-zinc-300 shadow hover:bg-zinc-700"
        onClick={onClose}
        aria-label="Put phone away"
        data-sfx="ui-back"
      >
        ×
      </button>
    </Modal>
  );
};

/** The phone's status strip — the in-game day stands in for the clock. */
const StatusBar: React.FC = () => {
  const gameState = useGameState();
  const day = gameState.day;
  return (
    <div
      className="flex items-center justify-between bg-ink-blue px-5 py-1 text-[0.65rem] text-white/90"
      aria-hidden
    >
      <span className="tabular-nums">Day {formatCount(day)}</span>
      <span className="tracking-tighter">▂▄▆█ · LTE · ▮▮▮▯</span>
    </div>
  );
};

const SiteHeader: React.FC = () => {
  const gameState = useGameState();
  return (
    <header className="border-b-4 border-ink-blue px-4 pb-2 pt-3">
      <span className="block font-condensed text-2xl font-bold leading-none tracking-tight text-ink-blue">
        SawdustList
      </span>
      <span className="mt-0.5 block font-condensed text-[0.6rem] uppercase tracking-[0.25em] text-ink-fade">
        Local Makers Marketplace
      </span>
      <div className="mt-1.5 flex items-baseline gap-4 text-xs tabular-nums">
        <span>
          <span className="font-condensed text-[0.6rem] uppercase tracking-[0.2em] text-ink-fade">
            Seller Rating
          </span>{" "}
          <span className="text-gold-dark">
            <StarIcon /> {formatDecimal(gameState.reputation)}
          </span>
        </span>
        <span>
          <span className="font-condensed text-[0.6rem] uppercase tracking-[0.2em] text-ink-fade">
            Balance
          </span>{" "}
          {formatMoney(gameState.money)}
        </span>
      </div>
    </header>
  );
};

const TabSwitcher: React.FC<{
  tab: PhoneTab;
  onSelect: (tab: PhoneTab) => void;
}> = ({ tab, onSelect }) => {
  const tabs: Array<{ id: PhoneTab; label: string }> = [
    { id: "sell", label: "For Sale" },
    { id: "jobs", label: "Job Board" },
  ];
  return (
    <nav className="flex border-b border-ink-black/15">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          data-sfx={tab === id ? "none" : "ui-tab"}
          aria-current={tab === id ? "page" : undefined}
          data-tutorial-target={`phone-tab-${id}`}
          className={classNames(
            "grow border-b-2 py-1.5 font-condensed text-xs uppercase tracking-[0.2em] transition-colors",
            tab === id
              ? "border-ink-blue font-bold text-ink-blue"
              : "border-transparent text-ink-fade hover:text-ink-black",
          )}
        >
          {label}
        </button>
      ))}
    </nav>
  );
};
