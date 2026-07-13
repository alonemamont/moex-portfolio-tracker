import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorProvider } from "../errors/ErrorContext";
import { PortfolioProvider } from "../portfolio/PortfolioContext";
import { Header } from "./Header";

function renderHeader() {
  return render(
    <ErrorProvider>
      <PortfolioProvider>
        <Header onFileLoaded={vi.fn()} />
      </PortfolioProvider>
    </ErrorProvider>
  );
}

describe("Header mobile menu", () => {
  it("keeps the actions dropdown closed by default", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "Меню" })).toBeInTheDocument();
    expect(document.querySelector(".header__actions--open")).toBeNull();
  });

  it("opens the actions dropdown on tap, and closes it again on a second tap", () => {
    renderHeader();
    const menuButton = screen.getByRole("button", { name: "Меню" });

    fireEvent.click(menuButton);
    expect(document.querySelector(".header__actions--open")).not.toBeNull();

    fireEvent.click(menuButton);
    expect(document.querySelector(".header__actions--open")).toBeNull();
  });

  it("closes the dropdown after tapping an action", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    fireEvent.click(screen.getByRole("button", { name: "Начать с пустого портфеля" }));
    expect(document.querySelector(".header__actions--open")).toBeNull();
  });
});
