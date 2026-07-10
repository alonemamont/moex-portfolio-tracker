import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchIndexComposition } from "./client";

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
