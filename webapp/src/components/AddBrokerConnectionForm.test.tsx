import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddBrokerConnectionForm } from "./AddBrokerConnectionForm";

const listAccounts = vi.fn();

vi.mock("../brokers/registry", () => {
  const adapter = {
    id: "mock-broker",
    label: "MockBroker",
    listAccounts: (...args: unknown[]) => listAccounts(...args),
    fetchHoldings: vi.fn(),
  };
  return {
    BROKER_REGISTRY: [adapter],
    getBrokerAdapter: (id: string) => (id === adapter.id ? adapter : undefined),
  };
});

describe("AddBrokerConnectionForm", () => {
  it("disables the fetch-accounts button until a token is entered", () => {
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Проверить и продолжить")).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok123" } });
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
    listAccounts.mockResolvedValueOnce([
      { id: "acc-1", name: "Брокерский счёт" },
      { id: "acc-2", name: "ИИС" },
    ]);
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok123" } });
    fireEvent.click(screen.getByText("Проверить и продолжить"));

    await waitFor(() => expect(listAccounts).toHaveBeenCalledWith("tok123"));
    expect(await screen.findByDisplayValue("MockBroker — Брокерский счёт")).toBeInTheDocument();
    expect(screen.getByText("Брокерский счёт")).toBeInTheDocument();
    expect(screen.getByText("ИИС")).toBeInTheDocument();
  });

  it("shows an error and no account picker when the fetch fails", async () => {
    listAccounts.mockRejectedValueOnce(new Error("rate limited"));
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok123" } });
    fireEvent.click(screen.getByText("Проверить и продолжить"));

    expect(await screen.findByText(/Не удалось подключиться.*rate limited/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Название подключения")).not.toBeInTheDocument();
  });

  it("clears fetched accounts when the token is edited again", async () => {
    listAccounts.mockResolvedValueOnce([{ id: "acc-1", name: "Брокерский счёт" }]);
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok123" } });
    fireEvent.click(screen.getByText("Проверить и продолжить"));
    await screen.findByPlaceholderText("Название подключения");

    fireEvent.change(screen.getByPlaceholderText("Токен"), { target: { value: "tok456" } });
    expect(screen.queryByPlaceholderText("Название подключения")).not.toBeInTheDocument();
  });

  it("keeps Add disabled until account, label and passphrase are all filled, then calls onAdd with an encrypted token", async () => {
    listAccounts.mockResolvedValueOnce([{ id: "acc-1", name: "Брокерский счёт" }]);
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
    expect(connection.brokerId).toBe("mock-broker");
    expect(connection.accountId).toBe("acc-1");
    expect(connection.label).toBe("MockBroker — Брокерский счёт");
    expect(connection.encryptedToken.ciphertext).toEqual(expect.any(String));
    expect(connection.id).toEqual(expect.any(String));
  });

  it("calls onCancel from the Cancel button", () => {
    const onCancel = vi.fn();
    render(<AddBrokerConnectionForm isFirstConnection={false} onAdd={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Отмена"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
