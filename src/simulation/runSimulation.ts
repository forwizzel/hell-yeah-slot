import { GAME_CONFIG } from "../config/gameConfig";
import { PAYTABLE } from "../config/paytable";
import { REEL_STRIPS } from "../config/reelStrips";
import { formatUsd } from "../core/formatUsd";
import { BonusEngine } from "../math/BonusEngine";
import { evaluateWays } from "../math/PayEvaluator";
import { ReelEngine } from "../math/ReelEngine";
import { safeAdd, safeMultiply } from "../math/safeInteger";
import { SeededRandomSource } from "../math/SeededRandomSource";

const DEFAULT_SPINS = 100_000;
const DEFAULT_SEED = "12345";

interface SimulationOptions {
  readonly spins: number;
  readonly seed: string;
}

interface SimulationStats {
  paidBaseSpins: number;
  totalWageredCents: number;
  baseGameWonCents: number;
  freeSpinsWonCents: number;
  winningPaidRounds: number;
  beerFeatures: number;
  cigaretteFeatures: number;
  combinedFeatures: number;
  swordFeatures: number;
  beerNaturalActivations: number;
  beerChanceActivations: number;
  cigaretteNaturalActivations: number;
  cigaretteChanceActivations: number;
  freeSpinFeatures: number;
  freeSpinsPlayed: number;
  beerRetriggers: number;
  cigaretteRetriggers: number;
  freeSpinSwordInterstitials: number;
  maximumMultiplier: number;
  maximumTotalPaidRoundWinCents: number;
}

function parseOptions(argumentsList: readonly string[]): SimulationOptions {
  let spins = DEFAULT_SPINS;
  let seed = DEFAULT_SEED;

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
    } else {
      console.warn(`Ignoring unknown argument "${argument}".`);
    }
  }

  return { spins, seed };
}

