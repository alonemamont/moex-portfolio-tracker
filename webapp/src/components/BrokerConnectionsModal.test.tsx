import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ErrorProvider } from "../errors/ErrorContext";
import { ErrorPanel } from "../errors/ErrorPanel";
import { BrokerConnectionsModal } from "./BrokerConnectionsModal";
import { encryptToken } from "../brokers/crypto";
import { getSessionToken, setSessionToken } from "../brokers/tokenSession";
import { PortfolioFile, BrokerConnection } from "../types";
import { SyncDiffRow } from "../brokers/syncDiff";
import { WINDOWS_RELEASE_URL } from "./brokerAvailability";

let tauriRuntime = false;

vi.mock("../runtime/isTauriRuntime", () => ({
  isTauriRuntime: () => tauriRuntime,
}));

vi.mock("../brokers/registry", () => ({
  BROKER_REGISTRY: [
    { id: "tbank", label: "Т-Банк", listAccounts: vi.fn(), fetchHoldings: vi.fn() },
    { id: "finam", label: "Finam", listAccounts: vi.fn(), fetchHoldings: vi.fn() },
  ],
  getBrokerAdapter: (id: string) => {
    if (id === "tbank") return { id: "tbank", label: "Т-Банк" };
    if (id === "finam") return { id: "finam", label: "Finam" };
    return undefined;
  },
}));

vi.mock("../portfolio/runBrokerSync", () => ({
  fetchBrokerSyncPreview: vi.fn(),
}));

import { fetchBrokerSyncPreview } from "../portfolio/runBrokerSync";

const PASSPHRASE = "hunter2";
const TOKEN = "real-broker-token";

