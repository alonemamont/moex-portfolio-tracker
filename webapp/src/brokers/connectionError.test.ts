import { describe, it, expect } from "vitest";
import { describeBrokerConnectionError } from "./connectionError";
import { BrokerAdapter } from "./types";

const adapterWithHint: BrokerAdapter = {
  id: "tbank",
  label: "Т-Банк",
  networkErrorHint: "Install the certificate from example.com/crt.",
  listAccounts: async () => [],
  fetchHoldings: async () => [],
};

const adapterWithoutHint: BrokerAdapter = {
  id: "finam",
  label: "Финам",
  listAccounts: async () => [],
  fetchHoldings: async () => [],
};

describe("describeBrokerConnectionError", () => {
  it("appends the adapter's network error hint for a raw fetch-level TypeError", () => {
    const message = describeBrokerConnectionError(adapterWithHint, new TypeError("NetworkError when attempting to fetch resource."));
    expect(message).toBe(
      "Не удалось подключиться, возможно ограничение брокера: NetworkError when attempting to fetch resource. Install the certificate from example.com/crt."
    );
  });

  it("does not append a hint for an HTTP-status error from the broker", () => {
    const message = describeBrokerConnectionError(adapterWithHint, new Error("T-Invest API request failed: 429"));
    expect(message).toBe("Не удалось подключиться, возможно ограничение брокера: T-Invest API request failed: 429");
  });

  it("does not append a hint when the adapter has none", () => {
    const message = describeBrokerConnectionError(adapterWithoutHint, new TypeError("Failed to fetch"));
    expect(message).toBe("Не удалось подключиться, возможно ограничение брокера: Failed to fetch");
  });

  it("does not append a hint when no adapter is resolved", () => {
    const message = describeBrokerConnectionError(undefined, new TypeError("Failed to fetch"));
    expect(message).toBe("Не удалось подключиться, возможно ограничение брокера: Failed to fetch");
  });
});
