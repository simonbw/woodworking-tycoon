import React from "react";
import { MACHINE_TYPES } from "../../game/Machine";
import {
  SKILL_BRANCHES,
  SKILL_IDS,
  SKILL_TYPES,
  SkillBranch,
  SkillId,
  SkillType,
} from "../../game/Skill";
import { TOOL_TYPES } from "../../game/Tool";
import { spendSkillPointAction } from "../../game/game-actions/skill-actions";
import { hasSkill, levelForXp, xpProgress } from "../../game/skill-helpers";
import { formatCount } from "../../utils/formatNumber";
import { humanizeString } from "../../utils/humanizeString";
import { Modal } from "../Modal";
import { BuyButton } from "../store-page/BuyButton";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The recipes each skill unlocks, derived from operation declarations so
 * the page never drifts from the actual game rules.
 */
function recipesForSkill(skillId: SkillId): ReadonlyArray<string> {
  const names: string[] = [];
  for (const machineType of Object.values(MACHINE_TYPES)) {
    for (const operation of machineType.operations) {
      if (
        operation.requiredSkill === skillId &&
        !names.includes(operation.name)
      ) {
        names.push(operation.name);
      }
    }
  }
  for (const toolType of Object.values(TOOL_TYPES)) {
    for (const operation of toolType.operations) {
      if (
        operation.requiredSkill === skillId &&
        !names.includes(operation.name)
      ) {
        names.push(operation.name);
      }
    }
  }
  return names;
}

/**
 * The woodworker's journal, opened as an overlay while the shop keeps
 * running: what you've learned, what you could learn next. The manual is
 * what the world tells you; this notebook is what you know.
 */
export const JournalModal: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  // The journal's own key (J) also closes it; Escape comes with the shell.
  useShortcut("close-journal", onClose);

  const gameState = useGameState();
  const { xp, skillPoints } = gameState.progression;
  const level = levelForXp(xp);
  const progress = xpProgress(xp);

  return (
    <Modal
      onClose={onClose}
      label="Journal"
      // The notebook: a worn cover peeking out around manila pages
      panelClassName="relative h-[85vh] w-full max-w-4xl rounded-md bg-ink-brown p-2 shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-sm bg-paper-manila text-ink-black">
        <header className="flex items-center justify-between gap-4 border-b-2 border-ink-black/30 px-6 pb-2 pt-4">
          <h2 className="font-ink text-3xl leading-none text-ink-blue whitespace-nowrap">
            Woodworker&rsquo;s Journal
          </h2>
          <div className="flex items-center gap-6 leading-tight">
            <div className="flex flex-col items-end">
              <span className="font-condensed text-[0.65rem] uppercase tracking-[0.2em] text-ink-fade whitespace-nowrap">
                Craft Level {level}
              </span>
              <span className="text-sm tabular-nums whitespace-nowrap">
                {formatCount(progress.current)} / {formatCount(progress.needed)}{" "}
                XP
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-condensed text-[0.65rem] uppercase tracking-[0.2em] text-ink-fade whitespace-nowrap">
                Skill Points
              </span>
              <span className="text-lg tabular-nums">
                {formatCount(skillPoints)}
              </span>
            </div>
          </div>
          <button
            className="button-paper px-2 py-0.5 text-lg leading-none"
            onClick={onClose}
            aria-label="Close journal"
            data-sfx="ui-back"
          >
            ×
          </button>
        </header>

        <div className="flex min-h-0 grow flex-col p-6">
          {/* Each branch scrolls on its own; the page never does */}
          <div className="grid min-h-0 grow grid-cols-3 gap-4">
            {SKILL_BRANCHES.map((branch) => (
              <BranchColumn key={branch} branch={branch} />
            ))}
          </div>
          <p className="mt-4 shrink-0 font-typewriter text-xs text-ink-fade">
            Finish products and commissions to earn craft XP. Each level grants
            a skill point.
          </p>
        </div>
      </div>
    </Modal>
  );
};

const BranchColumn: React.FC<{ branch: SkillBranch }> = ({ branch }) => {
  const skills = SKILL_IDS.filter((id) => SKILL_TYPES[id].branch === branch);
  return (
    <section className="min-h-0 overflow-y-auto">
      <h3 className="mb-3 border-b-2 border-ink-black/40 pb-1 font-condensed text-lg font-bold uppercase tracking-[0.2em]">
        {humanizeString(branch)}
      </h3>
      <ul className="space-y-3">
        {skills.map((id) => (
          <SkillCard key={id} skill={SKILL_TYPES[id]} />
        ))}
      </ul>
    </section>
  );
};

const SkillCard: React.FC<{ skill: SkillType }> = ({ skill }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const { progression } = gameState;

  const unlocked = hasSkill(progression, skill.id);
  const prerequisitesMet = skill.requires.every((required) =>
    hasSkill(progression, required),
  );
  const canBuy = !unlocked && prerequisitesMet && progression.skillPoints > 0;
  const recipes = recipesForSkill(skill.id);

  return (
    <li
      className="paper-card p-3 space-y-1.5"
      data-tutorial-target={`skill-${skill.id}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-condensed font-bold text-sm uppercase tracking-wide">
          {skill.name}
        </span>
        {unlocked ? (
          <span className="font-condensed uppercase tracking-[0.2em] text-[0.6rem] text-store-orange-dark border border-store-orange-dark rounded-sm px-1.5 py-0.5 -rotate-2">
            Certified
          </span>
        ) : prerequisitesMet ? (
          <BuyButton
            size="compact"
            disabled={!canBuy}
            onClick={() => applyAction(spendSkillPointAction(skill.id))}
          >
            Learn (1pt)
          </BuyButton>
        ) : (
          <span className="font-condensed uppercase tracking-[0.2em] text-[0.6rem] text-ink-fade">
            Requires {skill.requires.map((r) => SKILL_TYPES[r].name).join(", ")}
          </span>
        )}
      </div>
      <p className="text-xs text-ink-fade font-typewriter">
        {skill.description}
      </p>
      {recipes.length > 0 && (
        <p className="text-xs">
          <span className="font-condensed uppercase tracking-[0.15em] text-[0.6rem] text-ink-fade">
            Recipes:{" "}
          </span>
          {recipes.join(", ")}
        </p>
      )}
    </li>
  );
};
