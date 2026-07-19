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
import { hasSkill, xpProgress, levelForXp } from "../../game/skill-helpers";
import { humanizeString } from "../../utils/humanizeString";
import { NavBar } from "../NavBar";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The recipes each skill unlocks, derived from operation declarations so
 * the page never drifts from the actual game rules.
 */
function recipesForSkill(skillId: SkillId): ReadonlyArray<string> {
  const names: string[] = [];
  for (const machineType of Object.values(MACHINE_TYPES)) {
    for (const operation of machineType.operations) {
      if (operation.requiredSkill === skillId) {
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

export const SkillsPage: React.FC = () => {
  const gameState = useGameState();
  const { xp, skillPoints } = gameState.progression;
  const level = levelForXp(xp);
  const progress = xpProgress(xp);

  return (
    <main className="p-8 space-y-6">
      <NavBar />

      <div className="rounded-md overflow-hidden shadow-2xl border border-ink-black/40">
        <div className="bg-workshop-panel text-paper-ivory px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-stencil text-3xl uppercase tracking-[0.2em] leading-none">
              Skills
            </span>
            <span className="font-condensed uppercase tracking-[0.3em] text-xs opacity-80">
              Workshop Certifications
            </span>
          </div>
          <div className="flex items-center gap-6 font-mono leading-tight">
            <div className="flex flex-col items-end">
              <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] opacity-80">
                Craft Level {level}
              </span>
              <span className="text-sm tabular-nums">
                {progress.current} / {progress.needed} XP
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] opacity-80">
                Skill Points
              </span>
              <span className="text-xl tabular-nums">{skillPoints}</span>
            </div>
          </div>
        </div>

        <div className="bg-paper-manila text-ink-black p-6">
          <div className="grid grid-cols-3 gap-4">
            {SKILL_BRANCHES.map((branch) => (
              <BranchColumn key={branch} branch={branch} />
            ))}
          </div>
          <p className="text-xs text-ink-fade font-typewriter mt-4">
            Finish products and commissions to earn craft XP. Each level grants
            a skill point.
          </p>
        </div>
      </div>
    </main>
  );
};

const BranchColumn: React.FC<{ branch: SkillBranch }> = ({ branch }) => {
  const skills = SKILL_IDS.filter((id) => SKILL_TYPES[id].branch === branch);
  return (
    <section>
      <h2 className="font-stencil text-lg uppercase tracking-[0.2em] border-b-2 border-ink-black/40 pb-1 mb-3">
        {humanizeString(branch)}
      </h2>
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
    <li className="paper-card p-3 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-stencil text-sm uppercase tracking-wide">
          {skill.name}
        </span>
        {unlocked ? (
          <span className="font-condensed uppercase tracking-[0.2em] text-[0.6rem] text-store-orange-dark border border-store-orange-dark rounded-sm px-1.5 py-0.5 -rotate-2">
            Certified
          </span>
        ) : prerequisitesMet ? (
          <button
            className="bg-store-orange hover:bg-store-orange-dark disabled:bg-store-concrete-dark disabled:text-ink-fade text-white font-stencil uppercase tracking-widest text-[0.65rem] px-2 py-0.5 rounded-sm shadow"
            disabled={!canBuy}
            onClick={() => applyAction(spendSkillPointAction(skill.id))}
          >
            Learn (1pt)
          </button>
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
