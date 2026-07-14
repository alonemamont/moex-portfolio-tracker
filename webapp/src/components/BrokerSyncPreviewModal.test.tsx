import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { BrokerSyncPreviewModal } from "./BrokerSyncPreviewModal";
import { SyncDiffRow } from "../brokers/syncDiff";

describe("BrokerSyncPreviewModal", () => {
  it("renders one row per ticker with its status label and share transition", () => {
    const rows: SyncDiffRow[] = [
      { ticker: "GAZP", status: "existing", previousShares: 5, newShares: 10 },
      { ticker: "NEWTICK", status: "new", previousShares: 0, newShares: 3 },
      { ticker: "BADTICK", status: "unresolved", previousShares: 0, newShares: 0 },
    ];
    render(
      <BrokerSyncPreviewModal connectionLabel="Т-Банк" rows={rows} onConfirm={vi.fn()} onClose={vi.fn()} />
    );

    expect(screen.getByText("Синхронизация: Т-Банк")).toBeInTheDocument();
    expect(screen.getByText("GAZP")).toBeInTheDocument();
    expect(screen.getByText("обновление")).toBeInTheDocument();
    expect(screen.getByText("5 → 10")).toBeInTheDocument();

    expect(screen.getByText("NEWTICK")).toBeInTheDocument();
    expect(screen.getByText("новая позиция")).toBeInTheDocument();
    expect(screen.getByText("0 → 3")).toBeInTheDocument();

    expect(screen.getByText("BADTICK")).toBeInTheDocument();
    expect(screen.getByText("тикер не найден — пропущен")).toBeInTheDocument();
  });

  it("disables Confirm when every row is unresolved or unchanged", () => {
    const rows: SyncDiffRow[] = [
      { ticker: "GAZP", status: "existing", previousShares: 10, newShares: 10 },
      { ticker: "BADTICK", status: "unresolved", previousShares: 0, newShares: 0 },
    ];
    render(
      <BrokerSyncPreviewModal connectionLabel="Т-Банк" rows={rows} onConfirm={vi.fn()} onClose={vi.fn()} />
    );

    expect(screen.getByText("Подтвердить")).toBeDisabled();
  });

  it("enables Confirm when at least one non-unresolved row changed, and calls onConfirm", () => {
    const onConfirm = vi.fn();
    const rows: SyncDiffRow[] = [
      { ticker: "GAZP", status: "existing", previousShares: 5, newShares: 10 },
    ];
    render(
      <BrokerSyncPreviewModal connectionLabel="Т-Банк" rows={rows} onConfirm={onConfirm} onClose={vi.fn()} />
    );

    const confirmButton = screen.getByText("Подтвердить");
    expect(confirmButton).not.toBeDisabled();
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose from the Cancel button", () => {
    const onClose = vi.fn();
    const rows: SyncDiffRow[] = [{ ticker: "GAZP", status: "existing", previousShares: 5, newShares: 10 }];
    render(
      <BrokerSyncPreviewModal connectionLabel="Т-Банк" rows={rows} onConfirm={vi.fn()} onClose={onClose} />
    );

    fireEvent.click(screen.getByText("Отмена"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has no detectable a11y violations", async () => {
    const rows: SyncDiffRow[] = [
      { ticker: "GAZP", status: "existing", previousShares: 5, newShares: 10 },
      { ticker: "NEWTICK", status: "new", previousShares: 0, newShares: 3 },
      { ticker: "BADTICK", status: "unresolved", previousShares: 0, newShares: 0 },
    ];
    const { container } = render(
      <BrokerSyncPreviewModal connectionLabel="Т-Банк" rows={rows} onConfirm={vi.fn()} onClose={vi.fn()} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
