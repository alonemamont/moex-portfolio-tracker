import { describe, it, expect, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorProvider } from "../errors/ErrorContext";
import { PortfolioProvider } from "../portfolio/PortfolioContext";
import { usePortfolio } from "../portfolio/usePortfolio";
import { useIsMobile } from "../portfolio/useIsMobile";
import { PortfolioTab } from "./PortfolioTab";
import { PortfolioFile } from "../types";

vi.mock("../portfolio/useIsMobile", () => ({ useIsMobile: vi.fn() }));

const sampleFile: PortfolioFile = {
  version: 1,
  positions: [
    { ticker: "GAZP", coefficient: 1, sharesOwned: 5 },
    { ticker: "SBER", coefficient: 1, sharesOwned: 3 },
  ],
  sectors: {},
  history: [],
  pairs: [],
  brokerConnections: [],
  brokerAccounts: [],
  transactions: [],
};

const dummyToken = { ciphertext: "c", iv: "i", salt: "s" };

const brokerFile: PortfolioFile = {
  version: 1,
  positions: [
    {
      ticker: "GAZP",
      coefficient: 1,
      sharesOwned: 0,
      brokerHoldings: [{ connectionId: "conn1", shares: 10, syncedAt: "2026-01-01T00:00:00.000Z" }],
    },
    {
      ticker: "SBER",
      coefficient: 1,
      sharesOwned: 0,
      brokerHoldings: [{ connectionId: "conn2", shares: 7, syncedAt: "2026-01-01T00:00:00.000Z" }],
    },
  ],
  sectors: {},
  history: [],
  pairs: [],
  brokerConnections: [
    { id: "conn1", brokerId: "tbank", accountId: "acc1", label: "Т-Банк", encryptedToken: dummyToken },
    { id: "conn2", brokerId: "finam", accountId: "acc2", label: "Финам", encryptedToken: dummyToken },
  ],
  brokerAccounts: [],
  transactions: [],
};

function Harness({ file }: { file: PortfolioFile }) {
  const { setFile } = usePortfolio();
  useEffect(() => {
    setFile(file);
  }, [setFile, file]);
  return <PortfolioTab autoUpdateSignal={0} />;
}

function renderPortfolioTab(file: PortfolioFile = sampleFile) {
  return render(
    <ErrorProvider>
      <PortfolioProvider>
        <Harness file={file} />
      </PortfolioProvider>
    </ErrorProvider>
  );
}

describe("PortfolioTab mobile switch", () => {
  it("renders the positions table when useIsMobile is false", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    const { container } = renderPortfolioTab();
    expect(container.querySelector(".positions-table")).not.toBeNull();
    expect(container.querySelector(".position-card-list")).toBeNull();
  });

  it("renders the position card list when useIsMobile is true", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    const { container } = renderPortfolioTab();
    expect(container.querySelector(".position-card-list")).not.toBeNull();
    expect(container.querySelector(".positions-table")).toBeNull();
  });
});

describe("PortfolioTab reset positions", () => {
  it("disables the reset button when no visible position is affected by any source", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab();

    const search = screen.getByPlaceholderText("Поиск по тикеру или названию");
    fireEvent.change(search, { target: { value: "NOPE" } });

    expect(screen.getByRole("button", { name: "Сбросить позиции" })).toBeDisabled();
  });

  it("resets manual shares only for currently visible positions, via the manual-source step", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab();

    const search = screen.getByPlaceholderText("Поиск по тикеру или названию");
    fireEvent.change(search, { target: { value: "GAZP" } });

    const resetButton = screen.getByRole("button", { name: "Сбросить позиции" });
    expect(resetButton).not.toBeDisabled();
    fireEvent.click(resetButton);
    fireEvent.click(screen.getByRole("button", { name: "Ручные позиции (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Обнулить" }));

    fireEvent.change(search, { target: { value: "" } });

    expect(screen.getByRole("button", { name: "0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3" })).toBeInTheDocument();
  });

  it("shows only Ручные позиции when there are no broker connections", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab();

    fireEvent.click(screen.getByRole("button", { name: "Сбросить позиции" }));
    expect(screen.getByRole("button", { name: "Ручные позиции (2)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Т-Банк/ })).not.toBeInTheDocument();
  });

  it("Назад returns to the source picker without applying the reset", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab();

    fireEvent.click(screen.getByRole("button", { name: "Сбросить позиции" }));
    fireEvent.click(screen.getByRole("button", { name: "Ручные позиции (2)" }));
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));

    expect(screen.getByRole("button", { name: "Ручные позиции (2)" })).toBeInTheDocument();
  });

  it("resets only the selected broker connection's holdings, leaving other connections and manual shares untouched", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab(brokerFile);

    fireEvent.click(screen.getByRole("button", { name: "Сбросить позиции" }));
    fireEvent.click(screen.getByRole("button", { name: "Т-Банк (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Обнулить" }));

    fireEvent.click(screen.getByRole("button", { name: "Сбросить позиции" }));
    expect(screen.getByRole("button", { name: "Т-Банк (0)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Финам (1)" })).not.toBeDisabled();
  });

  it("refreshes the table total and breakdown after resetting manual shares", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab({
      ...brokerFile,
      positions: [{
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 5,
        brokerHoldings: [
          { connectionId: "conn1", shares: 10, syncedAt: "2026-01-01T00:00:00.000Z" },
          { connectionId: "conn2", shares: 7, syncedAt: "2026-01-01T00:00:00.000Z" },
        ],
      }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Сбросить позиции" }));
    fireEvent.click(screen.getByRole("button", { name: "Ручные позиции (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Обнулить" }));

    expect(screen.getByRole("button", { name: "17" })).toBeInTheDocument();
    fireEvent.click(document.querySelector<HTMLButtonElement>(".shares-popover__trigger")!);
    expect(screen.getByText("Итого").parentElement).toHaveTextContent("Итого17");
  });

  it("refreshes the table total and breakdown after resetting one broker", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab({
      ...brokerFile,
      positions: [{
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 5,
        brokerHoldings: [
          { connectionId: "conn1", shares: 10, syncedAt: "2026-01-01T00:00:00.000Z" },
          { connectionId: "conn2", shares: 7, syncedAt: "2026-01-01T00:00:00.000Z" },
        ],
      }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Сбросить позиции" }));
    fireEvent.click(screen.getByRole("button", { name: "Т-Банк (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Обнулить" }));

    expect(screen.getByRole("button", { name: "12" })).toBeInTheDocument();
    fireEvent.click(document.querySelector<HTMLButtonElement>(".shares-popover__trigger")!);
    expect(screen.getByText("Итого").parentElement).toHaveTextContent("Итого12");
  });

  it("offers retained deleted-broker holdings as a separate reset source", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab({
      ...sampleFile,
      positions: [{
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 5,
        brokerHoldings: [{ connectionId: "deleted-conn", shares: 10, syncedAt: "2026-01-01T00:00:00.000Z" }],
      }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Сбросить позиции" }));
    fireEvent.click(screen.getByRole("button", { name: "Удалённые holdings (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Обнулить" }));

    expect(screen.getByRole("button", { name: "5" })).toBeInTheDocument();
    expect(document.querySelector(".shares-popover__trigger")).toBeNull();
  });
});
