import { describe, expect, it } from "vitest";
import {
  allocateBudget,
  buildRebalancePlan,
  collectRebalanceUnits,
  planToCsv,
  planToTsv,
  RebalanceUnit,
} from "./rebalancePlan";
import { CalculatedPosition, Pair } from "../types";

function pos(partial: Partial<CalculatedPosition> & Pick<CalculatedPosition, "ticker">): CalculatedPosition {
  return {
    coefficient: 1,
    sharesOwned: 0,
    shortName: partial.ticker,
    indexWeight: 0,
    price: 100,
    lotSize: 1,
    dividendPerShare: 0,
    status: "in_index",
    sector: "",
    targetAllocation: 10,
    actualShare: 5,
    compliance: 0.5,
    positionValue: 0,
    income: 0,
    dividendYield: null,
    sharesToBuy: null,
    buyAmountRub: null,
    manualSharesOwned: 0,
    ...partial,
  };
}

describe("collectRebalanceUnits", () => {
  it("builds a solo unit with positive shortfallRub", () => {
    const calculated = [
      pos({
        ticker: "GAZP",
        targetAllocation: 10,
        actualShare: 5,
        price: 200,
        lotSize: 10,
        sharesOwned: 5,
        indexWeight: 10,
        status: "in_index",
      }),
    ];
    // deviationRub = (5-10)*1000/100 = -50 → shortfall 50
    const units = collectRebalanceUnits(calculated, [], 1000);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      unitId: "GAZP",
      kind: "solo",
      shortfallRub: 50,
      representativePrice: 200,
    });
  });

  it("skips overweight solos and out-of-index solos", () => {
    const calculated = [
      pos({ ticker: "FAT", targetAllocation: 10, actualShare: 20, status: "in_index" }),
      pos({ ticker: "OLD", targetAllocation: null, actualShare: 5, status: "out_of_index" }),
    ];
    expect(collectRebalanceUnits(calculated, [], 1000)).toEqual([]);
  });

  it("builds one pair unit from paired members using shared target/actual", () => {
    const pairs: Pair[] = [
      { tickers: ["SBER", "SBERP"], coefficients: { SBER: 1.2, SBERP: 0.8 } },
    ];
    const calculated = [
      pos({
        ticker: "SBER",
        targetAllocation: 12,
        actualShare: 6,
        price: 300,
        lotSize: 1,
        sharesOwned: 10,
        indexWeight: 9,
        status: "in_index",
        coefficient: 1, // ignored for pair collect; pair coefficients used later
      }),
      pos({
        ticker: "SBERP",
        targetAllocation: 12,
        actualShare: 6,
        price: 250,
        lotSize: 1,
        sharesOwned: 5,
        indexWeight: 3,
        status: "in_index",
        coefficient: 1,
      }),
    ];
    const units = collectRebalanceUnits(calculated, pairs, 1000);
    expect(units).toHaveLength(1);
    expect(units[0].unitId).toBe("SBER+SBERP");
    expect(units[0].kind).toBe("pair");
    expect(units[0].shortfallRub).toBe(60); // (6-12)*1000/100 = -60
    expect(units[0].representativePrice).toBe(300);
    expect(units[0].members.map((m) => m.ticker)).toEqual(["SBER", "SBERP"]);
    expect(units[0].members[0].coefficient).toBe(1.2);
    expect(units[0].members[1].coefficient).toBe(0.8);
  });

  it("skips a pair when targetAllocation is 0", () => {
    const pairs: Pair[] = [{ tickers: ["A", "B"], coefficients: { A: 1, B: 1 } }];
    const calculated = [
      pos({ ticker: "A", targetAllocation: 0, actualShare: 0, status: "out_of_index" }),
      pos({ ticker: "B", targetAllocation: 0, actualShare: 0, status: "out_of_index" }),
    ];
    expect(collectRebalanceUnits(calculated, pairs, 1000)).toEqual([]);
  });
});

function soloUnit(over: Partial<RebalanceUnit> & Pick<RebalanceUnit, "unitId" | "shortfallRub">): RebalanceUnit {
  const ticker = over.unitId;
  const price = over.representativePrice ?? 100;
  return {
    kind: "solo",
    targetAllocation: 10,
    actualShare: 5,
    representativePrice: price,
    members: [
      {
        ticker,
        price,
        lotSize: 1,
        sharesOwned: 0,
        indexWeight: 10,
        status: "in_index",
        coefficient: 1,
      },
    ],
    ...over,
  };
}

