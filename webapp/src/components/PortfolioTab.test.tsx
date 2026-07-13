import { describe, it, expect, vi } from "vitest";
import { useEffect } from "react";
import { render } from "@testing-library/react";
import { ErrorProvider } from "../errors/ErrorContext";
import { PortfolioProvider } from "../portfolio/PortfolioContext";
import { usePortfolio } from "../portfolio/usePortfolio";
import { useIsMobile } from "../portfolio/useIsMobile";
import { PortfolioTab } from "./PortfolioTab";
import { PortfolioFile } from "../types";

vi.mock("../portfolio/useIsMobile", () => ({ useIsMobile: vi.fn() }));

const sampleFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 5 }],
  sectors: {},
  history: [],
  pairs: [],
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
