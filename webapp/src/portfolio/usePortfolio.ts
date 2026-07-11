import { createContext, useContext } from "react";
import { PortfolioFile, LiveData } from "../types";

export interface PortfolioContextValue {
  file: PortfolioFile | null;
  setFile: (file: PortfolioFile) => void;
  fileHandle: FileSystemFileHandle | null;
  setFileHandle: (handle: FileSystemFileHandle | null) => void;
  liveByTicker: Map<string, LiveData>;
  setLiveByTicker: (liveByTicker: Map<string, LiveData>) => void;
}

export const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within a PortfolioProvider");
  return ctx;
}
