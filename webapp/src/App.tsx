import { useState } from "react";
import { ErrorProvider } from "./errors/ErrorContext";
import { ErrorPanel } from "./errors/ErrorPanel";
import { PortfolioProvider } from "./portfolio/PortfolioContext";
import { usePortfolio } from "./portfolio/usePortfolio";
import { Header } from "./components/Header";
import { PortfolioTab } from "./components/PortfolioTab";
import { ChartsTab } from "./components/ChartsTab";
import { SectorsTab } from "./components/SectorsTab";

type Tab = "portfolio" | "charts" | "sectors";

function AppShell() {
  const [tab, setTab] = useState<Tab>("portfolio");
  const { file } = usePortfolio();
  const [updateSignal, setUpdateSignal] = useState(0);

  return (
    <div className="app">
      <Header onFileLoaded={() => setUpdateSignal((n) => n + 1)} />
      {file && (
        <>
          <nav className="tabs">
            <button type="button" onClick={() => setTab("portfolio")} disabled={tab === "portfolio"}>
              Портфель
            </button>
            <button type="button" onClick={() => setTab("charts")} disabled={tab === "charts"}>
              Графики
            </button>
            <button type="button" onClick={() => setTab("sectors")} disabled={tab === "sectors"}>
              Сектора
            </button>
          </nav>
          <main className="tab-content">
            {tab === "portfolio" && <PortfolioTab autoUpdateSignal={updateSignal} />}
            {tab === "charts" && <ChartsTab />}
            {tab === "sectors" && <SectorsTab />}
          </main>
        </>
      )}
      <ErrorPanel />
    </div>
  );
}

export default function App() {
  return (
    <ErrorProvider>
      <PortfolioProvider>
        <AppShell />
      </PortfolioProvider>
    </ErrorProvider>
  );
}
