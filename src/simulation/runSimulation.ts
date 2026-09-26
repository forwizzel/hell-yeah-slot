import {
  BEER_CASH_AWARDS,
  CIGARETTE_CASH_AWARDS,
  GAME_CONFIG,
  getFeatureBuyCostCents,
  type FeatureBuyId,
} from "../config/gameConfig";
import { PAYTABLE } from "../config/paytable";
import { REEL_STRIPS } from "../config/reelStrips";
import { formatUsd } from "../core/formatUsd";
import { createGuaranteedFeatureSymbols } from "../core/GuaranteedFeatureSymbols";
import { BonusEngine } from "../math/BonusEngine";
import { addCapped } from "../math/cappedInteger";
import { evaluateWays } from "../math/PayEvaluator";
import { ReelEngine } from "../math/ReelEngine";
import { safeAdd, safeMultiply } from "../math/safeInteger";
import { SeededRandomSource } from "../math/SeededRandomSource";
import { SwordEngine } from "../math/SwordEngine";

const DEFAULT_SPINS = 100_000;
const DEFAULT_SEED = "12345";

interface SimulationOptions {
  readonly spins: number;
  readonly seed: string;
  readonly feature: FeatureBuyId | null;
}

interface SimulationStats {
  paidBaseSpins: number;
  totalWageredCents: number;
  baseGameWonCents: number;
  freeSpinsWonCents: number;
  swordWonCents: number;
  winningPaidRounds: number;
  winningBaseSpins: number;
  beerFeatures: number;
  cigaretteFeatures: number;
  combinedFeatures: number;
  swordFeatures: number;
  beerActivations: number;
  cigaretteActivations: number;
  freeSpinFeatures: number;
  freeSpinsPlayed: number;
  beerRetriggers: number;
  cigaretteRetriggers: number;
  cigaretteCashAwards: number;
  cigaretteCashAwardCents: number;
  beerCashAwards: number;
  beerCashAwardCents: number;
  freeSpinSwordInterstitials: number;
  swordSpinsPlayed: number;
  swordExpansions: number;
  swordReachedFinalStage: number;
  swordFinalStrikePayoutCents: number;
  maximumMultiplier: number;
  maximumTotalPaidRoundWinCents: number;
}

function parseOptions(argumentsList: readonly string[]): SimulationOptions {
  let spins = DEFAULT_SPINS;
  let seed = DEFAULT_SEED;
  let feature: FeatureBuyId | null = null;

  for (const argument of argumentsList) {
    if (argument.startsWith("--spins=")) {
      const candidate = Number(argument.slice("--spins=".length));
      if (Number.isSafeInteger(candidate) && candidate > 0) {
        spins = candidate;
      } else {
        console.warn(`Invalid spin count "${argument}"; using ${DEFAULT_SPINS}.`);
        spins = DEFAULT_SPINS;
      }
    } else if (argument.startsWith("--seed=")) {
      const candidate = argument.slice("--seed=".length).trim();
      if (candidate.length > 0) {
        seed = candidate;
      } else {
        console.warn(`Empty seed; using ${DEFAULT_SEED}.`);
        seed = DEFAULT_SEED;
      }
    } else if (argument.startsWith("--feature=")) {
      const candidate = argument.slice("--feature=".length);
      if (isFeatureBuyId(candidate)) {
        feature = candidate;
      } else {
        throw new RangeError(`Unknown feature simulation "${candidate}"`);
      }
    } else {
      console.warn(`Ignoring unknown argument "${argument}".`);
    }
  }

  return { spins, seed, feature };
}

function isFeatureBuyId(value: string): value is FeatureBuyId {
  return value === "beer" || value === "cigarette" || value === "combined" || value === "sword";
}

