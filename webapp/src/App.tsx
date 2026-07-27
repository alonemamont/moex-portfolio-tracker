import { useState } from "react";
import { ErrorProvider } from "./errors/ErrorContext";
import { ErrorPanel } from "./errors/ErrorPanel";
import { PortfolioProvider } from "./portfolio/PortfolioContext";
import { usePortfolio } from "./portfolio/usePortfolio";
import { Header } from "./components/Header";
import { Dashboard } from "./components/Dashboard";
import { PortfolioTab } from "./components/PortfolioTab";
import { ChartsTab } from "./components/ChartsTab";
import { SectorsTab } from "./components/SectorsTab";
import { TransactionsTab } from "./components/TransactionsTab";
import { RebalanceTab } from "./components/RebalanceTab";

type Tab = "portfolio" | "charts" | "sectors" | "transactions" | "rebalance";

function AppShell() {
  const [tab, setTab] = useState<Tab>("portfolio");
  const { file } = usePortfolio();
  const [updateSignal, setUpdateSignal] = useState(0);

  return (
    <div className="app">
      <Header onFileLoaded={() => setUpdateSignal((n) => n + 1)} />
      <Dashboard />
      {file ? (
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
            <button type="button" onClick={() => setTab("transactions")} disabled={tab === "transactions"}>
              Транзакции
            </button>
            <button type="button" onClick={() => setTab("rebalance")} disabled={tab === "rebalance"}>
              Ребаланс
            </button>
          </nav>
          <main className="tab-content">
            {tab === "portfolio" && <PortfolioTab autoUpdateSignal={updateSignal} />}
            {tab === "charts" && <ChartsTab />}
            {tab === "sectors" && <SectorsTab />}
            {tab === "transactions" && <TransactionsTab />}
            {tab === "rebalance" && <RebalanceTab />}
          </main>
        </>
      ) : (
        <div className="app-empty">
          <div className="app-empty__panel">
            Портфель не загружен. Загрузите файл или начните с пустого портфеля, чтобы увидеть данные.
          </div>
        </div>
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
