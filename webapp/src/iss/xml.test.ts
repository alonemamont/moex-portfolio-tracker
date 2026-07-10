import { describe, it, expect } from "vitest";
import { parseIssDataBlock } from "./xml";

const compositionXml = `<?xml version="1.0" encoding="UTF-8"?>
<document>
<data id="analytics">
<rows>
<row indexid="IMOEX" ticker="GAZP" shortnames="ГАЗПРОМ ао" weight="9.32" />
<row indexid="IMOEX" ticker="SBER" shortnames="Сбербанк" weight="5.1" />
</rows>
</data>
</document>`;

describe("parseIssDataBlock", () => {
  it("parses rows within the named data block into attribute maps", () => {
    const rows = parseIssDataBlock(compositionXml, "analytics");
    expect(rows).toEqual([
      { indexid: "IMOEX", ticker: "GAZP", shortnames: "ГАЗПРОМ ао", weight: "9.32" },
      { indexid: "IMOEX", ticker: "SBER", shortnames: "Сбербанк", weight: "5.1" },
    ]);
  });

  it("throws when the named data block is missing", () => {
    expect(() => parseIssDataBlock(compositionXml, "marketdata")).toThrow(
      /data block "marketdata" not found/
    );
  });

  it("throws on malformed XML", () => {
    expect(() => parseIssDataBlock("<document><data", "analytics")).toThrow(
      /ISS XML parse error/
    );
  });

  it("returns an empty array when the data block has no rows", () => {
    const empty = `<document><data id="analytics"><rows></rows></data></document>`;
    expect(parseIssDataBlock(empty, "analytics")).toEqual([]);
  });
});