function simulate(options: SimulationOptions): SimulationStats {
  const random = new SeededRandomSource(options.seed);
  const reelEngine = new ReelEngine(REEL_STRIPS, random, GAME_CONFIG.rows);
  const bonusEngine = new BonusEngine(
    random,
    GAME_CONFIG.beerFreeSpins,
    GAME_CONFIG.cigaretteFreeSpins,
    GAME_CONFIG.beerRetriggerSpins,
    GAME_CONFIG.cigaretteRetriggerSpins,
    GAME_CONFIG.beerFreeSpinMultiplier,
    GAME_CONFIG.maximumPaidRoundWinMultiplier,
    CIGARETTE_CASH_AWARDS,
    BEER_CASH_AWARDS,
  );
  const swordEngine = new SwordEngine(random);
  const betCents = GAME_CONFIG.defaultBetCents;
  const wagerPerRoundCents = options.feature === null
    ? betCents
    : getFeatureBuyCostCents(options.feature, betCents);
  const stats: SimulationStats = {
    paidBaseSpins: options.spins,
    totalWageredCents: safeMultiply(
      options.spins,
      wagerPerRoundCents,
      "Simulation wager total exceeds the safe integer range",
    ),
    baseGameWonCents: 0,
    freeSpinsWonCents: 0,
    swordWonCents: 0,
    winningPaidRounds: 0,
    winningBaseSpins: 0,
    beerFeatures: 0,
    cigaretteFeatures: 0,
    combinedFeatures: 0,
    swordFeatures: 0,
    beerActivations: 0,
    cigaretteActivations: 0,
    freeSpinFeatures: 0,
    freeSpinsPlayed: 0,
    beerRetriggers: 0,
    cigaretteRetriggers: 0,
    cigaretteCashAwards: 0,
    cigaretteCashAwardCents: 0,
    beerCashAwards: 0,
    beerCashAwardCents: 0,
    freeSpinSwordInterstitials: 0,
    swordSpinsPlayed: 0,
    swordExpansions: 0,
    swordReachedFinalStage: 0,
    swordFinalStrikePayoutCents: 0,
    maximumMultiplier: 1,
    maximumTotalPaidRoundWinCents: 0,
  };

  for (let spin = 0; spin < options.spins; spin += 1) {
    const grid = options.feature === null
      ? reelEngine.spin()
      : reelEngine.spinWithGuaranteedBonusSymbols(createGuaranteedFeatureSymbols(options.feature, random));
    const baseWinCents = evaluateWays(grid, PAYTABLE, betCents).totalWinCents;
    const maximumPaidRoundWinCents = safeMultiply(
      betCents,
      GAME_CONFIG.maximumPaidRoundWinMultiplier,
      "Maximum paid-round win exceeds the safe integer range",
    );
    const awardedBaseWinCents = Math.min(baseWinCents, maximumPaidRoundWinCents);
    if (baseWinCents > 0) {
      stats.winningBaseSpins += 1;
    }
    const trigger = bonusEngine.resolveBaseTrigger(grid);
    let freeSpinWinCents = 0;
    let swordWinCents = 0;

    if (trigger.kind === "sword") {
      stats.swordFeatures += 1;
      swordWinCents = playSwordFeature(
        swordEngine,
        betCents,
        stats,
        maximumPaidRoundWinCents - awardedBaseWinCents,
      );
    } else if (trigger.kind === "free-spins") {
      stats.freeSpinFeatures += 1;
      if (trigger.mode === "beer") {
        stats.beerFeatures += 1;
      } else if (trigger.mode === "cigarette") {
        stats.cigaretteFeatures += 1;
      } else {
        stats.combinedFeatures += 1;
      }

      if (trigger.beer !== null) {
        stats.beerActivations += 1;
      }
      if (trigger.cigarette !== null) {
        stats.cigaretteActivations += 1;
      }

      let freeSpinState = bonusEngine.startFreeSpins(
        trigger,
        betCents,
        maximumPaidRoundWinCents - awardedBaseWinCents,
      );
      stats.maximumMultiplier = Math.max(stats.maximumMultiplier, freeSpinState.multiplier);
      while (freeSpinState.remainingSpins > 0) {
        const freeSpinGrid = reelEngine.spin();
        const freeSpinBaseWinCents = evaluateWays(
          freeSpinGrid,
          PAYTABLE,
          freeSpinState.triggeringBetCents,
        ).totalWinCents;
        const freeSpinResult = bonusEngine.applyFreeSpin(freeSpinState, freeSpinGrid, freeSpinBaseWinCents);
        freeSpinState = freeSpinResult.state;
        stats.freeSpinsPlayed += 1;
        stats.maximumMultiplier = Math.max(stats.maximumMultiplier, freeSpinState.multiplier);
        if (freeSpinResult.beerRetriggered) {
          stats.beerRetriggers += 1;
        }
        if (freeSpinResult.cigaretteRetriggered) {
          stats.cigaretteRetriggers += 1;
        }
        for (const award of freeSpinResult.cashAwards) {
          if (award.symbol === "CIGARETTE") {
            stats.cigaretteCashAwards += 1;
            stats.cigaretteCashAwardCents = safeAdd(
              stats.cigaretteCashAwardCents,
              award.amountCents,
              "Simulation Cigarette cash-award total exceeds the safe integer range",
            );
          } else {
            stats.beerCashAwards += 1;
            stats.beerCashAwardCents = safeAdd(
              stats.beerCashAwardCents,
              award.amountCents,
              "Simulation Beer cash-award total exceeds the safe integer range",
            );
          }
        }
        if (freeSpinResult.swordTriggered) {
          stats.freeSpinSwordInterstitials += 1;
          const swordAwardCents = playSwordFeature(
            swordEngine,
            freeSpinState.triggeringBetCents,
            stats,
            maximumPaidRoundWinCents
              - awardedBaseWinCents
              - freeSpinState.accumulatedWinCents
              - swordWinCents,
          );
          swordWinCents = safeAdd(
            swordWinCents,
            swordAwardCents,
            "Simulation Sword-win total exceeds the safe integer range",
          );
          freeSpinState = {
            ...freeSpinState,
            maximumWinCents: Math.max(
              freeSpinState.accumulatedWinCents,
              freeSpinState.maximumWinCents - swordAwardCents,
            ),
          };
        }
      }

      const summary = bonusEngine.summarize(freeSpinState);
      freeSpinWinCents = summary.payoutCents;
    }

    const awardedFreeSpinWinCents = Math.min(
      freeSpinWinCents,
      maximumPaidRoundWinCents - awardedBaseWinCents,
    );
    const awardedSwordWinCents = Math.min(
      swordWinCents,
      maximumPaidRoundWinCents - awardedBaseWinCents - awardedFreeSpinWinCents,
    );
    const totalPaidRoundWinCents = addCapped(
      addCapped(awardedBaseWinCents, awardedFreeSpinWinCents, maximumPaidRoundWinCents),
      awardedSwordWinCents,
      maximumPaidRoundWinCents,
    );
    stats.baseGameWonCents = safeAdd(
      stats.baseGameWonCents,
      awardedBaseWinCents,
      "Simulation base-win total exceeds the safe integer range",
    );
    stats.freeSpinsWonCents = safeAdd(
      stats.freeSpinsWonCents,
      awardedFreeSpinWinCents,
      "Simulation free-spin total exceeds the safe integer range",
    );
    stats.swordWonCents = safeAdd(
      stats.swordWonCents,
      awardedSwordWinCents,
      "Simulation Sword-win total exceeds the safe integer range",
    );
    if (totalPaidRoundWinCents > 0) {
      stats.winningPaidRounds += 1;
    }
    stats.maximumTotalPaidRoundWinCents = Math.max(
      stats.maximumTotalPaidRoundWinCents,
      totalPaidRoundWinCents,
    );
  }

  return stats;
}

