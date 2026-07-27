import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SharesBreakdownPopover } from "./SharesBreakdownPopover";

const rows = [
  { label: "Т-Банк", shares: 10 },
  { label: "Вручную", shares: 2 },
];

describe("SharesBreakdownPopover", () => {
  it("shows the total trigger and keeps the panel closed by default", () => {
    render(<SharesBreakdownPopover rows={rows} total={12} />);

    expect(screen.getByRole("button", { name: "Σ12" })).toBeInTheDocument();
    expect(screen.queryByText("Т-Банк")).not.toBeInTheDocument();
  });

  it("opens the panel on click, showing every row and the total", () => {
    render(<SharesBreakdownPopover rows={rows} total={12} />);

    fireEvent.click(screen.getByRole("button", { name: "Σ12" }));

    expect(screen.getByText("Т-Банк")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Вручную")).toBeInTheDocument();
    expect(screen.getByText("Итого")).toBeInTheDocument();
  });

  it("closes the panel on a second click of the trigger", () => {
    render(<SharesBreakdownPopover rows={rows} total={12} />);

    const trigger = screen.getByRole("button", { name: "Σ12" });
    fireEvent.click(trigger);
    fireEvent.click(trigger);

    expect(screen.queryByText("Т-Банк")).not.toBeInTheDocument();
  });

  it("closes the panel on outside click", () => {
    render(
      <div>
        <button type="button">outside</button>
        <SharesBreakdownPopover rows={rows} total={12} />
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: "Σ12" }));
    expect(screen.getByText("Т-Банк")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByText("Т-Банк")).not.toBeInTheDocument();
  });

  it("closes the panel on Escape", () => {
    render(<SharesBreakdownPopover rows={rows} total={12} />);

    fireEvent.click(screen.getByRole("button", { name: "Σ12" }));
    expect(screen.getByText("Т-Банк")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Т-Банк")).not.toBeInTheDocument();
  });
});
