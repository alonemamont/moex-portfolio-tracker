import { describe, it, expect, vi, afterEach } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ErrorProvider } from "../errors/ErrorContext";
import { ErrorPanel } from "../errors/ErrorPanel";
import { PortfolioProvider } from "../portfolio/PortfolioContext";
import { usePortfolio } from "../portfolio/usePortfolio";
import { DividendsTab } from "./DividendsTab";
import { PortfolioFile } from "../types";
import * as issClient from "../iss/client";

afterEach(() => {
  vi.restoreAllMocks();
});

const emptyOwned: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "SBER", coefficient: 1, sharesOwned: 0 }],
  sectors: {},
  history: [],
  pairs: [],
  brokerConnections: [],
  brokerAccounts: [],
  transactions: [],
  dividendEvents: [],
  dividendsFetchedAt: null,
};

const ownedNeverFetched: PortfolioFile = {
  ...emptyOwned,
  positions: [{ ticker: "SBER", coefficient: 1, sharesOwned: 10 }],
};

function Harness({ file }: { file: PortfolioFile }) {
  const { setFile, setLiveByTicker } = usePortfolio();
  useEffect(() => {
    setFile(file);
    setLiveByTicker(
      new Map([
        [
          "SBER",
          {
            ticker: "SBER",
            shortName: "SBER",
            indexWeight: 1,
            price: 100,
            lotSize: 1,
            dividendPerShare: 0,
            status: "in_index",
          },
        ],
      ])
    );
  }, [setFile, setLiveByTicker, file]);
  return <DividendsTab />;
}

function renderTab(file: PortfolioFile) {
  return render(
    <ErrorProvider>
      <PortfolioProvider>
        <Harness file={file} />
      </PortfolioProvider>
      <ErrorPanel />
    </ErrorProvider>
  );
}

describe("DividendsTab", () => {
  it("shows no-positions empty and does not call ISS", async () => {
    const spy = vi.spyOn(issClient, "fetchDividendHistoriesForTickers");
    renderTab(emptyOwned);
    expect(screen.getByText("Нет позиций с акциями")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Обновить дивиденды" }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("shows never-fetched empty copy", () => {
    renderTab(ownedNeverFetched);
    expect(screen.getByText("Нажмите Обновить")).toBeTruthy();
  });

  it("applies successful update into file and renders upcoming row", async () => {
    vi.spyOn(issClient, "fetchDividendHistoriesForTickers").mockResolvedValue({
      eventsByTicker: new Map([
        ["SBER", [{ ticker: "SBER", registryCloseDate: "2099-01-01", valuePerShare: 25 }]],
      ]),
      succeededTickers: ["SBER"],
      failedTickers: [],
    });
    renderTab(ownedNeverFetched);
    fireEvent.click(screen.getByRole("button", { name: "Обновить дивиденды" }));
    await waitFor(() => {
      expect(screen.getByText("SBER")).toBeTruthy();
      expect(screen.getByText("2099-01-01")).toBeTruthy();
    });
    expect(screen.getByText(/Ожидаемый доход ориентировочный/)).toBeTruthy();
  });

  it("on full fail does not change dividend fields and shows error", async () => {
    vi.spyOn(issClient, "fetchDividendHistoriesForTickers").mockResolvedValue({
      eventsByTicker: new Map(),
      succeededTickers: [],
      failedTickers: ["SBER"],
    });
    const file: PortfolioFile = {
      ...ownedNeverFetched,
      dividendEvents: [{ ticker: "SBER", registryCloseDate: "2099-01-01", valuePerShare: 1 }],
      dividendsFetchedAt: "2026-01-01T00:00:00.000Z",
    };
    renderTab(file);
    fireEvent.click(screen.getByRole("button", { name: "Обновить дивиденды" }));
    await waitFor(() => {
      expect(screen.getByText(/Не удалось обновить дивиденды/)).toBeTruthy();
    });
    expect(screen.getByText("2099-01-01")).toBeTruthy();
  });

  it("partial fail keeps old events for failed ticker and warns", async () => {
    const file: PortfolioFile = {
      ...ownedNeverFetched,
      positions: [
        { ticker: "SBER", coefficient: 1, sharesOwned: 10 },
        { ticker: "GAZP", coefficient: 1, sharesOwned: 5 },
      ],
      dividendEvents: [
        { ticker: "SBER", registryCloseDate: "2099-01-01", valuePerShare: 1 },
        { ticker: "GAZP", registryCloseDate: "2099-02-01", valuePerShare: 2 },
      ],
      dividendsFetchedAt: "2026-01-01T00:00:00.000Z",
    };
    vi.spyOn(issClient, "fetchDividendHistoriesForTickers").mockResolvedValue({
      eventsByTicker: new Map([
        ["SBER", [{ ticker: "SBER", registryCloseDate: "2099-03-01", valuePerShare: 9 }]],
      ]),
      succeededTickers: ["SBER"],
      failedTickers: ["GAZP"],
    });
    renderTab(file);
    fireEvent.click(screen.getByRole("button", { name: "Обновить дивиденды" }));
    await waitFor(() => {
      expect(screen.getByText("2099-03-01")).toBeTruthy();
      expect(screen.getByText("2099-02-01")).toBeTruthy();
      expect(screen.getByText(/Не удалось обновить дивиденды для: GAZP/)).toBeTruthy();
    });
  });

  it("shows no-upcoming empty after successful fetch with only past dates", () => {
    const file: PortfolioFile = {
      ...ownedNeverFetched,
      dividendEvents: [{ ticker: "SBER", registryCloseDate: "2000-01-01", valuePerShare: 1 }],
      dividendsFetchedAt: "2026-07-27T00:00:00.000Z",
    };
    renderTab(file);
    expect(screen.getByText("Ближайших отсечек в ISS нет")).toBeTruthy();
  });
});
