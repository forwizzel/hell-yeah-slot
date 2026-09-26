import { CARD_SYMBOLS, PAYTABLE } from "../config/paytable";
import { REEL_STRIPS, type ReelSymbol } from "../config/reelStrips";

interface ReelMatchState {
  readonly matches: number;
  readonly natural: boolean;
  readonly ways: number;
}

const symbolReturn = new Map<string, number>();
const lengthReturn = new Map<string, number>();
for (const symbol of CARD_SYMBOLS) {
  const states = REEL_STRIPS.map((strip) => reelMatchStates(strip, symbol));
  let expectedMultiplierTenths = 0;
  for (const first of states[0]!) {
    for (const second of states[1]!) {
      for (const third of states[2]!) {
        if (first.matches === 0 || second.matches === 0 || third.matches === 0) {
          continue;
        }
        for (const fourth of states[3]!) {
          for (const fifth of states[4]!) {
            const columns = fourth.matches === 0 ? 3 : fifth.matches === 0 ? 4 : 5;
            const participating = [first, second, third, fourth, fifth].slice(0, columns);
            if (!participating.some((state) => state.natural)) {
              continue;
            }
            const ways = participating.reduce((product, state) => product * state.matches, 1);
            const stopWays = [first, second, third, fourth, fifth]
              .reduce((product, state) => product * state.ways, 1);
            const contribution = ways * PAYTABLE[symbol][columns] * stopWays;
            expectedMultiplierTenths += contribution;
            const key = `${symbol}:${columns}`;
            lengthReturn.set(key, (lengthReturn.get(key) ?? 0) + contribution);
          }
        }
      }
    }
  }
  const returnPercent = expectedMultiplierTenths / REEL_STRIPS.reduce((total, strip) => total * strip.length, 1) * 10;
  symbolReturn.set(symbol, returnPercent);
}

console.log("Exact Reel Analysis");
for (const [symbol, returnPercent] of symbolReturn) {
  console.log(`${symbol} RTP: ${returnPercent.toFixed(6)}%`);
  for (const columns of [3, 4, 5] as const) {
    const contribution = (lengthReturn.get(`${symbol}:${columns}`) ?? 0)
      / REEL_STRIPS.reduce((total, strip) => total * strip.length, 1) * 10;
    console.log(`  ${columns} columns: ${contribution.toFixed(6)}%`);
  }
}
console.log(`Total base RTP: ${[...symbolReturn.values()].reduce((total, value) => total + value, 0).toFixed(6)}%`);

function reelMatchStates(strip: ReadonlyArray<ReelSymbol>, symbol: string): ReelMatchState[] {
  const grouped = new Map<string, ReelMatchState>();
  for (let stop = 0; stop < strip.length; stop += 1) {
    const window = Array.from({ length: 3 }, (_, row) => strip[(stop + row) % strip.length]!);
    const matches = window.filter((candidate) => candidate === symbol || candidate === "WILD").length;
    const natural = window.includes(symbol as ReelSymbol);
    const key = `${matches}:${natural}`;
    const current = grouped.get(key);
    grouped.set(key, { matches, natural, ways: (current?.ways ?? 0) + 1 });
  }
  return [...grouped.values()];
}
