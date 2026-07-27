import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { AddBrokerConnectionForm } from "./AddBrokerConnectionForm";
import { WINDOWS_RELEASE_URL } from "./brokerAvailability";

const listAccounts = vi.fn();
let tauriRuntime = false;

vi.mock("../runtime/isTauriRuntime", () => ({
  isTauriRuntime: () => tauriRuntime,
}));

vi.mock("../brokers/registry", () => {
  const tbank = {
    id: "tbank",
    label: "Т-Банк",
    requiresDesktopRuntime: true,
    listAccounts: (...args: unknown[]) => listAccounts(...args),
    fetchHoldings: vi.fn(),
  };
  const finam = {
    id: "finam",
    label: "Finam",
    listAccounts: (...args: unknown[]) => listAccounts(...args),
    fetchHoldings: vi.fn(),
  };
  return {
    BROKER_REGISTRY: [tbank, finam],
    getBrokerAdapter: (id: string) => [tbank, finam].find((adapter) => adapter.id === id),
  };
});

beforeEach(() => {
  tauriRuntime = false;
  listAccounts.mockReset();
});

describe("AddBrokerConnectionForm", () => {
  it("blocks T-Bank in browser mode and shows the Windows notice", () => {
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("Т-Банк")).toBeInTheDocument();
    expect(screen.getByText(/Синхронизация с Т-Банком доступна в приложении для Windows/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Скачать portable-версию" })).toHaveAttribute(
      "href",
      WINDOWS_RELEASE_URL
    );
    expect(screen.getByRole("button", { name: "Проверить и продолжить" })).toBeDisabled();
  });

  it("enables Finam in browser mode after entering a token", () => {
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Брокер"), { target: { value: "finam" } });
    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok123" } });

    expect(screen.getByRole("button", { name: "Проверить и продолжить" })).not.toBeDisabled();
    expect(screen.queryByText(/Синхронизация с Т-Банком доступна/)).not.toBeInTheDocument();
  });

  it("enables T-Bank in Tauri mode after entering a token", () => {
    tauriRuntime = true;
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok123" } });

    expect(screen.getByRole("button", { name: "Проверить и продолжить" })).not.toBeDisabled();
    expect(screen.queryByText(/Синхронизация с Т-Банком доступна/)).not.toBeInTheDocument();
  });

  it("shows the warning banner only for the first connection", () => {
    const { rerender } = render(
      <AddBrokerConnectionForm isFirstConnection={true} onAdd={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText(/Токен брокера сохраняется в файле портфеля/)).toBeInTheDocument();

    rerender(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText(/Токен брокера сохраняется в файле портфеля/)).not.toBeInTheDocument();
  });

  it("populates the account picker and default label after a successful fetch", async () => {
    tauriRuntime = true;
    listAccounts.mockResolvedValueOnce([
      { id: "acc-1", name: "Брокерский счёт" },
      { id: "acc-2", name: "ИИС" },
    ]);
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok123" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить и продолжить" }));

    await waitFor(() => expect(listAccounts).toHaveBeenCalledWith("tok123"));
    expect(await screen.findByDisplayValue("Т-Банк — Брокерский счёт")).toBeInTheDocument();
    expect(screen.getByText("Брокерский счёт")).toBeInTheDocument();
    expect(screen.getByText("ИИС")).toBeInTheDocument();
  });

  it("shows the wrapped adapter error and no account picker when the fetch fails", async () => {
    tauriRuntime = true;
    listAccounts.mockRejectedValueOnce(new Error("API Т-Банка временно недоступен"));
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok123" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить и продолжить" }));

    expect(
      await screen.findByText("Не удалось подключиться, возможно ограничение брокера: API Т-Банка временно недоступен")
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Название подключения")).not.toBeInTheDocument();
  });

  it("clears fetched accounts when the token is edited again", async () => {
    tauriRuntime = true;
    listAccounts.mockResolvedValueOnce([{ id: "acc-1", name: "Брокерский счёт" }]);
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok123" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить и продолжить" }));
    await screen.findByPlaceholderText("Название подключения");

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok456" } });
    expect(screen.queryByPlaceholderText("Название подключения")).not.toBeInTheDocument();
  });

  it("keeps Add disabled until account, label and passphrase are all filled, then calls onAdd with an encrypted token", async () => {
    tauriRuntime = true;
    listAccounts.mockResolvedValueOnce([{ id: "acc-1", name: "Брокерский счёт" }]);
    const onAdd = vi.fn();
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={onAdd} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok123" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить и продолжить" }));
    await screen.findByPlaceholderText("Название подключения");

    expect(screen.getByRole("button", { name: "Добавить" })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Пароль-фраза для шифрования токена"), {
      target: { value: "hunter2" },
    });
    expect(screen.getByRole("button", { name: "Добавить" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const connection = onAdd.mock.calls[0][0];
    expect(connection.brokerId).toBe("tbank");
    expect(connection.accountId).toBe("acc-1");
    expect(connection.label).toBe("Т-Банк — Брокерский счёт");
    expect(connection.encryptedToken.ciphertext).toEqual(expect.any(String));
    expect(connection.id).toEqual(expect.any(String));
  });

  it("calls onCancel from the Cancel button", () => {
    const onCancel = vi.fn();
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("has no detectable a11y violations", async () => {
    const { container } = render(
      <AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />
    );
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
