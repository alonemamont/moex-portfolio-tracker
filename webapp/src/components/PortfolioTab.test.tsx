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

function Harness() {
  const { setFile } = usePortfolio();
  useEffect(() => {
    setFile(sampleFile);
  }, [setFile]);
  return <PortfolioTab autoUpdateSignal={0} />;
}

function renderPortfolioTab() {
  return render(
    <ErrorProvider>
      <PortfolioProvider>
        <Harness />
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

describe("PortfolioTab manual shares reset", () => {
  it("disables the reset button when no visible position has a non-zero manual value", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab();

    const search = screen.getByPlaceholderText("Поиск по тикеру или названию");
    fireEvent.change(search, { target: { value: "NOPE" } });

    expect(screen.getByRole("button", { name: "Сбросить вручную введённое" })).toBeDisabled();
  });

  it("resets manual shares only for currently visible positions with a non-zero manual value", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab();

    const search = screen.getByPlaceholderText("Поиск по тикеру или названию");
    fireEvent.change(search, { target: { value: "GAZP" } });

    const resetButton = screen.getByRole("button", { name: "Сбросить вручную введённое" });
    expect(resetButton).not.toBeDisabled();
    fireEvent.click(resetButton);
    fireEvent.click(screen.getByRole("button", { name: "Обнулить" }));

    fireEvent.change(search, { target: { value: "" } });

    expect(screen.getByRole("button", { name: "0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3" })).toBeInTheDocument();
  });
});
