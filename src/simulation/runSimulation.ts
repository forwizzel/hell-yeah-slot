import { BONUS_VALUE_WEIGHTS, GAME_CONFIG } from "../config/gameConfig";
import { PAYTABLE } from "../config/paytable";
import { REEL_STRIPS } from "../config/reelStrips";
import { BonusEngine } from "../math/BonusEngine";
import { evaluateWays } from "../math/PayEvaluator";
import { ReelEngine } from "../math/ReelEngine";
import { SeededRandomSource } from "../math/SeededRandomSource";

const DEFAULT_SPINS = 100_000;
const DEFAULT_SEED = "12345";

interface SimulationOptions {
  readonly spins: number;
  readonly seed: string;
}

interface SimulationStats {
  spins: number;
  totalWagered: number;
  baseGameWon: number;
  bonusFeatureWon: number;
  winningSpins: number;
  bonusTriggers: number;
  bonusRespins: number;
  filledBonuses: number;
  maximumTotalSpinWin: number;
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
  const reelEngine = new ReelEngine(REEL_STRIPS, BONUS_VALUE_WEIGHTS, random, GAME_CONFIG.rows);
  const bonusEngine = new BonusEngine(
    random,
    BONUS_VALUE_WEIGHTS,
    GAME_CONFIG.bonusLandingProbability,
    GAME_CONFIG.rows,
    GAME_CONFIG.columns,
    GAME_CONFIG.bonusStartingRespins,
  );
  const bet = GAME_CONFIG.defaultBet;
  const stats: SimulationStats = {
    spins: options.spins,
    totalWagered: options.spins * bet,
    baseGameWon: 0,
    bonusFeatureWon: 0,
    winningSpins: 0,
    bonusTriggers: 0,
    bonusRespins: 0,
    filledBonuses: 0,
    maximumTotalSpinWin: 0,
  };

  for (let spin = 0; spin < options.spins; spin += 1) {
    const grid = reelEngine.spin();
    const baseWin = evaluateWays(grid, PAYTABLE, bet).totalWin;
    const triggerPositions = bonusEngine.findTriggerPositions(grid);
    let bonusWin = 0;

    if (triggerPositions.length >= 3) {
      stats.bonusTriggers += 1;
      let bonusState = bonusEngine.start(grid, bet);
      let complete = bonusEngine.isComplete(bonusState);

      while (!complete) {
        const result = bonusEngine.respin(bonusState);
        bonusState = result.state;
        complete = result.complete;
      }

      const summary = bonusEngine.summarize(bonusState);
      bonusWin = summary.payout;
      stats.bonusRespins += summary.respinsPlayed;
      if (summary.filled) {
        stats.filledBonuses += 1;
      }
    }

    const totalSpinWin = baseWin + bonusWin;
    stats.baseGameWon += baseWin;
    stats.bonusFeatureWon += bonusWin;
    if (totalSpinWin > 0) {
      stats.winningSpins += 1;
    }
    stats.maximumTotalSpinWin = Math.max(stats.maximumTotalSpinWin, totalSpinWin);
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
  const totalWon = stats.baseGameWon + stats.bonusFeatureWon;
  console.log("Hold-and-Win Simulation");
  console.log(`Seed: ${options.seed}`);
  console.log(`Number of spins: ${stats.spins}`);
  console.log(`Total amount wagered: ${stats.totalWagered}`);
  console.log(`Total amount won: ${totalWon}`);
  console.log(`Estimated RTP: ${percentage(totalWon, stats.totalWagered)}`);
  console.log(`Base-game RTP: ${percentage(stats.baseGameWon, stats.totalWagered)}`);
  console.log(`Bonus-feature RTP: ${percentage(stats.bonusFeatureWon, stats.totalWagered)}`);
  console.log(`Hit frequency: ${percentage(stats.winningSpins, stats.spins)}`);
  console.log(`Bonus-trigger frequency: ${percentage(stats.bonusTriggers, stats.spins)}`);
  console.log(`Average bonus payout: ${average(stats.bonusFeatureWon, stats.bonusTriggers)}`);
  console.log(`Maximum observed total spin win: ${stats.maximumTotalSpinWin}`);
  console.log(`Average number of bonus respins: ${average(stats.bonusRespins, stats.bonusTriggers)}`);
  console.log(`Bonuses filling all 15 positions: ${percentage(stats.filledBonuses, stats.bonusTriggers)}`);
}

const options = parseOptions(process.argv.slice(2));
printResults(options, simulate(options));