describe("allocateBudget", () => {
  it("splits budget proportional to shortfall then lot-rounds", () => {
    const units = [
      soloUnit({
        unitId: "EXP",
        shortfallRub: 100,
        representativePrice: 200,
        members: [
          {
            ticker: "EXP",
            price: 200,
            lotSize: 1,
            sharesOwned: 0,
            indexWeight: 1,
            status: "in_index",
            coefficient: 1,
          },
        ],
      }),
      soloUnit({
        unitId: "CHEAP",
        shortfallRub: 100,
        representativePrice: 50,
        members: [
          {
            ticker: "CHEAP",
            price: 50,
            lotSize: 1,
            sharesOwned: 0,
            indexWeight: 1,
            status: "in_index",
            coefficient: 1,
          },
        ],
      }),
    ];
    const lines = allocateBudget(units, 300);
    expect(lines.map((l) => l.ticker)).toEqual(["CHEAP"]);
    expect(lines[0]).toMatchObject({ lots: 3, shares: 3, spendRub: 150 });
    expect(lines.every((l) => l.lots > 0)).toBe(true);
  });

  it("processes expensive unit before cheap when both can buy", () => {
    const units = [
      soloUnit({
        unitId: "CHEAP",
        shortfallRub: 100,
        representativePrice: 50,
        members: [
          {
            ticker: "CHEAP",
            price: 50,
            lotSize: 1,
            sharesOwned: 0,
            indexWeight: 1,
            status: "in_index",
            coefficient: 1,
          },
        ],
      }),
      soloUnit({
        unitId: "EXP",
        shortfallRub: 100,
        representativePrice: 100,
        members: [
          {
            ticker: "EXP",
            price: 100,
            lotSize: 1,
            sharesOwned: 0,
            indexWeight: 1,
            status: "in_index",
            coefficient: 1,
          },
        ],
      }),
    ];
    const lines = allocateBudget(units, 200);
    expect(lines).toEqual([
      expect.objectContaining({ ticker: "EXP", lots: 1, spendRub: 100 }),
      expect.objectContaining({ ticker: "CHEAP", lots: 2, spendRub: 100 }),
    ]);
  });

  it("splits pair rawRub by indexWeight*coefficient and skips out_of_index member", () => {
    const unit: RebalanceUnit = {
      unitId: "SBER+SBERP",
      kind: "pair",
      shortfallRub: 100,
      targetAllocation: 12,
      actualShare: 0,
      representativePrice: 300,
      members: [
        {
          ticker: "SBER",
          price: 300,
          lotSize: 1,
          sharesOwned: 0,
          indexWeight: 9,
          status: "in_index",
          coefficient: 1,
        },
        {
          ticker: "SBERP",
          price: 200,
          lotSize: 1,
          sharesOwned: 0,
          indexWeight: 3,
          status: "in_index",
          coefficient: 1,
        },
        {
          ticker: "GHOST",
          price: 100,
          lotSize: 1,
          sharesOwned: 0,
          indexWeight: 5,
          status: "out_of_index",
          coefficient: 1,
        },
      ],
    };
    const lines = allocateBudget([unit], 1200);
    expect(lines.map((l) => l.ticker)).toEqual(["SBER", "SBERP"]);
    expect(lines.find((l) => l.ticker === "SBER")).toMatchObject({ lots: 3, spendRub: 900 });
    expect(lines.find((l) => l.ticker === "SBERP")).toMatchObject({ lots: 1, spendRub: 200 });
  });

  it("skips members with null or zero price", () => {
    const units = [
      soloUnit({
        unitId: "DEAD",
        shortfallRub: 100,
        representativePrice: null,
        members: [
          {
            ticker: "DEAD",
            price: null,
            lotSize: 1,
            sharesOwned: 0,
            indexWeight: 1,
            status: "in_index",
            coefficient: 1,
          },
        ],
      }),
    ];
    expect(allocateBudget(units, 1000)).toEqual([]);
  });

  it("treats null lotSize as 1", () => {
    const units = [
      soloUnit({
        unitId: "X",
        shortfallRub: 100,
        representativePrice: 10,
        members: [
          {
            ticker: "X",
            price: 10,
            lotSize: null,
            sharesOwned: 0,
            indexWeight: 1,
            status: "in_index",
            coefficient: 1,
          },
        ],
      }),
    ];
    const lines = allocateBudget(units, 25);
    expect(lines[0]).toMatchObject({ lots: 2, shares: 2, spendRub: 20 });
  });
});

