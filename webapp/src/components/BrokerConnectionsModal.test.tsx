import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ErrorProvider } from "../errors/ErrorContext";
import { ErrorPanel } from "../errors/ErrorPanel";
import { BrokerConnectionsModal } from "./BrokerConnectionsModal";
import { encryptToken } from "../brokers/crypto";
import { PortfolioFile, BrokerConnection } from "../types";
import { SyncDiffRow } from "../brokers/syncDiff";

vi.mock("../brokers/registry", () => ({
  BROKER_REGISTRY: [{ id: "tbank", label: "Т-Банк", listAccounts: vi.fn(), fetchHoldings: vi.fn() }],
  getBrokerAdapter: (id: string) => (id === "tbank" ? { id: "tbank", label: "Т-Банк" } : undefined),
}));

vi.mock("../portfolio/runBrokerSync", () => ({
  fetchBrokerSyncPreview: vi.fn(),
}));

import { fetchBrokerSyncPreview } from "../portfolio/runBrokerSync";

const PASSPHRASE = "hunter2";
const TOKEN = "real-broker-token";

async function makeConnection(): Promise<BrokerConnection> {
  return {
    id: "conn-1",
    brokerId: "tbank",
    accountId: "acc-1",
    label: "Мой Т-Банк",
    encryptedToken: await encryptToken(TOKEN, PASSPHRASE),
  };
}

function makeFile(connections: BrokerConnection[]): PortfolioFile {
  return {
    version: 1,
    positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 5 }],
    sectors: {},
    history: [],
    pairs: [],
    brokerConnections: connections,
    brokerAccounts: [],
    transactions: [],
  };
}

function renderModal(file: PortfolioFile, onUpdateFile = vi.fn(), onClose = vi.fn()) {
  return render(
    <ErrorProvider>
      <ErrorPanel />
      <BrokerConnectionsModal file={file} onUpdateFile={onUpdateFile} onClose={onClose} />
    </ErrorProvider>
  );
}

beforeEach(() => {
  vi.mocked(fetchBrokerSyncPreview).mockReset();
});

afterEach(() => {
  sessionStorage.clear();
});

