import { describe, it, expect, vi } from "vitest";
import { saveViaFileSystemAccess, downloadPortfolioFile } from "./savePortfolioFile";
import { PortfolioFile } from "../types";

const sample: PortfolioFile = { version: 1, positions: [], sectors: {}, history: [], pairs: [], brokerConnections: [] };

describe("saveViaFileSystemAccess", () => {
  it("writes the JSON-serialized file to the given handle and closes the writable", async () => {
    const write = vi.fn();
    const close = vi.fn();
    const handle = {
      createWritable: vi.fn(async () => ({ write, close })),
    } as unknown as FileSystemFileHandle;

    await saveViaFileSystemAccess(sample, handle);

    expect(write).toHaveBeenCalledWith(JSON.stringify(sample, null, 2));
    expect(close).toHaveBeenCalled();
  });
});

describe("downloadPortfolioFile", () => {
  it("creates and clicks an anchor pointing at a blob URL, then revokes it", () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const click = vi.fn();
    const anchor = { click, href: "", download: "" } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    downloadPortfolioFile(sample, "portfolio.json");

    expect(anchor.href).toBe("blob:mock-url");
    expect(anchor.download).toBe("portfolio.json");
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