async function makeConnection(
  overrides: Partial<BrokerConnection> = {}
): Promise<BrokerConnection> {
  return {
    id: overrides.id ?? "conn-1",
    brokerId: overrides.brokerId ?? "tbank",
    accountId: overrides.accountId ?? "acc-1",
    label: overrides.label ?? "Мой Т-Банк",
    encryptedToken: overrides.encryptedToken ?? (await encryptToken(TOKEN, PASSPHRASE)),
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
  tauriRuntime = false;
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
    expect(screen.getByRole("button", { name: "Разблокировать" })).toBeInTheDocument();
  });

  it("disables only T-Bank sync in browser mode and shows the Windows notice", async () => {
    const tbankConnection = await makeConnection();
    const finamConnection = await makeConnection({
      id: "conn-2",
      brokerId: "finam",
      label: "Finam account",
    });
    renderModal(makeFile([tbankConnection, finamConnection]));

    const syncButtons = screen.getAllByRole("button", { name: "Синхронизировать" });
    expect(syncButtons[0]).toBeDisabled();
    expect(syncButtons[1]).not.toBeDisabled();
    expect(
      screen.getByText(/Синхронизация с Т-Банком доступна в приложении для Windows/)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Скачать portable-версию" })).toHaveAttribute(
      "href",
      WINDOWS_RELEASE_URL
    );
  });

  it("enables T-Bank sync in Tauri mode", async () => {
    tauriRuntime = true;
    const connection = await makeConnection();
    renderModal(makeFile([connection]));

    expect(screen.getByRole("button", { name: "Синхронизировать" })).not.toBeDisabled();
    expect(screen.queryByText(/Синхронизация с Т-Банком доступна/)).not.toBeInTheDocument();
  });

  it("prompts for a passphrase when syncing a locked connection, and runs the sync after unlocking", async () => {
    tauriRuntime = true;
    const connection = await makeConnection();
    const rows: SyncDiffRow[] = [{ ticker: "GAZP", status: "existing", previousShares: 0, newShares: 10 }];
    vi.mocked(fetchBrokerSyncPreview).mockResolvedValueOnce(rows);
    renderModal(makeFile([connection]));

    fireEvent.click(screen.getByRole("button", { name: "Синхронизировать" }));
    const passphraseInput = screen.getByPlaceholderText("Пароль-фраза");
    fireEvent.change(passphraseInput, { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByRole("button", { name: "Ок" }));

    expect(await screen.findByText("Синхронизация: Мой Т-Банк")).toBeInTheDocument();
    expect(fetchBrokerSyncPreview).toHaveBeenCalledWith(expect.anything(), connection, TOKEN);
    expect(screen.queryByText("🔒 Мой Т-Банк (Т-Банк)")).not.toBeInTheDocument();
  });

  it("shows an error and keeps the prompt open for a wrong passphrase", async () => {
    tauriRuntime = true;
    const connection = await makeConnection();
    renderModal(makeFile([connection]));

    fireEvent.click(screen.getByRole("button", { name: "Разблокировать" }));
    fireEvent.change(screen.getByPlaceholderText("Пароль-фраза"), { target: { value: "wrong-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Ок" }));

    expect(await screen.findByText("Неверный пароль")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Пароль-фраза")).toBeInTheDocument();
    expect(fetchBrokerSyncPreview).not.toHaveBeenCalled();
  });

  it("unlocking without syncing does not trigger a sync", async () => {
    tauriRuntime = true;
    const connection = await makeConnection();
    renderModal(makeFile([connection]));

    fireEvent.click(screen.getByRole("button", { name: "Разблокировать" }));
    fireEvent.change(screen.getByPlaceholderText("Пароль-фраза"), { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByRole("button", { name: "Ок" }));

    await waitFor(() => expect(screen.queryByText("🔒 Мой Т-Банк (Т-Банк)")).not.toBeInTheDocument());
    expect(fetchBrokerSyncPreview).not.toHaveBeenCalled();
  });

  it("surfaces the sync error and does not open the preview when the fetch fails", async () => {
    tauriRuntime = true;
    const connection = await makeConnection();
    vi.mocked(fetchBrokerSyncPreview).mockRejectedValueOnce(new Error("API Т-Банка временно недоступен"));
    renderModal(makeFile([connection]));

    fireEvent.click(screen.getByRole("button", { name: "Синхронизировать" }));
    fireEvent.change(screen.getByPlaceholderText("Пароль-фраза"), { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByRole("button", { name: "Ок" }));

    expect(await screen.findByText("API Т-Банка временно недоступен")).toBeInTheDocument();
    expect(screen.queryByText("Синхронизация: Мой Т-Банк")).not.toBeInTheDocument();
  });

  it("shows exact ISS sync-stage error without replacing it with a generic broker error", async () => {
    tauriRuntime = true;
    const connection = await makeConnection();
    vi.mocked(fetchBrokerSyncPreview).mockRejectedValueOnce(
      new Error("Не удалось проверить тикеры через MOEX ISS: Failed to fetch")
    );
    renderModal(makeFile([connection]));

    fireEvent.click(screen.getByRole("button", { name: "Синхронизировать" }));
    fireEvent.change(screen.getByPlaceholderText("Пароль-фраза"), { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByRole("button", { name: "Ок" }));

    expect(await screen.findByText("Не удалось проверить тикеры через MOEX ISS: Failed to fetch")).toBeInTheDocument();
    expect(screen.queryByText("Синхронизация: Мой Т-Банк")).not.toBeInTheDocument();
  });

  it("removes the connection and calls onUpdateFile with it filtered out", async () => {
    const connection = await makeConnection();
    const onUpdateFile = vi.fn();
    const file = makeFile([connection]);
    renderModal(file, onUpdateFile);

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    expect(onUpdateFile).toHaveBeenCalledWith({ ...file, brokerConnections: [] });
  });

  it("clears the cached session token when a connection is removed", async () => {
    const connection = await makeConnection();
    setSessionToken(connection.id, TOKEN);
    const file = makeFile([connection]);
    renderModal(file, vi.fn());

    expect(getSessionToken(connection.id)).toBe(TOKEN);

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    expect(getSessionToken(connection.id)).toBeNull();
  });

  it("applies the diff and closes the preview when the sync is confirmed", async () => {
    tauriRuntime = true;
    const connection = await makeConnection();
    const rows: SyncDiffRow[] = [{ ticker: "GAZP", status: "existing", previousShares: 0, newShares: 10 }];
    vi.mocked(fetchBrokerSyncPreview).mockResolvedValueOnce(rows);
    const onUpdateFile = vi.fn();
    renderModal(makeFile([connection]), onUpdateFile);

    fireEvent.click(screen.getByRole("button", { name: "Синхронизировать" }));
    fireEvent.change(screen.getByPlaceholderText("Пароль-фраза"), { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByRole("button", { name: "Ок" }));
    await screen.findByText("Синхронизация: Мой Т-Банк");

    fireEvent.click(screen.getByRole("button", { name: "Подтвердить" }));

    expect(onUpdateFile).toHaveBeenCalledTimes(1);
    const updated: PortfolioFile = onUpdateFile.mock.calls[0][0];
    expect(updated.positions[0].brokerHoldings).toEqual([
      { connectionId: "conn-1", shares: 10, syncedAt: expect.any(String) },
    ]);
    expect(screen.queryByText("Синхронизация: Мой Т-Банк")).not.toBeInTheDocument();
  });

  it("closes the preview without updating the file when sync is cancelled", async () => {
    tauriRuntime = true;
    const connection = await makeConnection();
    const rows: SyncDiffRow[] = [{ ticker: "GAZP", status: "existing", previousShares: 0, newShares: 10 }];
    vi.mocked(fetchBrokerSyncPreview).mockResolvedValueOnce(rows);
    const onUpdateFile = vi.fn();
    renderModal(makeFile([connection]), onUpdateFile);

    fireEvent.click(screen.getByRole("button", { name: "Синхронизировать" }));
    fireEvent.change(screen.getByPlaceholderText("Пароль-фраза"), { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByRole("button", { name: "Ок" }));
    await screen.findByText("Синхронизация: Мой Т-Банк");

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(onUpdateFile).not.toHaveBeenCalled();
    expect(screen.queryByText("Синхронизация: Мой Т-Банк")).not.toBeInTheDocument();
  });

  it("opens the add-connection form and hides the top-level actions while it's open", () => {
    renderModal(makeFile([]));

    fireEvent.click(screen.getByRole("button", { name: "Добавить подключение" }));
    expect(screen.getByPlaceholderText("Токен")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить подключение" })).not.toBeInTheDocument();
  });

  it("calls onClose from the Close button", () => {
    const onClose = vi.fn();
    renderModal(makeFile([]), vi.fn(), onClose);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has no detectable a11y violations when a connection is locked", async () => {
    const connection = await makeConnection();
    const { container } = renderModal(makeFile([connection]));
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
