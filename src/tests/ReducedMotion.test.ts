import { describe, expect, it, vi } from "vitest";
import type { Grid, WaysGrid } from "../core/types";
import { ReelGridView } from "../presentation/ReelGridView";
import { SwordBoardView } from "../presentation/SwordBoardView";

const baseGrid: Grid = Array.from({ length: 3 }, () =>
  Array.from({ length: 5 }, () => ({ kind: "card" as const, symbol: "10" as const })),
);
const swordGrid: WaysGrid = Array.from({ length: 6 }, () =>
  Array.from({ length: 5 }, () => ({ kind: "card" as const, symbol: "J" as const })),
);

describe("reduced-motion spins", () => {
  it("renders the resolved base grid directly and completes each column once", async () => {
    const renderGrid = vi.fn();
    const view = Object.assign(Object.create(ReelGridView.prototype), { renderGrid }) as ReelGridView;
    const lockedColumns: number[] = [];

    await view.animateBaseSpin(baseGrid, false, (column) => lockedColumns.push(column), [], [], 20, true);

    expect(renderGrid).toHaveBeenCalledWith(baseGrid, [], []);
    expect(lockedColumns).toEqual([0, 1, 2, 3, 4]);
  });

  it("renders the resolved Sword board directly, retaining the unlocked-row count", async () => {
    const render = vi.fn();
    const view = Object.assign(Object.create(SwordBoardView.prototype), { render }) as SwordBoardView;
    const lockedColumns: number[] = [];

    await view.animateSpin(swordGrid, 4, false, (column) => lockedColumns.push(column), true);

    expect(render).toHaveBeenCalledWith(swordGrid, 4);
    expect(lockedColumns).toEqual([0, 1, 2, 3, 4]);
  });
});
