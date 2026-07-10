import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchIndexComposition, fetchSecurities, fetchLatestDividend, fetchDividendsForTickers } from "./client";

const compositionXml = `<?xml version="1.0" encoding="UTF-8"?>
<document>
<data id="analytics">
<rows>
<row indexid="IMOEX" tradedate="2026-07-09" ticker="GAZP" shortnames="ГАЗПРОМ ао" secids="GAZP" weight="9.32" />
<row indexid="IMOEX" tradedate="2026-07-09" ticker="SBER" shortnames="Сбербанк" secids="SBER" weight="5.1" />
</rows>
</data>
</document>`;

describe("fetchIndexComposition", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("limit=100");
        return new Response(compositionXml, { status: 200 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses ticker/shortName/weight from the analytics data block", async () => {
    const result = await fetchIndexComposition();
    expect(result).toEqual([
      { ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 9.32 },
      { ticker: "SBER", shortName: "Сбербанк", weight: 5.1 },
    ]);
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 }))
    );
    await expect(fetchIndexComposition()).rejects.toThrow(/composition request failed/);
  });
});

const securitiesXml = `<?xml version="1.0" encoding="UTF-8"?>
<document>
<data id="securities">
<rows>
<row SECID="GAZP" BOARDID="TQBR" SHORTNAME="ГАЗПРОМ ао" PREVPRICE="93.2" LOTSIZE="10" />
<row SECID="SBER" BOARDID="TQBR" SHORTNAME="Сбербанк" PREVPRICE="294.54" LOTSIZE="1" />
<row SECID="DLST" BOARDID="TQBR" SHORTNAME="Делистнутая" PREVPRICE="10" LOTSIZE="1" />
</rows>
</data>
<data id="marketdata">
<rows>
<row SECID="GAZP" BOARDID="TQBR" LAST="92.79" />
<row SECID="SBER" BOARDID="TQBR" LAST="" />
<row SECID="DLST" BOARDID="TQBR" LAST="" />
</rows>
</data>
</document>`;

describe("fetchSecurities", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("limit=100");
        expect(url).toContain("securities=GAZP,SBER,DLST");
        return new Response(securitiesXml, { status: 200 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers LAST when present, falls back to PREVPRICE when LAST is empty", async () => {
    const result = await fetchSecurities(["GAZP", "SBER", "DLST"]);
    expect(result.get("GAZP")).toEqual({ shortName: "ГАЗПРОМ ао", price: 92.79, lotSize: 10 });
    expect(result.get("SBER")).toEqual({ shortName: "Сбербанк", price: 294.54, lotSize: 1 });
    expect(result.get("DLST")).toEqual({ shortName: "Делистнутая", price: 10, lotSize: 1 });
  });

  it("returns an empty map without a network call for an empty ticker list", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const result = await fetchSecurities([]);
    expect(result.size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});

const dividendsXml = (rows: string) => `<?xml version="1.0" encoding="UTF-8"?>
<document><data id="dividends"><rows>${rows}</rows></data></document>`;

describe("fetchLatestDividend", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the value of the row with the latest registryclosedate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          dividendsXml(
            `<row secid="SBER" registryclosedate="2024-07-11" value="33.3" />` +
              `<row secid="SBER" registryclosedate="2025-07-18" value="34.84" />` +
              `<row secid="SBER" registryclosedate="2021-05-12" value="18.7" />`
          ),
          { status: 200 }
        )
      )
    );
    await expect(fetchLatestDividend("SBER")).resolves.toBe(34.84);
  });

  it("returns 0 when there is no dividend history", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(dividendsXml(""), { status: 200 })));
    await expect(fetchLatestDividend("NEWIPO")).resolves.toBe(0);
  });
});

describe("fetchDividendsForTickers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves 0 for a ticker whose request fails, without failing the whole batch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/BROKEN/")) return new Response("", { status: 500 });
        return new Response(dividendsXml(`<row secid="SBER" registryclosedate="2025-07-18" value="34.84" />`), {
          status: 200,
        });
      })
    );
    const result = await fetchDividendsForTickers(["SBER", "BROKEN"], 2);
    expect(result.get("SBER")).toBe(34.84);
    expect(result.get("BROKEN")).toBe(0);
  });
});
