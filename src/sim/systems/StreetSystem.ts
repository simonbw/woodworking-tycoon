import { Persistence } from "../../config/constants";
import { TickLayerName } from "../../config/tickLayers";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { getMaterialName } from "../../game/material-helpers";
import { getSellValue } from "../../game/material-values";
import {
  customerSpan,
  CUSTOMER_BROWSE_TICKS,
  CUSTOMER_BUY_CHANCE,
  CUSTOMER_SPAWN_CHANCE_EMPTY,
  CUSTOMER_SPAWN_CHANCE_STOCKED,
  CUSTOMER_SPEED,
  MAX_CUSTOMERS,
  pickPurchase,
  roundToCents,
  roundToHundredth,
  saleReputationGain,
  standFrontage,
} from "../../game/stand";
import { CustomerEntity } from "../entities/CustomerEntity";
import { StandEntity } from "../entities/StandEntity";
import { Clock } from "../singletons/Clock";
import { Progression } from "../singletons/Progression";
import { Reputation } from "../singletons/Reputation";
import { ShopInfo } from "../singletons/ShopInfo";
import { Wallet } from "../singletons/Wallet";
import { TimeFlow } from "../TimeFlow";

/**
 * The street's slice of the sim tick.
 * One pass per sim minute: customers stroll the sidewalk, one may stop at
 * a stocked stand and buy, and finished walkers step off the ends of the
 * block. Runs on the "street" layer, after the clock — each pass is told
 * which minute it is simulating, and reads night and mints its ids from
 * that, exactly like the old pipeline where the pass ran on the freshly
 * advanced tick counter. The clock advances a whole engine tick's minutes
 * in one go (a drive charges its leg all at once), so a pass that read
 * the counter would treat every minute of a batch as the same one.
 *
 * The street rolls dice every minute — who walks by, who buys — and all
 * of them come from `game.random`, so a seeded driver lands the same
 * buyers every run (the old pass's injected rng, now the game's).
 *
 * A sale settles instantly — money into the Wallet, reputation into its
 * ledger, the lifetime count into Progression — and announces itself as a
 * "payout" event, which the reward-flight view (phase 8) turns into the
 * cha-ching and the fly-in. The first-sale unlocks (the store) stay the
 * milestone pass's job, keyed off `salesCompleted`, as in the old world.
 *
 * The first sale ever is dealt, not rolled: until something has sold, a
 * stocked stand summons its customer immediately and the browse below
 * always buys. The buyer still walks the block in sim minutes, so the
 * clock runs at working pace while that sale is pending (see timeSpeed
 * in game/time-flow.ts) — the walk-up passes in seconds and the sale
 * pays off while the player is still standing there. From the second
 * sale on the street runs on the dice.
 *
 * Transient — never serialized; added per session by the bootstrap.
 */
export class StreetSystem extends BaseEntity implements Entity {
  id = "streetSystem";
  tickLayer: TickLayerName = "street";
  persistenceLevel: number = Persistence.Permanent;

  @on("tick")
  onTick() {
    const timeFlow = this.game.entities.tryGetSingleton(TimeFlow);
    const minutes = timeFlow?.wholeTicks ?? 0;
    if (minutes === 0) {
      return;
    }
    // The clock counted all of this engine tick's minutes before the
    // street layer ran, so the batch's first minute is that many back.
    const firstTick = this.game.entities.getSingleton(Clock).tick - minutes + 1;
    for (let i = 0; i < minutes; i++) {
      this.minutePass(firstTick + i);
    }
  }

