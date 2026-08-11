/**
 * The readouts a payout's rewards fly to. Each one marks itself with
 * `data-reward-target`, and `RewardFlightLayer` measures it at launch time —
 * the top bar reflows, so the vector can't be hard-coded.
 *
 * A missing target is not an error: the layer simply drops any chip whose
 * target isn't mounted rather than flinging it at the corner.
 */
export type RewardTarget = "money" | "reputation" | "xp";

export const REWARD_TARGET_ATTRIBUTE = "data-reward-target";
