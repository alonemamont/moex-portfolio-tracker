import { afterEach, describe, expect, it, vi } from "vitest";

const { tauriState, tauriFetch } = vi.hoisted(() => ({
  tauriState: { runtime: true },
  tauriFetch: vi.fn(),
}));

vi.mock("../runtime/isTauriRuntime", () => ({
  isTauriRuntime: () => tauriState.runtime,
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: tauriFetch,
}));

import { fetchIndexComposition, fetchSecurities } from "./client";

afterEach(() => {
  tauriState.runtime = true;
  tauriFetch.mockReset();
  vi.unstubAllGlobals();
});

describe("ISS client in Tauri runtime", () => {
  it("uses Tauri HTTP transport for securities requests", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("browser fetch must not run"))));
    tauriFetch.mockResolvedValueOnce(
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<document>
<data id="securities"><rows><row SECID="GAZP" SHORTNAME="Газпром" PREVPRICE="100" LOTSIZE="10" /></rows></data>
<data id="marketdata"><rows><row SECID="GAZP" LAST="101" /></rows></data>
</document>`,
        { status: 200 }
      )
    );

    const result = await fetchSecurities(["GAZP"]);

    expect(result.get("GAZP")).toEqual({ shortName: "Газпром", price: 101, lotSize: 10 });
    expect(tauriFetch).toHaveBeenCalledOnce();
  });

  it("uses Tauri HTTP transport for index composition requests", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("browser fetch must not run"))));
    tauriFetch.mockResolvedValueOnce(
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<document>
<data id="analytics"><rows><row ticker="GAZP" shortnames="Газпром ао" weight="9.32" /></rows></data>
</document>`,
        { status: 200 }
      )
    );

    const result = await fetchIndexComposition("IMOEX");

    expect(result).toEqual([{ ticker: "GAZP", shortName: "Газпром ао", weight: 9.32 }]);
    expect(tauriFetch).toHaveBeenCalledOnce();
  });
});
