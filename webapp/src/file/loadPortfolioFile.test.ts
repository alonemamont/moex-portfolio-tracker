// webapp/src/file/loadPortfolioFile.test.ts
import { describe, it, expect } from "vitest";
import { isFileSystemAccessSupported, loadViaInputFile } from "./loadPortfolioFile";
import { PortfolioFileValidationError } from "./schema";

const validJson = JSON.stringify({
  version: 1,
  positions: [{ ticker: "SBER", coefficient: 1, sharesOwned: 0 }],
  sectors: {},
  history: [],
});

function makeFile(content: string): File {
  return new File([content], "portfolio.json", { type: "application/json" });
}

describe("isFileSystemAccessSupported", () => {
  it("reflects whether window.showOpenFilePicker exists", () => {
    expect(isFileSystemAccessSupported()).toBe(typeof (window as any).showOpenFilePicker === "function");
  });
});

describe("loadViaInputFile", () => {
  it("parses a valid portfolio JSON file", async () => {
    const file = await loadViaInputFile(makeFile(validJson));
    expect(file.positions).toHaveLength(1);
  });

  it("throws PortfolioFileValidationError for invalid JSON text", async () => {
    await expect(loadViaInputFile(makeFile("{not json"))).rejects.toThrow(PortfolioFileValidationError);
  });

  it("throws PortfolioFileValidationError for JSON that fails schema validation", async () => {
    await expect(loadViaInputFile(makeFile(JSON.stringify({ version: 2 })))).rejects.toThrow(
      PortfolioFileValidationError
    );
  });
});
