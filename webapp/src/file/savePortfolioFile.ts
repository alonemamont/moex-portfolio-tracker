import { PortfolioFile } from "../types";

function serialize(file: PortfolioFile): string {
  return JSON.stringify(file, null, 2);
}

export async function saveViaFileSystemAccess(
  file: PortfolioFile,
  handle: FileSystemFileHandle
): Promise<void> {
  const writable = await (handle as any).createWritable();
  await writable.write(serialize(file));
  await writable.close();
}

export async function saveViaFileSystemAccessNew(file: PortfolioFile): Promise<FileSystemFileHandle> {
  const handle = await (window as any).showSaveFilePicker({
    suggestedName: "portfolio.json",
    types: [{ description: "Portfolio JSON", accept: { "application/json": [".json"] } }],
  });
  await saveViaFileSystemAccess(file, handle);
  return handle;
}

export function downloadPortfolioFile(file: PortfolioFile, filename = "portfolio.json"): void {
  const blob = new Blob([serialize(file)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