describe("BrokerConnectionsModal", () => {
  it("shows a locked connection with its adapter label", async () => {
    const connection = await makeConnection();
    renderModal(makeFile([connection]));

    expect(screen.getByText("🔒 Мой Т-Банк (Т-Банк)")).toBeInTheDocument();
    expect(screen.getByText("Разблокировать")).toBeInTheDocument();
  });

  it("prompts for a passphrase when syncing a locked connection, and runs the sync after unlocking", async () => {
    const connection = await makeConnection();
    const rows: SyncDiffRow[] = [{ ticker: "GAZP", status: "existing", previousShares: 0, newShares: 10 }];
    vi.mocked(fetchBrokerSyncPreview).mockResolvedValueOnce(rows);
    renderModal(makeFile([connection]));

    fireEvent.click(screen.getByText("Синхронизировать"));
    const passphraseInput = screen.getByPlaceholderText("Пароль-фраза");
    fireEvent.change(passphraseInput, { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByText("Ок"));

    expect(await screen.findByText("Синхронизация: Мой Т-Банк")).toBeInTheDocument();
    expect(fetchBrokerSyncPreview).toHaveBeenCalledWith(expect.anything(), connection, TOKEN);
    expect(screen.queryByText("🔒 Мой Т-Банк (Т-Банк)")).not.toBeInTheDocument();
  });

  it("shows an error and keeps the prompt open for a wrong passphrase", async () => {
    const connection = await makeConnection();
    renderModal(makeFile([connection]));

    fireEvent.click(screen.getByText("Разблокировать"));
    fireEvent.change(screen.getByPlaceholderText("Пароль-фраза"), { target: { value: "wrong-pass" } });
    fireEvent.click(screen.getByText("Ок"));

    expect(await screen.findByText("Неверный пароль")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Пароль-фраза")).toBeInTheDocument();
    expect(fetchBrokerSyncPreview).not.toHaveBeenCalled();
  });

  it("unlocking without syncing does not trigger a sync", async () => {
    const connection = await makeConnection();
    renderModal(makeFile([connection]));

    fireEvent.click(screen.getByText("Разблокировать"));
    fireEvent.change(screen.getByPlaceholderText("Пароль-фраза"), { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByText("Ок"));

    await waitFor(() => expect(screen.queryByText("🔒 Мой Т-Банк (Т-Банк)")).not.toBeInTheDocument());
    expect(fetchBrokerSyncPreview).not.toHaveBeenCalled();
  });

  it("surfaces the sync error and does not open the preview when the fetch fails", async () => {
    const connection = await makeConnection();
    vi.mocked(fetchBrokerSyncPreview).mockRejectedValueOnce(new Error("network down"));
    renderModal(makeFile([connection]));

    fireEvent.click(screen.getByText("Синхронизировать"));
    fireEvent.change(screen.getByPlaceholderText("Пароль-фраза"), { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByText("Ок"));

    expect(await screen.findByText(/Не удалось подключиться.*network down/)).toBeInTheDocument();
    expect(screen.queryByText("Синхронизация: Мой Т-Банк")).not.toBeInTheDocument();
  });

  it("removes the connection and calls onUpdateFile with it filtered out", async () => {
    const connection = await makeConnection();
    const onUpdateFile = vi.fn();
    const file = makeFile([connection]);
    renderModal(file, onUpdateFile);

    fireEvent.click(screen.getByText("Удалить"));

    expect(onUpdateFile).toHaveBeenCalledWith({ ...file, brokerConnections: [] });
  });

  it("applies the diff and closes the preview when the sync is confirmed", async () => {
    const connection = await makeConnection();
    const rows: SyncDiffRow[] = [{ ticker: "GAZP", status: "existing", previousShares: 0, newShares: 10 }];
    vi.mocked(fetchBrokerSyncPreview).mockResolvedValueOnce(rows);
    const onUpdateFile = vi.fn();
    renderModal(makeFile([connection]), onUpdateFile);

    fireEvent.click(screen.getByText("Синхронизировать"));
    fireEvent.change(screen.getByPlaceholderText("Пароль-фраза"), { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByText("Ок"));
    await screen.findByText("Синхронизация: Мой Т-Банк");

    fireEvent.click(screen.getByText("Подтвердить"));

    expect(onUpdateFile).toHaveBeenCalledTimes(1);
    const updated: PortfolioFile = onUpdateFile.mock.calls[0][0];
    expect(updated.positions[0].brokerHoldings).toEqual([
      { connectionId: "conn-1", shares: 10, syncedAt: expect.any(String) },
    ]);
    expect(screen.queryByText("Синхронизация: Мой Т-Банк")).not.toBeInTheDocument();
  });

  it("closes the preview without updating the file when sync is cancelled", async () => {
    const connection = await makeConnection();
    const rows: SyncDiffRow[] = [{ ticker: "GAZP", status: "existing", previousShares: 0, newShares: 10 }];
    vi.mocked(fetchBrokerSyncPreview).mockResolvedValueOnce(rows);
    const onUpdateFile = vi.fn();
    renderModal(makeFile([connection]), onUpdateFile);

    fireEvent.click(screen.getByText("Синхронизировать"));
    fireEvent.change(screen.getByPlaceholderText("Пароль-фраза"), { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByText("Ок"));
    await screen.findByText("Синхронизация: Мой Т-Банк");

    fireEvent.click(screen.getByText("Отмена"));

    expect(onUpdateFile).not.toHaveBeenCalled();
    expect(screen.queryByText("Синхронизация: Мой Т-Банк")).not.toBeInTheDocument();
  });

  it("opens the add-connection form and hides the top-level actions while it's open", () => {
    renderModal(makeFile([]));

    fireEvent.click(screen.getByText("Добавить подключение"));
    expect(screen.getByPlaceholderText("Токен")).toBeInTheDocument();
    expect(screen.queryByText("Добавить подключение")).not.toBeInTheDocument();
  });

  it("calls onClose from the Close button", () => {
    const onClose = vi.fn();
    renderModal(makeFile([]), vi.fn(), onClose);
    fireEvent.click(screen.getByText("Закрыть"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