describe("buildRebalancePlan budget/free_cash", () => {
  const gazp = pos({
    ticker: "GAZP",
    targetAllocation: 50,
    actualShare: 0,
    compliance: 0,
    price: 100,
    lotSize: 1,
    sharesOwned: 0,
    indexWeight: 50,
    positionValue: 0,
    status: "in_index",
  });
  const filler = pos({
    ticker: "LKOH",
    targetAllocation: 50,
    actualShare: 50,
    compliance: 1,
    price: 100,
    lotSize: 1,
    sharesOwned: 5,
    indexWeight: 50,
    positionValue: 500,
    status: "in_index",
  });

  it("returns no_budget when budget is 0", () => {
    const plan = buildRebalancePlan({
      calculated: [gazp, filler],
      pairs: [],
      portfolioValue: 1000,
      budgetRub: 0,
      mode: "budget",
    });
    expect(plan.emptyReason).toBe("no_budget");
    expect(plan.lines).toEqual([]);
  });

  it("budget and free_cash produce the same lines for the same amount", () => {
    const input = {
      calculated: [gazp, filler],
      pairs: [],
      portfolioValue: 1000,
      budgetRub: 500,
    };
    const a = buildRebalancePlan({ ...input, mode: "budget" });
    const b = buildRebalancePlan({ ...input, mode: "free_cash" });
    expect(a.lines).toEqual(b.lines);
    expect(a.spentTotal).toBe(b.spentTotal);
    expect(a.emptyReason).toBeNull();
    expect(a.spentTotal).toBeLessThanOrEqual(500);
    expect(a.lines.every((l) => l.lots > 0)).toBe(true);
  });

  it("sets budget_too_small when nothing is affordable", () => {
    const expensive = pos({
      ticker: "EXP",
      targetAllocation: 100,
      actualShare: 0,
      compliance: 0,
      price: 10_000,
      lotSize: 1,
      sharesOwned: 0,
      indexWeight: 100,
      positionValue: 0,
      status: "in_index",
    });
    const plan = buildRebalancePlan({
      calculated: [expensive],
      pairs: [],
      portfolioValue: 1,
      budgetRub: 100,
      mode: "budget",
    });
    expect(plan.emptyReason).toBe("budget_too_small");
    expect(plan.lines).toEqual([]);
  });

  it("reports avgComplianceAfter >= avgComplianceBefore when buys fill a shortfall", () => {
    const plan = buildRebalancePlan({
      calculated: [gazp, filler],
      pairs: [],
      portfolioValue: 1000,
      budgetRub: 500,
      mode: "budget",
    });
    expect(plan.avgComplianceBefore).not.toBeNull();
    expect(plan.avgComplianceAfter).not.toBeNull();
    expect(plan.avgComplianceAfter!).toBeGreaterThanOrEqual(plan.avgComplianceBefore!);
  });
});

const multiShortfall = [
  pos({
    ticker: "BIG",
    targetAllocation: 40,
    actualShare: 0,
    compliance: 0,
    price: 100,
    lotSize: 1,
    sharesOwned: 0,
    indexWeight: 40,
    positionValue: 0,
    status: "in_index",
  }),
  pos({
    ticker: "MID",
    targetAllocation: 30,
    actualShare: 10,
    compliance: 10 / 30,
    price: 100,
    lotSize: 1,
    sharesOwned: 10,
    indexWeight: 30,
    positionValue: 1000,
    status: "in_index",
  }),
  pos({
    ticker: "SMALL",
    targetAllocation: 20,
    actualShare: 15,
    compliance: 15 / 20,
    price: 100,
    lotSize: 1,
    sharesOwned: 15,
    indexWeight: 20,
    positionValue: 1500,
    status: "in_index",
  }),
];

