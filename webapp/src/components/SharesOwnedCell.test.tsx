import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SharesOwnedCell } from "./SharesOwnedCell";

describe("SharesOwnedCell", () => {
  it("shows the total in display mode, with no input present", () => {
    render(<SharesOwnedCell manualSharesOwned={2} total={12} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "12" })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("switches to an input showing the manual value on click", () => {
    render(<SharesOwnedCell manualSharesOwned={2} total={12} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "12" }));

    const input = screen.getByRole("spinbutton", { name: "Куплено вручную" });
    expect(input).toHaveValue(2);
    expect(screen.queryByRole("button", { name: "12" })).not.toBeInTheDocument();
  });

  it("calls onChange on every keystroke while editing", () => {
    const onChange = vi.fn();
    render(<SharesOwnedCell manualSharesOwned={2} total={12} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "12" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Куплено вручную" }), {
      target: { value: "5" },
    });

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("exits edit mode and shows the display button again on blur", () => {
    render(<SharesOwnedCell manualSharesOwned={2} total={12} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "12" }));
    fireEvent.blur(screen.getByRole("spinbutton", { name: "Куплено вручную" }));

    expect(screen.getByRole("button", { name: "12" })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("exits edit mode on Enter and on Escape", () => {
    render(<SharesOwnedCell manualSharesOwned={2} total={12} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "12" }));
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Куплено вручную" }), { key: "Enter" });
    expect(screen.getByRole("button", { name: "12" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "12" }));
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Куплено вручную" }), { key: "Escape" });
    expect(screen.getByRole("button", { name: "12" })).toBeInTheDocument();
  });

  it("re-seeds the input from the latest manualSharesOwned each time edit mode is entered", () => {
    const { rerender } = render(
      <SharesOwnedCell manualSharesOwned={2} total={12} onChange={vi.fn()} />
    );
    rerender(<SharesOwnedCell manualSharesOwned={7} total={17} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "17" }));
    expect(screen.getByRole("spinbutton", { name: "Куплено вручную" })).toHaveValue(7);
  });
});
