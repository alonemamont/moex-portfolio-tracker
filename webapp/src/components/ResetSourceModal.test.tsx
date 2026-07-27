import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResetSourceModal } from "./ResetSourceModal";

const options = [
  { key: "manual", label: "Ручные позиции", count: 2 },
  { key: "conn1", label: "Т-Банк", count: 0 },
  { key: "conn2", label: "Финам", count: 1 },
];

describe("ResetSourceModal", () => {
  it("renders one option per entry with its count in the label", () => {
    render(<ResetSourceModal options={options} onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Ручные позиции (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Т-Банк (0)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Финам (1)" })).toBeInTheDocument();
  });

  it("disables an option whose count is 0", () => {
    render(<ResetSourceModal options={options} onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Т-Банк (0)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ручные позиции (2)" })).not.toBeDisabled();
  });

  it("calls onSelect with the option's key when an enabled option is clicked", () => {
    const onSelect = vi.fn();
    render(<ResetSourceModal options={options} onSelect={onSelect} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Финам (1)" }));
    expect(onSelect).toHaveBeenCalledWith("conn2");
  });

  it("calls onClose when Отмена is clicked", () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(<ResetSourceModal options={options} onSelect={onSelect} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