function simulate(options: SimulationOptions): SimulationStats {
  const random = new SeededRandomSource(options.seed);
  const reelEngine = new ReelEngine(REEL_STRIPS, random, GAME_CONFIG.rows);
  const bonusEngine = new BonusEngine(
    random,
    GAME_CONFIG.belowThresholdTriggerChances,
    GAME_CONFIG.beerFreeSpins,
    GAME_CONFIG.cigaretteFreeSpins,
    GAME_CONFIG.cigaretteMultiplierMinimum,
    GAME_CONFIG.cigaretteMultiplierMaximum,
  );
  const betCents = GAME_CONFIG.defaultBetCents;
  const stats: SimulationStats = {
    paidBaseSpins: options.spins,
    totalWageredCents: safeMultiply(
      options.spins,
      betCents,
      "Simulation wager total exceeds the safe integer range",
    ),
    baseGameWonCents: 0,
    freeSpinsWonCents: 0,
    winningPaidRounds: 0,
    beerFeatures: 0,
    cigaretteFeatures: 0,
    combinedFeatures: 0,
    swordFeatures: 0,
    beerNaturalActivations: 0,
    beerChanceActivations: 0,
    cigaretteNaturalActivations: 0,
    cigaretteChanceActivations: 0,
    freeSpinFeatures: 0,
    freeSpinsPlayed: 0,
    beerRetriggers: 0,
    cigaretteRetriggers: 0,
    freeSpinSwordInterstitials: 0,
    maximumMultiplier: 1,
    maximumTotalPaidRoundWinCents: 0,
  };

  for (let spin = 0; spin < options.spins; spin += 1) {
    const grid = reelEngine.spin();
    const baseWinCents = evaluateWays(grid, PAYTABLE, betCents).totalWinCents;
    const trigger = bonusEngine.resolveBaseTrigger(grid);
    let freeSpinWinCents = 0;

    if (trigger.kind === "sword") {
      stats.swordFeatures += 1;
    } else if (trigger.kind === "free-spins") {
      stats.freeSpinFeatures += 1;
      if (trigger.mode === "beer") {
        stats.beerFeatures += 1;
      } else if (trigger.mode === "cigarette") {
        stats.cigaretteFeatures += 1;
      } else {
        stats.combinedFeatures += 1;
      }

      if (trigger.beer?.source === "natural") {
        stats.beerNaturalActivations += 1;
      } else if (trigger.beer?.source === "chance") {
        stats.beerChanceActivations += 1;
      }
      if (trigger.cigarette?.source === "natural") {
        stats.cigaretteNaturalActivations += 1;
      } else if (trigger.cigarette?.source === "chance") {
        stats.cigaretteChanceActivations += 1;
      }

      let freeSpinState = bonusEngine.startFreeSpins(trigger, betCents);
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
        if (freeSpinResult.swordTriggered) {
          stats.freeSpinSwordInterstitials += 1;
        }
      }

      const summary = bonusEngine.summarize(freeSpinState);
      freeSpinWinCents = summary.payoutCents;
    }

    const totalPaidRoundWinCents = safeAdd(
      baseWinCents,
      freeSpinWinCents,
      "Paid-round win exceeds the safe integer range",
    );
    stats.baseGameWonCents = safeAdd(
      stats.baseGameWonCents,
      baseWinCents,
      "Simulation base-win total exceeds the safe integer range",
    );
    stats.freeSpinsWonCents = safeAdd(
      stats.freeSpinsWonCents,
      freeSpinWinCents,
      "Simulation free-spin total exceeds the safe integer range",
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
  const totalWonCents = safeAdd(
    stats.baseGameWonCents,
    stats.freeSpinsWonCents,
    "Simulation win total exceeds the safe integer range",
  );
  console.log("Bonus Slot Simulation");
  console.log(`Seed: ${options.seed}`);
  console.log(`Paid base spins: ${stats.paidBaseSpins}`);
  console.log(`Bet per paid spin: ${formatUsd(GAME_CONFIG.defaultBetCents)}`);
  console.log(`Total amount wagered: ${formatUsd(stats.totalWageredCents)}`);
  console.log(`Total amount won: ${formatUsd(totalWonCents)}`);
  console.log(`Total RTP: ${percentage(totalWonCents, stats.totalWageredCents)}`);
  console.log(`Base-game RTP: ${percentage(stats.baseGameWonCents, stats.totalWageredCents)}`);
  console.log(`Free-spin RTP: ${percentage(stats.freeSpinsWonCents, stats.totalWageredCents)}`);
  console.log(`Paid-round hit frequency: ${percentage(stats.winningPaidRounds, stats.paidBaseSpins)}`);
  console.log(`Free-spin feature rate: ${percentage(stats.freeSpinFeatures, stats.paidBaseSpins)}`);
  console.log(`Beer-only feature rate: ${percentage(stats.beerFeatures, stats.paidBaseSpins)}`);
  console.log(`Cigarette-only feature rate: ${percentage(stats.cigaretteFeatures, stats.paidBaseSpins)}`);
  console.log(`Combined feature rate: ${percentage(stats.combinedFeatures, stats.paidBaseSpins)}`);
  console.log(`Sword feature rate: ${percentage(stats.swordFeatures, stats.paidBaseSpins)}`);
  console.log(`Beer natural activations: ${stats.beerNaturalActivations} (${percentage(stats.beerNaturalActivations, stats.paidBaseSpins)})`);
  console.log(`Beer chance activations: ${stats.beerChanceActivations} (${percentage(stats.beerChanceActivations, stats.paidBaseSpins)})`);
  console.log(`Cigarette natural activations: ${stats.cigaretteNaturalActivations} (${percentage(stats.cigaretteNaturalActivations, stats.paidBaseSpins)})`);
  console.log(`Cigarette chance activations: ${stats.cigaretteChanceActivations} (${percentage(stats.cigaretteChanceActivations, stats.paidBaseSpins)})`);
  console.log(`Free spins played: ${stats.freeSpinsPlayed}`);
  console.log(`Average free spins per feature: ${average(stats.freeSpinsPlayed, stats.freeSpinFeatures)}`);
  console.log(`Beer retriggers: ${stats.beerRetriggers} (${percentage(stats.beerRetriggers, stats.freeSpinsPlayed)} of free spins)`);
  console.log(`Cigarette retriggers: ${stats.cigaretteRetriggers} (${percentage(stats.cigaretteRetriggers, stats.freeSpinsPlayed)} of free spins)`);
  console.log(`Sword interstitials during free spins: ${stats.freeSpinSwordInterstitials} (${percentage(stats.freeSpinSwordInterstitials, stats.freeSpinsPlayed)} of free spins)`);
  console.log(`Maximum observed multiplier: x${stats.maximumMultiplier}`);
  console.log(`Maximum observed total paid-round win: ${formatUsd(stats.maximumTotalPaidRoundWinCents)}`);
}

const options = parseOptions(process.argv.slice(2));
printResults(options, simulate(options));
