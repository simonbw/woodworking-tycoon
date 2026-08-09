import React from "react";
import {
  BenchGroup,
  BenchGroupMember,
} from "../../game/bench-work/bench-group";
import { footprintCenter } from "../../game/Machine";
import { worktableArtSrc } from "../machine-sprites/worktable-art";
import { useTexture } from "../../utils/useTexture";
import { WorktableSprite } from "../machine-sprites/WorktableSprite";
import {
  IMAGE_PIXELS_PER_INCH,
  PIXELS_PER_CELL,
  PIXELS_PER_INCH,
} from "../shop-view/shop-scale";
import { StageFit } from "./stageMath";

/**
 * The close-up exports, by machine type. Leaning over a bench puts it on
 * screen at roughly its native size instead of an eighth of it, so these
 * ship with four times the pixels of the shop's copy — same drawing,
 * anchored on the same canvas center and trimmed symmetrically about it,
 * so swapping one for the other lands the art in exactly the same place
 * (see scripts/trim-images.ts).
 *
 * They are still IMAGE_PIXELS_PER_INCH art: the `@4x` in the filename is
 * a resolution PIXI reads off the name, not a size, so these measure the
 * same inches as their 1x twins and scale by the same divisor.
 *
 * A bench with no entry here falls back to its procedural sprite, which
 * is what the shop floor draws anyway — so art can land one table at a
 * time, and a missing file costs nothing but sharpness.
 */
const ZOOMED_ART: Readonly<Record<string, string>> = {
  workspace: "/images/makeshift-bench@4x.png",
};

/**
 * The bench view's backdrop is the shop itself, leaned into — literally:
 * the live shop stays underneath in the same canvas, zoomed onto the
 * bench by BenchDiveLayer, so everything around the bench is whatever is
 * actually there (the wall behind it, the neighboring pile, the rest of
 * the floor), undimmed and unstyled — being zoomed in with the bench
 * chrome up is signal enough that these are workbench hands. All this
 * layer re-draws is the bench itself, pixel-locked over the shop's copy,
 * so the top under the hands is sharp.
 *
 * "The bench" may be several: tables pushed together are one bench
 * (bench-work/bench-group.ts), and each one is drawn in its own patch of
 * the frame, turned by however far it sits from the way the frame faces.
 * Until an export decodes there is nothing to hide — the shop's own copy
 * is right underneath, already zoomed and in register.
 */
export const BenchSceneBackdrop: React.FC<{
  group: BenchGroup;
  /** The scene's fit — group frame inches over the stage. */
  fit: StageFit;
}> = ({ group, fit }) => (
  <>
    {/* Every shadow first, under every top: a neighbour's shadow falling
        across the table butted against it would draw a seam that isn't
        there, which is the whole reason the art ships as two layers. */}
    {group.members.map((member) => (
      <MemberShadow
        key={`s-${member.key}`}
        group={group}
        member={member}
        fit={fit}
      />
    ))}
    {group.members.map((member) => (
      <MemberArt key={member.key} group={group} member={member} fit={fit} />
    ))}
  </>
);

/** How far a member is turned from the way the frame faces. */
function memberAngle(group: BenchGroup, member: BenchGroupMember): number {
  return -90 * ((member.machine.rotation - group.alignment + 4) % 4);
}

/** Where a member's top is centred on the stage, in px. */
function memberCentre(member: BenchGroupMember, fit: StageFit) {
  return {
    x: fit.originX + (member.rect.xIn + member.rect.widthIn / 2) * fit.pxPerIn,
    y: fit.originY + (member.rect.yIn + member.rect.heightIn / 2) * fit.pxPerIn,
  };
}

const MemberShadow: React.FC<{
  group: BenchGroup;
  member: BenchGroupMember;
  fit: StageFit;
}> = ({ group, member, fit }) => {
  const texture = useTexture(
    worktableArtSrc(member.machine.type.id, "shadow", true) ?? "",
  );
  if (!texture) {
    return null;
  }
  const { x, y } = memberCentre(member, fit);
  return (
    <pixiSprite
      texture={texture}
      anchor={{ x: 0.5, y: 0.5 }}
      x={x}
      y={y}
      angle={memberAngle(group, member)}
      scale={fit.pxPerIn / IMAGE_PIXELS_PER_INCH}
    />
  );
};

const MemberArt: React.FC<{
  group: BenchGroup;
  member: BenchGroupMember;
  fit: StageFit;
}> = ({ group, member, fit }) => {
  const { machine, rect } = member;
  const texture = useTexture(ZOOMED_ART[machine.type.id] ?? "");

  // The middle of this table's top, in stage px
  const x = fit.originX + (rect.xIn + rect.widthIn / 2) * fit.pxPerIn;
  const y = fit.originY + (rect.yIn + rect.heightIn / 2) * fit.pxPerIn;
  // How far this table is turned from the way the frame faces — zero for
  // a lone bench, and for every table in a run laid the same way.
  const angle = -90 * ((machine.rotation - group.alignment + 4) % 4);

  if (texture) {
    return (
      <pixiSprite
        texture={texture}
        anchor={{ x: 0.5, y: 0.5 }}
        x={x}
        y={y}
        angle={angle}
        scale={fit.pxPerIn / IMAGE_PIXELS_PER_INCH}
      />
    );
  }

  if (!machine.type.worktable) {
    return null;
  }
  // Procedural tables draw in footprint coordinates from the origin
  // cell's center, so the art is shifted back by the footprint center to
  // sit squarely on the top — the same offset the shop's copy uses.
  const [footX, footY] = footprintCenter(machine.type.cellsOccupied);
  return (
    <pixiContainer
      x={x}
      y={y}
      angle={angle}
      scale={fit.pxPerIn / PIXELS_PER_INCH}
    >
      <pixiContainer x={-footX * PIXELS_PER_CELL} y={-footY * PIXELS_PER_CELL}>
        <WorktableSprite machine={machine} />
      </pixiContainer>
    </pixiContainer>
  );
};
