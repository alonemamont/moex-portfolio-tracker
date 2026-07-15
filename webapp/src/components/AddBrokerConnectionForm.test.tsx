import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { AddBrokerConnectionForm } from "./AddBrokerConnectionForm";

const listAccounts = {
  tbank: vi.fn(),
  finam: vi.fn(),
};

let tauriRuntime = true;

vi.mock("../runtime/isTauriRuntime", () => ({
  isTauriRuntime: () => tauriRuntime,
}));

vi.mock("../brokers/registry", () => {
  const registry = [
    {
      id: "tbank",
      label: "Т-Банк",
      listAccounts: (...args: unknown[]) => listAccounts.tbank(...args),
      fetchHoldings: vi.fn(),
    },
    {
      id: "finam",
      label: "Финам",
      listAccounts: (...args: unknown[]) => listAccounts.finam(...args),
      fetchHoldings: vi.fn(),
    },
  ];

  return {
    BROKER_REGISTRY: registry,
    getBrokerAdapter: (id: string) => registry.find((adapter) => adapter.id === id),
  };
});

beforeEach(() => {
  tauriRuntime = true;
  listAccounts.tbank.mockReset();
  listAccounts.finam.mockReset();
});

describe("AddBrokerConnectionForm", () => {
  it("disables T-Bank account lookup in the browser and points users at the Windows release", () => {
    tauriRuntime = false;

    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("Т-Банк")).toBeInTheDocument();
    expect(screen.getByText(/Синхронизация с Т-Банком доступна в приложении для Windows/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Скачать portable-версию" })).toHaveAttribute(
      "href",
      "https://github.com/alonemamont/moex-portfolio-tracker/releases/latest"
    );
    expect(screen.getByText("Проверить и продолжить")).toBeDisabled();
  });

  it("keeps Finam available in the browser and T-Bank available inside Tauri", () => {
    tauriRuntime = false;

    const { rerender } = render(
      <AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />
    );

    fireEvent.change(screen.getByLabelText("Брокер"), { target: { value: "finam" } });
    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "finam-token" } });
    expect(screen.getByText("Проверить и продолжить")).not.toBeDisabled();

    tauriRuntime = true;
    rerender(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Брокер"), { target: { value: "tbank" } });
    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tbank-token" } });
    expect(screen.getByText("Проверить и продолжить")).not.toBeDisabled();
  });

  it("shows the warning banner only for the first connection", () => {
    const { rerender } = render(
      <AddBrokerConnectionForm isFirstConnection={true} onAdd={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText(/сохраняется в файле портфеля в зашифрованном виде/)).toBeInTheDocument();

    rerender(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText(/сохраняется в файле портфеля в зашифрованном виде/)).not.toBeInTheDocument();
  });

  it("populates the account picker and default label after a successful fetch", async () => {
    listAccounts.tbank.mockResolvedValueOnce([
      { id: "acc-1", name: "Брокерский счёт" },
      { id: "acc-2", name: "ИИС" },
    ]);
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok123" } });
    fireEvent.click(screen.getByText("Проверить и продолжить"));

    await waitFor(() => expect(listAccounts.tbank).toHaveBeenCalledWith("tok123"));
    expect(await screen.findByDisplayValue("Т-Банк — Брокерский счёт")).toBeInTheDocument();
    expect(screen.getByText("Брокерский счёт")).toBeInTheDocument();
    expect(screen.getByText("ИИС")).toBeInTheDocument();
  });

  it("shows an error and no account picker when the fetch fails", async () => {
    listAccounts.tbank.mockRejectedValueOnce(new Error("rate limited"));
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok123" } });
    fireEvent.click(screen.getByText("Проверить и продолжить"));

    expect(await screen.findByText(/Не удалось подключиться.*rate limited/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Название подключения")).not.toBeInTheDocument();
  });

  it("clears fetched accounts when the token is edited again", async () => {
    listAccounts.tbank.mockResolvedValueOnce([{ id: "acc-1", name: "Брокерский счёт" }]);
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok123" } });
    fireEvent.click(screen.getByText("Проверить и продолжить"));
    await screen.findByPlaceholderText("Название подключения");

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok456" } });
    expect(screen.queryByPlaceholderText("Название подключения")).not.toBeInTheDocument();
  });

  it("keeps Add disabled until account, label and passphrase are all filled, then calls onAdd with an encrypted token", async () => {
    listAccounts.tbank.mockResolvedValueOnce([{ id: "acc-1", name: "Брокерский счёт" }]);
    const onAdd = vi.fn();
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={onAdd} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok123" } });
    fireEvent.click(screen.getByText("Проверить и продолжить"));
    await screen.findByPlaceholderText("Название подключения");

    expect(screen.getByText("Добавить")).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Пароль-фраза для шифрования токена"), {
      target: { value: "hunter2" },
    });
    expect(screen.getByText("Добавить")).not.toBeDisabled();

    fireEvent.click(screen.getByText("Добавить"));

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
    fireEvent.click(screen.getByText("Отмена"));
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