  /**
   * One sim minute of the street.
   * `tick` is the minute being simulated, which is the clock's own tick
   * when a single minute passes and a minute of the batch otherwise.
   */
  private minutePass(tick: number): void {
    const game = this.game;
    const rng = game.random;
    const shopInfo = game.entities.getSingleton(ShopInfo).info;
    const clock = game.entities.getSingleton(Clock);
    const stand = game.entities.getSingleton(StandEntity);
    const progression = game.entities.getSingleton(Progression);
    // A destroyed entity leaves the list only at the end of the engine
    // tick, so a batch of minutes still finds the walkers who stepped off
    // the block during it. They have left the street.
    const customers = [...game.entities.byConstructor(CustomerEntity)].filter(
      (customer) => !customer.isDestroyed,
    );

    const span = customerSpan(shopInfo);
    const frontage = standFrontage(shopInfo);

    // Foot traffic follows the stand: a stocked table draws people down
    // the street, a bare one sees the odd stroller. Nobody at night.
    const spawnChance =
      stand.pieces.length > 0
        ? CUSTOMER_SPAWN_CHANCE_STOCKED
        : CUSTOMER_SPAWN_CHANCE_EMPTY;
    const firstSaleDue =
      progression.salesCompleted === 0 && stand.pieces.length > 0;
    // The guaranteed customer is only summoned while nobody already on
    // the street could still make the sale — one at a time, no crowd.
    const buyerEnRoute = customers.some(
      (customer) =>
        customer.state === "browsing" ||
        (customer.state === "walking" &&
          (customer.walkDirection === 1
            ? customer.x < frontage.right
            : customer.x > frontage.left)),
    );
    const spawning =
      !clock.isNightAt(tick) &&
      customers.length < MAX_CUSTOMERS &&
      ((firstSaleDue && !buyerEnRoute) || rng() < spawnChance);
    if (customers.length === 0 && !spawning) {
      return;
    }

    const payouts: { title: string; money: number; reputation: number }[] = [];
    // How many customers remain on the street so far this pass — the old
    // rebuilt array's length, which the spawn id derives from.
    let remaining = 0;

    for (const customer of customers) {
      if (customer.state === "browsing") {
        if (customer.browseTicksLeft > 1) {
          customer.browseTicksLeft -= 1;
          remaining += 1;
          continue;
        }
        // Decision time. One purchase per browse at most; either way
        // they move along afterwards and don't stop again. The shop's
        // first sale skips the coin flip — see the header.
        const purchase =
          progression.salesCompleted === 0 || rng() < CUSTOMER_BUY_CHANCE
            ? pickPurchase(stand.pieces, rng)
            : null;
        if (purchase) {
          const value = roundToCents(getSellValue(purchase));
          const reputationGain = saleReputationGain(value);
          stand.pieces = stand.pieces.filter((item) => item !== purchase);
          const wallet = game.entities.getSingleton(Wallet);
          wallet.money = roundToCents(wallet.money + value);
          const reputation = game.entities.getSingleton(Reputation);
          reputation.reputation = roundToHundredth(
            reputation.reputation + reputationGain,
          );
          progression.salesCompleted += 1;
          payouts.push({
            title: getMaterialName(purchase),
            money: value,
            reputation: reputationGain,
          });
        }
        customer.state = "leaving";
        customer.browseTicksLeft = 0;
        remaining += 1;
        continue;
      }

      const x = customer.x + CUSTOMER_SPEED * customer.walkDirection;
      if (x < span.left || x > span.right) {
        customer.destroy(); // walked off the end of the block
        continue;
      }
      customer.x = x;
      if (
        customer.state === "walking" &&
        stand.pieces.length > 0 &&
        x >= frontage.left &&
        x <= frontage.right
      ) {
        customer.state = "browsing";
        customer.browseTicksLeft = CUSTOMER_BROWSE_TICKS;
      }
      remaining += 1;
    }

    if (spawning) {
      const walkDirection: 1 | -1 = rng() < 0.5 ? 1 : -1;
      game.addEntity(
        new CustomerEntity({
          // Derived the way the old pass derived it, so ids stay stable
          // across the migration's parity checks — off this minute, not
          // the counter, so a batch of minutes can't mint the id twice.
          id: `customer-${tick}-${remaining}`,
          x: walkDirection === 1 ? span.left : span.right,
          walkDirection,
          state: "walking",
          browseTicksLeft: 0,
        }),
      );
    }

    payouts.forEach((payout, index) => {
      game.dispatch("payout", {
        payout: {
          // Derived, not minted from a counter: this minute, and the sale's
          // place among the minute's sales, so no two announcements of a
          // batch of minutes share an id.
          id: `payout-${tick}-${index}-sale-${payout.title}`,
          kind: "sale",
          title: payout.title,
          money: payout.money,
          reputation: payout.reputation,
          xp: 0,
        },
      });
    });
  }
}
