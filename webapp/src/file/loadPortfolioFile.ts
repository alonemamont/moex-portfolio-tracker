import { PortfolioFile } from "../types";
import { parsePortfolioFile, PortfolioFileValidationError } from "./schema";

export function isFileSystemAccessSupported(): boolean {
  return typeof (window as any).showOpenFilePicker === "function";
}

async function fileToText(file: File): Promise<string> {
  // Try modern API first (browser)
  if (typeof file.text === "function") {
    return await file.text();
  }
  // Fallback to FileReader for jsdom and older environments
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      reject(reader.error);
    };
    reader.readAsText(file);
  });
}

async function parseFileContents(text: string): Promise<PortfolioFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new PortfolioFileValidationError("Файл не является корректным JSON");
  }
  return parsePortfolioFile(raw);
}

export async function loadViaInputFile(file: File): Promise<PortfolioFile> {
  const text = await fileToText(file);
  return parseFileContents(text);
}

export async function loadViaFileSystemAccess(): Promise<{
  file: PortfolioFile;
  handle: FileSystemFileHandle;
}> {
  const [handle] = await (window as any).showOpenFilePicker({
    types: [{ description: "Portfolio JSON", accept: { "application/json": [".json"] } }],
  });
  const fileObject: File = await handle.getFile();
  const text = await fileToText(fileObject);
  const file = await parseFileContents(text);
  return { file, handle };
}
