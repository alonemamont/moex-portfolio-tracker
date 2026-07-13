import { describe, it, expect } from "vitest";
import { buildSyncDiff, applySyncDiff, SyncDiffRow } from "./syncDiff";
import { Position, PortfolioFile } from "../types";

const alwaysTradeable = () => true;
const neverTradeable = () => false;

describe("buildSyncDiff", () => {
  it("marks a ticker already in the portfolio as 'existing' and carries its previous connection shares", () => {
    const existing: Position[] = [
      {
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 5,
        brokerHoldings: [{ connectionId: "conn-1", shares: 10, syncedAt: "2026-01-01" }],
      },
    ];
    const rows = buildSyncDiff("conn-1", [{ ticker: "GAZP", shares: 15 }], existing, alwaysTradeable);
    expect(rows).toEqual([{ ticker: "GAZP", status: "existing", previousShares: 10, newShares: 15 }]);
  });

  it("marks a brand-new ticker that resolves on MOEX as 'new'", () => {
    const rows = buildSyncDiff("conn-1", [{ ticker: "NEWTICK", shares: 3 }], [], alwaysTradeable);
    expect(rows).toEqual([{ ticker: "NEWTICK", status: "new", previousShares: 0, newShares: 3 }]);
  });

  it("marks a brand-new ticker that doesn't resolve on MOEX as 'unresolved' with 0 shares", () => {
    const rows = buildSyncDiff("conn-1", [{ ticker: "DELISTED", shares: 3 }], [], neverTradeable);
    expect(rows).toEqual([{ ticker: "DELISTED", status: "unresolved", previousShares: 0, newShares: 0 }]);
  });

  it("zeroes out a ticker that was previously synced from this connection but is absent from the new response", () => {
    const existing: Position[] = [
      {
        ticker: "OLD",
        coefficient: 1,
        sharesOwned: 0,
        brokerHoldings: [{ connectionId: "conn-1", shares: 7, syncedAt: "2026-01-01" }],
      },
    ];
    const rows = buildSyncDiff("conn-1", [], existing, alwaysTradeable);
    expect(rows).toEqual([{ ticker: "OLD", status: "existing", previousShares: 7, newShares: 0 }]);
  });

  it("ignores another connection's contribution when computing previousShares for this connection", () => {
    const existing: Position[] = [
      {
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 0,
        brokerHoldings: [{ connectionId: "conn-other", shares: 100, syncedAt: "2026-01-01" }],
      },
    ];
    const rows = buildSyncDiff("conn-1", [{ ticker: "GAZP", shares: 4 }], existing, alwaysTradeable);
    expect(rows).toEqual([{ ticker: "GAZP", status: "existing", previousShares: 0, newShares: 4 }]);
  });

  it("matches tickers case-insensitively", () => {
    const existing: Position[] = [
      {
        ticker: "gazp",
        coefficient: 1,
        sharesOwned: 0,
        brokerHoldings: [{ connectionId: "conn-1", shares: 5, syncedAt: "2026-01-01" }],
      },
    ];
    const rows = buildSyncDiff("conn-1", [{ ticker: "GAZP", shares: 8 }], existing, alwaysTradeable);
    expect(rows).toEqual([{ ticker: "GAZP", status: "existing", previousShares: 5, newShares: 8 }]);
  });
});

describe("applySyncDiff", () => {
  function file(positions: Position[]): PortfolioFile {
    return { version: 1, positions, sectors: {}, history: [], pairs: [], brokerConnections: [] };
  }

  it("upserts a brokerHoldings entry for an existing position", () => {
    const rows: SyncDiffRow[] = [{ ticker: "GAZP", status: "existing", previousShares: 0, newShares: 10 }];
    const initial = file([{ ticker: "GAZP", coefficient: 1, sharesOwned: 5, brokerHoldings: [] }]);

    const result = applySyncDiff(initial, "conn-1", rows, "2026-07-13T00:00:00.000Z");

    expect(result.positions).toEqual([
      {
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 5,
        brokerHoldings: [{ connectionId: "conn-1", shares: 10, syncedAt: "2026-07-13T00:00:00.000Z" }],
      },
    ]);
  });

  it("removes the connection's brokerHoldings entry (but keeps the position) when newShares is 0", () => {
    const rows: SyncDiffRow[] = [{ ticker: "GAZP", status: "existing", previousShares: 10, newShares: 0 }];
    const initial = file([
      {
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 5,
        brokerHoldings: [{ connectionId: "conn-1", shares: 10, syncedAt: "2026-01-01" }],
      },
    ]);

    const result = applySyncDiff(initial, "conn-1", rows, "2026-07-13T00:00:00.000Z");

    expect(result.positions).toEqual([{ ticker: "GAZP", coefficient: 1, sharesOwned: 5, brokerHoldings: [] }]);
  });

  it("preserves another connection's brokerHoldings entry when applying this connection's sync (merging multiple connections)", () => {
    const rows: SyncDiffRow[] = [{ ticker: "GAZP", status: "existing", previousShares: 0, newShares: 4 }];
    const initial = file([
      {
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 0,
        brokerHoldings: [{ connectionId: "conn-other", shares: 100, syncedAt: "2026-01-01" }],
      },
    ]);

    const result = applySyncDiff(initial, "conn-1", rows, "2026-07-13T00:00:00.000Z");

    expect(result.positions[0].brokerHoldings).toEqual(
      expect.arrayContaining([
        { connectionId: "conn-other", shares: 100, syncedAt: "2026-01-01" },
        { connectionId: "conn-1", shares: 4, syncedAt: "2026-07-13T00:00:00.000Z" },
      ])
    );
  });

  it("creates a new position with coefficient 1 for a 'new' status row", () => {
    const rows: SyncDiffRow[] = [{ ticker: "NEWTICK", status: "new", previousShares: 0, newShares: 3 }];
    const result = applySyncDiff(file([]), "conn-1", rows, "2026-07-13T00:00:00.000Z");

    expect(result.positions).toEqual([
      {
        ticker: "NEWTICK",
        coefficient: 1,
        sharesOwned: 0,
        brokerHoldings: [{ connectionId: "conn-1", shares: 3, syncedAt: "2026-07-13T00:00:00.000Z" }],
      },
    ]);
  });

  it("ignores an 'unresolved' row entirely — no position created, nothing persisted", () => {
    const rows: SyncDiffRow[] = [{ ticker: "DELISTED", status: "unresolved", previousShares: 0, newShares: 0 }];
    const result = applySyncDiff(file([]), "conn-1", rows, "2026-07-13T00:00:00.000Z");
    expect(result.positions).toEqual([]);
  });
});