describe("buildRebalancePlan min_trades", () => {
  it("requires budget", () => {
    const plan = buildRebalancePlan({
      calculated: multiShortfall,
      pairs: [],
      portfolioValue: 10_000,
      budgetRub: 0,
      mode: "min_trades",
    });
    expect(plan.emptyReason).toBe("no_budget");
  });

  it("stops adding units when compliance gain is below threshold", () => {
    const plan = buildRebalancePlan({
      calculated: multiShortfall,
      pairs: [],
      portfolioValue: 10_000,
      budgetRub: 5000,
      mode: "min_trades",
      complianceGainThreshold: 0.15,
    });
    const unitIds = [...new Set(plan.lines.map((l) => l.unitId))];
    expect(plan.emptyReason).toBeNull();
    expect(unitIds).toEqual(["BIG"]);
  });

  it("accepts multiple units when threshold is low then stops mid-list", () => {
    const plan = buildRebalancePlan({
      calculated: multiShortfall,
      pairs: [],
      portfolioValue: 10_000,
      budgetRub: 5000,
      mode: "min_trades",
      complianceGainThreshold: 0.02,
    });
    const unitIds = [...new Set(plan.lines.map((l) => l.unitId))];
    expect(plan.emptyReason).toBeNull();
    expect(unitIds.length).toBe(2);
    expect(unitIds).toEqual(["BIG", "MID"]);
  });

  it("returns threshold_not_met when even the first unit cannot clear the threshold", () => {
    const plan = buildRebalancePlan({
      calculated: multiShortfall,
      pairs: [],
      portfolioValue: 10_000,
      budgetRub: 100,
      mode: "min_trades",
      complianceGainThreshold: 10,
    });
    expect(plan.emptyReason).toBe("threshold_not_met");
    expect(plan.lines).toEqual([]);
  });

  it("touches fewer or equal units than full budget mode at a high threshold", () => {
    const base = {
      calculated: multiShortfall,
      pairs: [] as Pair[],
      portfolioValue: 10_000,
      budgetRub: 5000,
    };
    const full = buildRebalancePlan({ ...base, mode: "budget" });
    const few = buildRebalancePlan({
      ...base,
      mode: "min_trades",
      complianceGainThreshold: 0.15,
    });
    const count = (p: { lines: { unitId: string }[] }) => new Set(p.lines.map((l) => l.unitId)).size;
    expect(few.emptyReason).toBeNull();
    expect(count(few)).toBeGreaterThan(0);
    expect(count(few)).toBeLessThan(count(full));
  });
});

describe("plan export", () => {
  const gazp = pos({
    ticker: "GAZP",
    targetAllocation: 50,
    actualShare: 0,
    compliance: 0,
    price: 100,
    lotSize: 1,
    sharesOwned: 0,
    indexWeight: 50,
    positionValue: 0,
    status: "in_index",
  });
  const filler = pos({
    ticker: "LKOH",
    targetAllocation: 50,
    actualShare: 50,
    compliance: 1,
    price: 100,
    lotSize: 1,
    sharesOwned: 5,
    indexWeight: 50,
    positionValue: 500,
    status: "in_index",
  });

  const exportInput = {
    calculated: [gazp, filler],
    pairs: [] as Pair[],
    portfolioValue: 1000,
    budgetRub: 500,
    mode: "budget" as const,
  };

  it("planToTsv includes header and tab-separated rows", () => {
    const plan = buildRebalancePlan(exportInput);
    expect(plan.lines.length).toBeGreaterThan(0);
    const text = planToTsv(plan);
    const rows = text.trimEnd().split("\n");
    expect(rows[0]).toBe("unitId\tticker\tlots\tshares\tspendRub\tprice\tlotSize");
    expect(rows.length).toBe(1 + plan.lines.length);
    expect(rows[1].split("\t")[1]).toBe(plan.lines[0].ticker);
  });

  it("planToCsv uses commas", () => {
    const plan = buildRebalancePlan(exportInput);
    expect(planToCsv(plan).split("\n")[0]).toBe(
      "unitId,ticker,lots,shares,spendRub,price,lotSize"
    );
  });

  it("header-only when plan has no lines", () => {
    const plan = buildRebalancePlan({ ...exportInput, budgetRub: 0 });
    expect(planToTsv(plan)).toBe("unitId\tticker\tlots\tshares\tspendRub\tprice\tlotSize\n");
  });
});