function percentage(numerator: number, denominator: number): string {
  return denominator === 0 ? "0.0000%" : `${((numerator / denominator) * 100).toFixed(4)}%`;
}

function average(total: number, count: number): string {
  return count === 0 ? "0.00" : (total / count).toFixed(2);
}

function printResults(options: SimulationOptions, stats: SimulationStats): void {
  const bonusWonCents = safeAdd(
    stats.freeSpinsWonCents,
    stats.swordWonCents,
    "Simulation bonus-win total exceeds the safe integer range",
  );
  const totalWonCents = safeAdd(
    safeAdd(stats.baseGameWonCents, stats.freeSpinsWonCents, "Simulation win total exceeds the safe integer range"),
    stats.swordWonCents,
    "Simulation win total exceeds the safe integer range",
  );
  console.log("Bonus Slot Simulation");
  console.log(`Seed: ${options.seed}`);
  console.log(options.feature === null ? `Paid base spins: ${stats.paidBaseSpins}` : `Purchased ${options.feature} rounds: ${stats.paidBaseSpins}`);
  console.log(`Bet per paid spin: ${formatUsd(GAME_CONFIG.defaultBetCents)}`);
  if (options.feature !== null) {
    console.log(`Feature price: ${formatUsd(getFeatureBuyCostCents(options.feature, GAME_CONFIG.defaultBetCents))}`);
  }
  console.log(`Total amount wagered: ${formatUsd(stats.totalWageredCents)}`);
  console.log(`Total amount won: ${formatUsd(totalWonCents)}`);
  console.log(`Total RTP: ${percentage(totalWonCents, stats.totalWageredCents)}`);
  console.log(`Base-game RTP: ${percentage(stats.baseGameWonCents, stats.totalWageredCents)}`);
  console.log(`Free-spin RTP: ${percentage(stats.freeSpinsWonCents, stats.totalWageredCents)}`);
  console.log(`Sword RTP: ${percentage(stats.swordWonCents, stats.totalWageredCents)}`);
  console.log(`Bonus share of return: ${percentage(bonusWonCents, totalWonCents)}`);
  console.log(`Paid-round hit frequency: ${percentage(stats.winningPaidRounds, stats.paidBaseSpins)}`);
  console.log(`Base-spin hit frequency: ${percentage(stats.winningBaseSpins, stats.paidBaseSpins)}`);
  console.log(`Free-spin feature rate: ${percentage(stats.freeSpinFeatures, stats.paidBaseSpins)}`);
  console.log(`Beer-only feature rate: ${percentage(stats.beerFeatures, stats.paidBaseSpins)}`);
  console.log(`Cigarette-only feature rate: ${percentage(stats.cigaretteFeatures, stats.paidBaseSpins)}`);
  console.log(`Combined feature rate: ${percentage(stats.combinedFeatures, stats.paidBaseSpins)}`);
  console.log(`Sword feature rate: ${percentage(stats.swordFeatures, stats.paidBaseSpins)}`);
  console.log(`Beer activations: ${stats.beerActivations} (${percentage(stats.beerActivations, stats.paidBaseSpins)})`);
  console.log(`Cigarette activations: ${stats.cigaretteActivations} (${percentage(stats.cigaretteActivations, stats.paidBaseSpins)})`);
  console.log(`Free spins played: ${stats.freeSpinsPlayed}`);
  console.log(`Average free spins per feature: ${average(stats.freeSpinsPlayed, stats.freeSpinFeatures)}`);
  console.log(`Beer retriggers: ${stats.beerRetriggers} (${percentage(stats.beerRetriggers, stats.freeSpinsPlayed)} of free spins)`);
  console.log(`Cigarette retriggers: ${stats.cigaretteRetriggers} (${percentage(stats.cigaretteRetriggers, stats.freeSpinsPlayed)} of free spins)`);
  console.log(`Cigarette cash awards: ${stats.cigaretteCashAwards} for ${formatUsd(stats.cigaretteCashAwardCents)}`);
  console.log(`Beer cash awards: ${stats.beerCashAwards} for ${formatUsd(stats.beerCashAwardCents)}`);
  console.log(`Sword features during free spins: ${stats.freeSpinSwordInterstitials} (${percentage(stats.freeSpinSwordInterstitials, stats.freeSpinsPlayed)} of free spins)`);
  console.log(`Sword spins played: ${stats.swordSpinsPlayed}`);
  console.log(`Sword expansions: ${stats.swordExpansions}`);
  console.log(`Sword features reaching 5x6: ${stats.swordReachedFinalStage}`);
  console.log(`Sword payouts from Final Strike features: ${formatUsd(stats.swordFinalStrikePayoutCents)}`);
  console.log(`Maximum observed multiplier: x${stats.maximumMultiplier}`);
  console.log(`Maximum observed total paid-round win: ${formatUsd(stats.maximumTotalPaidRoundWinCents)}`);
}

function playSwordFeature(
  swordEngine: SwordEngine,
  betCents: number,
  stats: SimulationStats,
  maximumWinCents = safeMultiply(
    betCents,
    GAME_CONFIG.maximumPaidRoundWinMultiplier,
    "Maximum paid-round win exceeds the safe integer range",
  ),
): number {
  let state = swordEngine.start(betCents, maximumWinCents);
  while (state.remainingSpins > 0) {
    const result = swordEngine.playSpin(state);
    state = result.state;
    stats.swordSpinsPlayed += 1;
    if (result.expansion !== null) {
      stats.swordExpansions += 1;
    }
  }

  const summary = swordEngine.summarize(state);
  if (summary.reachedFinalStage) {
    stats.swordReachedFinalStage += 1;
  }
  if (summary.finalStrikeMultiplier !== null) {
    stats.swordFinalStrikePayoutCents = safeAdd(
      stats.swordFinalStrikePayoutCents,
      summary.payoutCents,
      "Simulation Sword final-strike total exceeds the safe integer range",
    );
  }
  return summary.payoutCents;
}

const options = parseOptions(process.argv.slice(2));
printResults(options, simulate(options));
